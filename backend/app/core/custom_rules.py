# app/core/custom_rules.py
# Compiles custom rules (dashboard) into ONE JavaScript-compatible regex (source + flags).
# The extension uses this result exclusively – this is the single source of truth.
#
# Only a subset is generated that behaves identically in JS (without the u flag) and in
# Python with re.ASCII; the sanity checks and the tests rely on that.

import json
import re
import subprocess
import sys
from dataclasses import dataclass
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError

try:  # Python >= 3.11
    from re import _constants as sre_c, _parser as sre_parse
except ImportError:  # pragma: no cover
    import sre_constants as sre_c
    import sre_parse

KINDS = ('keywords', 'prefix', 'pattern', 'regex')

# Time budget for the ReDoS test per sample string
REGEX_BUDGET_MS = 100
# Hard upper limit for the whole check process (including interpreter startup)
REGEX_CHECK_TIMEOUT_S = 3.0


class RuleError(ValueError):
    """Validation error with an i18n key; the API translates it into a 422."""

    def __init__(self, key: str, **params):
        super().__init__(key)
        self.key = key
        self.params = params


# ── Config schemas ────────────────────────────────────────────────

class _Strict(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)


class KeywordsConfig(_Strict):
    words:          list[Annotated[str, Field(min_length=1, max_length=64)]] = Field(min_length=1, max_length=50)
    case_sensitive: bool = False
    whole_word:     bool = True


class PrefixConfig(_Strict):
    prefix:     str = Field(min_length=2, max_length=32)
    charset:    Literal['alnum', 'hex', 'base64url', 'digits']
    min_length: int = Field(ge=4, le=128)
    max_length: int = Field(ge=4, le=256)


class PatternConfig(_Strict):
    template: str = Field(min_length=1, max_length=64)


class RegexConfig(_Strict):
    pattern:        str = Field(min_length=1, max_length=512)
    case_sensitive: bool = True


_SCHEMAS: dict[str, type[_Strict]] = {
    'keywords': KeywordsConfig,
    'prefix':   PrefixConfig,
    'pattern':  PatternConfig,
    'regex':    RegexConfig,
}


def _loc(loc: tuple) -> str:
    out = ''
    for part in loc:
        out += f'[{part}]' if isinstance(part, int) else (f'.{part}' if out else str(part))
    return out or 'config'


def _pydantic_error(exc: ValidationError) -> RuleError:
    err = exc.errors(include_url=False)[0]
    field = _loc(err.get('loc', ()))
    kind = err.get('type', '')
    ctx = err.get('ctx') or {}
    if kind == 'missing':
        return RuleError('custom_rules.field_missing', field=field)
    if kind == 'extra_forbidden':
        return RuleError('custom_rules.field_unknown', field=field)
    if kind == 'string_too_short':
        return RuleError('custom_rules.field_too_short', field=field, min=ctx.get('min_length'))
    if kind == 'string_too_long':
        return RuleError('custom_rules.field_too_long', field=field, max=ctx.get('max_length'))
    if kind == 'too_short':
        return RuleError('custom_rules.list_too_short', field=field, min=ctx.get('min_length'))
    if kind == 'too_long':
        return RuleError('custom_rules.list_too_long', field=field, max=ctx.get('max_length'))
    if kind == 'greater_than_equal':
        return RuleError('custom_rules.field_too_small', field=field, min=ctx.get('ge'))
    if kind == 'less_than_equal':
        return RuleError('custom_rules.field_too_large', field=field, max=ctx.get('le'))
    if kind == 'literal_error':
        return RuleError('custom_rules.field_choice', field=field, choices=ctx.get('expected', ''))
    if kind.endswith('_type') or kind.endswith('_parsing'):
        return RuleError('custom_rules.field_type', field=field)
    return RuleError('custom_rules.field_invalid', field=field)


def validate_config(kind: Any, config: Any) -> BaseModel:
    if kind not in KINDS:
        raise RuleError('custom_rules.field_choice', field='kind', choices=', '.join(KINDS))
    if not isinstance(config, dict):
        raise RuleError('custom_rules.config_not_object')
    try:
        return _SCHEMAS[kind].model_validate(config)
    except ValidationError as exc:
        raise _pydantic_error(exc) from None


# ── Building blocks ───────────────────────────────────────────────

# Characters that must be escaped outside of classes in both JS and Python
_SPECIAL = set('\\^$.*+?()[]{}|/')
_WORD = re.compile(r'[A-Za-z0-9_]')


def js_escape(text: str) -> str:
    out = []
    for ch in text:
        if ch in _SPECIAL:
            out.append('\\' + ch)
        elif ch == '\n':
            out.append('\\n')
        elif ch == '\r':
            out.append('\\r')
        elif ch == '\t':
            out.append('\\t')
        else:
            out.append(ch)
    return ''.join(out)


def _is_word(ch: str) -> bool:
    return bool(_WORD.fullmatch(ch))


_CHARSETS = {
    'alnum':     '[A-Za-z0-9]',
    'hex':       '[0-9a-fA-F]',
    'base64url': '[A-Za-z0-9_-]',
    'digits':    '[0-9]',
}
# What must not follow the token (otherwise it would match inside a longer token)
_TAIL_GUARD = {
    'alnum':     '(?![A-Za-z0-9_])',
    'hex':       '(?![A-Za-z0-9_])',
    'base64url': '(?![A-Za-z0-9_-])',
    'digits':    '(?![A-Za-z0-9_])',
}
_PLACEHOLDERS = {'#': '[0-9]', 'A': '[A-Z]', 'a': '[a-z]', '*': '[A-Za-z0-9]'}


def _compile_keywords(cfg: KeywordsConfig) -> tuple[str, str]:
    seen, words = set(), []
    for word in cfg.words:
        word = word.strip()
        if not word:
            raise RuleError('custom_rules.keyword_blank')
        norm = word if cfg.case_sensitive else word.lower()
        if norm not in seen:
            seen.add(norm)
            words.append(word)
    # Longer words first, so "Project Phoenix" matches before "Project"
    words.sort(key=len, reverse=True)
    parts = []
    for word in words:
        # Whitespace in the keyword matches any whitespace (line breaks in the clipboard)
        body = r'\s+'.join(js_escape(chunk) for chunk in word.split())
        if cfg.whole_word:
            body = (r'\b' if _is_word(word[0]) else '') + body + (r'\b' if _is_word(word[-1]) else '')
        parts.append(body)
    return '(?:' + '|'.join(parts) + ')', 'g' if cfg.case_sensitive else 'gi'


def _compile_prefix(cfg: PrefixConfig) -> tuple[str, str]:
    if cfg.max_length < cfg.min_length:
        raise RuleError('custom_rules.max_below_min')
    head = r'\b' if _is_word(cfg.prefix[0]) else ''
    return (f'{head}{js_escape(cfg.prefix)}{_CHARSETS[cfg.charset]}'
            f'{{{cfg.min_length},{cfg.max_length}}}{_TAIL_GUARD[cfg.charset]}'), 'g'


def _compile_template(cfg: PatternConfig) -> tuple[str, str]:
    tokens: list[tuple[str, bool]] = []  # (regex piece, word character?)
    has_placeholder = False
    text, i = cfg.template, 0
    while i < len(text):
        ch = text[i]
        if ch == '\\':
            if i + 1 >= len(text):
                raise RuleError('custom_rules.template_trailing_escape')
            lit = text[i + 1]
            tokens.append((js_escape(lit), _is_word(lit)))
            i += 2
            continue
        if ch in _PLACEHOLDERS:
            tokens.append((_PLACEHOLDERS[ch], True))
            has_placeholder = True
        else:
            tokens.append((js_escape(ch), _is_word(ch)))
        i += 1
    if not has_placeholder:
        raise RuleError('custom_rules.template_no_placeholder')

    # Merge identical placeholders: ###### → [0-9]{6}
    out, j = [], 0
    while j < len(tokens):
        piece, _word = tokens[j]
        run = 1
        while j + run < len(tokens) and tokens[j + run][0] == piece:
            run += 1
        if piece in _PLACEHOLDERS.values():
            out.append(piece if run == 1 else f'{piece}{{{run}}}')
        else:
            out.append(piece * run)
        j += run
    head = r'\b' if tokens[0][1] else ''
    tail = r'\b' if tokens[-1][1] else ''
    return head + ''.join(out) + tail, 'g'


# ── Regex validation ──────────────────────────────────────────────

def _scan_syntax(pattern: str) -> None:
    """Reject constructs that behave differently (or not at all) in JS, as well as backreferences."""
    i, in_class = 0, False
    while i < len(pattern):
        ch = pattern[i]
        if ch == '\\':
            nxt = pattern[i + 1] if i + 1 < len(pattern) else ''
            if nxt in '123456789' or nxt == 'k':
                raise RuleError('custom_rules.regex_backreference')
            if nxt and nxt in 'AZzaUNGQE':
                raise RuleError('custom_rules.regex_unsupported', construct='\\' + nxt)
            i += 2
            continue
        if in_class:
            if ch == ']':
                in_class = False
        elif ch == '[':
            in_class = True
            # "[]" / "[^]" mean something different in JS than in Python
            rest = pattern[i + 1:]
            if rest.startswith(']') or rest.startswith('^]'):
                raise RuleError('custom_rules.regex_unsupported', construct='[]')
            if rest.startswith('^'):
                i += 1
        elif ch == '(' and pattern.startswith('(?', i):
            ext = pattern[i + 2:i + 4]
            if ext[:1] in (':', '=', '!') or ext in ('<=', '<!'):
                pass
            elif ext[:1] == 'P' and pattern.startswith('(?P=', i):
                raise RuleError('custom_rules.regex_backreference')
            elif ext[:1] and ext[:1] in 'aiLmsux-':
                raise RuleError('custom_rules.regex_inline_flags')
            else:
                raise RuleError('custom_rules.regex_unsupported', construct='(?' + ext[:1])
        elif ch == '{' and pattern.startswith('{,', i):
            raise RuleError('custom_rules.regex_unsupported', construct='{,')
        i += 1


_REPEATS = {sre_c.MAX_REPEAT, sre_c.MIN_REPEAT}
_ALL = frozenset(range(257))  # 256 = any non-Latin-1 character
_CATEGORY_SETS = {
    sre_c.CATEGORY_DIGIT: frozenset(range(48, 58)),
    sre_c.CATEGORY_WORD:  frozenset(ord(c) for c in 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_'),
    sre_c.CATEGORY_SPACE: frozenset(ord(c) for c in ' \t\n\r\f\v'),
}


def _unbounded(hi: int) -> bool:
    return hi == sre_c.MAXREPEAT


def _children(op, av) -> list:
    if op in _REPEATS:
        return [av[2]]
    if op == sre_c.SUBPATTERN:
        return [av[3]]
    if op == sre_c.BRANCH:
        return list(av[1])
    if op in (sre_c.ASSERT, sre_c.ASSERT_NOT):
        return [av[1]]
    return []


def _has_variable_repeat(seq) -> bool:
    for op, av in seq:
        if op in _REPEATS and av[0] != av[1]:
            return True
        if any(_has_variable_repeat(c) for c in _children(op, av)):
            return True
    return False


def _nullable(seq) -> bool:
    for op, av in seq:
        if op in (sre_c.AT, sre_c.ASSERT, sre_c.ASSERT_NOT):
            continue
        if op in _REPEATS:
            if av[0] == 0 or _nullable(av[2]):
                continue
            return False
        if op == sre_c.SUBPATTERN:
            if _nullable(av[3]):
                continue
            return False
        if op == sre_c.BRANCH:
            if any(_nullable(b) for b in av[1]):
                continue
            return False
        return False
    return True


def _in_set(items) -> frozenset:
    chars: set[int] = set()
    negate = False
    for op, av in items:
        if op == sre_c.NEGATE:
            negate = True
        elif op == sre_c.LITERAL:
            chars.add(min(av, 256))
        elif op == sre_c.RANGE:
            lo, hi = av
            chars.update(range(min(lo, 256), min(hi, 256) + 1))
        elif op == sre_c.CATEGORY and av in _CATEGORY_SETS:
            chars.update(_CATEGORY_SETS[av])
        else:
            return _ALL
    return _ALL - chars if negate else frozenset(chars)


def _first_set(seq) -> frozenset:
    """Rough set of possible first characters (for overlap between alternatives)."""
    out: set[int] = set()
    for op, av in seq:
        if op == sre_c.LITERAL:
            out.add(min(av, 256))
            return frozenset(out)
        if op == sre_c.IN:
            return frozenset(out | _in_set(av))
        if op in (sre_c.AT, sre_c.ASSERT, sre_c.ASSERT_NOT):
            continue
        if op in _REPEATS:
            out |= _first_set(av[2])
            if av[0] == 0 or _nullable(av[2]):
                continue
            return frozenset(out)
        if op == sre_c.SUBPATTERN:
            out |= _first_set(av[3])
            if _nullable(av[3]):
                continue
            return frozenset(out)
        if op == sre_c.BRANCH:
            for b in av[1]:
                out |= _first_set(b)
            if any(_nullable(b) for b in av[1]):
                continue
            return frozenset(out)
        return _ALL  # ANY, NOT_LITERAL, CATEGORY …
    return frozenset(out)


def _fold(chars: frozenset) -> frozenset:
    out = set(chars)
    for c in chars:
        if 65 <= c <= 90 or 97 <= c <= 122:
            out.add(c ^ 0x20)
    return frozenset(out)


def _groups(pattern: str) -> list[tuple[int, int, list[int], int]]:
    """Groups in the source: (content start, content end, positions of top-level '|',
    upper bound of the following quantifier; 1 = no quantifier)."""
    groups, stack = [], []
    i, in_class = 0, False
    while i < len(pattern):
        ch = pattern[i]
        if ch == '\\':
            i += 2
            continue
        if in_class:
            in_class = ch != ']'
        elif ch == '[':
            in_class = True
            if pattern.startswith('^', i + 1):
                i += 1
        elif ch == '(':
            start = i + 1
            m = re.match(r'\?(?::|=|!|<=|<!)', pattern[start:])
            stack.append((m.end() + start if m else start, []))
        elif ch == '|' and stack:
            stack[-1][1].append(i)
        elif ch == ')' and stack:
            start, bars = stack.pop()
            q = re.match(r'[*+]|\{(\d+)(,(\d*))?\}', pattern[i + 1:])
            if not q:
                hi = 1
            elif q.group(0) in '*+':
                hi = sre_c.MAXREPEAT
            elif q.group(2) is None:
                hi = int(q.group(1))
            else:
                hi = int(q.group(3)) if q.group(3) else sre_c.MAXREPEAT
            groups.append((start, i, bars, hi))
        i += 1
    return groups


def _alternatives_overlap(pattern: str, start: int, end: int, bars: list[int], flags: int) -> bool:
    bounds = [start - 1] + bars + [end]
    firsts, nullable = [], 0
    for x in range(len(bounds) - 1):
        tree = list(sre_parse.parse(pattern[bounds[x] + 1:bounds[x + 1]], flags))
        nullable += _nullable(tree)
        first = _first_set(tree)
        firsts.append(_fold(first) if flags & re.IGNORECASE else first)
    if nullable > 1:
        return True
    return any(firsts[x] & firsts[y] for x in range(len(firsts)) for y in range(x + 1, len(firsts)))


def _check_alternations(pattern: str, flags: int) -> None:
    # Intentionally on the source text: sre merges e.g. (b|[bc]) into [bc], V8 does not.
    groups = _groups(pattern)
    for start, end, _bars, hi in groups:
        if not (hi == sre_c.MAXREPEAT or hi > 16):
            continue
        for s2, e2, bars2, _hi2 in groups:
            if bars2 and start <= s2 and e2 <= end and \
                    _alternatives_overlap(pattern, s2, e2, bars2, flags):
                raise RuleError('custom_rules.regex_ambiguous_alternation')


def _check_tree(seq) -> None:
    for op, av in seq:
        if op in (sre_c.GROUPREF, sre_c.GROUPREF_EXISTS):
            raise RuleError('custom_rules.regex_backreference')
        if op == sre_c.SUBPATTERN and (av[1] or av[2]):
            raise RuleError('custom_rules.regex_inline_flags')
        if op in _REPEATS and av[1] > 1:
            inner = av[2]
            if _unbounded(av[1]) or av[1] > 16:
                if _has_variable_repeat(inner) or _nullable(inner):
                    raise RuleError('custom_rules.regex_nested_quantifier')
        if op not in _REPEATS | {sre_c.SUBPATTERN, sre_c.BRANCH, sre_c.ASSERT, sre_c.ASSERT_NOT,
                                 sre_c.LITERAL, sre_c.NOT_LITERAL, sre_c.IN, sre_c.ANY, sre_c.AT,
                                 sre_c.CATEGORY}:
            raise RuleError('custom_rules.regex_unsupported', construct=str(op))
        for child in _children(op, av):
            _check_tree(child)


def _literal_chars(seq, acc: set[str]) -> None:
    for op, av in seq:
        if op == sre_c.LITERAL and av < 128:
            acc.add(chr(av))
        for child in _children(op, av):
            _literal_chars(child, acc)


# Runs in a separate interpreter: hard time limit independent of the thread
# (signals do not work in FastAPI's thread pool), and a hanging regex run
# does not block a worker.
_TIMING_SCRIPT = r'''
import json, re, signal, sys, time
data = json.load(sys.stdin)
rx = re.compile(data["pattern"], data["flags"])

def _abort(signum, frame):
    raise TimeoutError

# sre checks signals during matching → abort after the budget instead of minutes
signal.signal(signal.SIGALRM, _abort)
worst = 0.0
for s in data["samples"]:
    t = time.perf_counter()
    signal.setitimer(signal.ITIMER_REAL, data["budget"] / 1000 * 2)
    try:
        for _m in rx.finditer(s):
            pass
    except TimeoutError:
        worst = float("inf")
    finally:
        signal.setitimer(signal.ITIMER_REAL, 0)
    worst = max(worst, (time.perf_counter() - t) * 1000)
    if worst > data["budget"]:
        break
print(worst)
'''


def _adversarial_samples(tree) -> list[str]:
    chars: set[str] = set()
    _literal_chars(tree, chars)
    base = ['a' * 5000 + '!', 'A' * 5000 + '!', '1' * 5000 + '!', ' ' * 5000 + '!',
            'aA1_-.' * 833 + '!', 'a' * 2500 + '1' * 2500 + '!']
    base += [c * 5000 + '\x00' for c in sorted(chars)[:12]]
    return base


def _check_timing(pattern: str, flags: int, tree) -> None:
    payload = json.dumps({'pattern': pattern, 'flags': flags, 'budget': REGEX_BUDGET_MS,
                          'samples': _adversarial_samples(tree)})
    try:
        proc = subprocess.run([sys.executable, '-I', '-S', '-c', _TIMING_SCRIPT], input=payload,
                              capture_output=True, text=True, timeout=REGEX_CHECK_TIMEOUT_S)
        worst = float(proc.stdout.strip())
    except (subprocess.TimeoutExpired, ValueError):
        raise RuleError('custom_rules.regex_too_slow') from None
    if worst > REGEX_BUDGET_MS:
        raise RuleError('custom_rules.regex_too_slow')


def _compile_regex(cfg: RegexConfig, check_safety: bool) -> tuple[str, str]:
    pattern = cfg.pattern
    flags = re.ASCII | (0 if cfg.case_sensitive else re.IGNORECASE)
    if check_safety:
        _scan_syntax(pattern)
    try:
        compiled = re.compile(pattern, flags)
        tree = sre_parse.parse(pattern, flags)
    except (re.error, ValueError, OverflowError, RecursionError) as exc:
        raise RuleError('custom_rules.regex_invalid', error=str(exc)) from None
    if check_safety:
        if tree.state.flags != sre_parse.parse('', flags).state.flags:
            raise RuleError('custom_rules.regex_inline_flags')
        _check_tree(list(tree))
        _check_alternations(pattern, flags)
        # Empty matches: the extension would trigger at every position or hang
        for sample in ('', ' ', 'a', 'A', '0', 'x y', '\n', 'abc123 !?-_.,;:/\\'):
            if any(m.end() == m.start() for m in compiled.finditer(sample)):
                raise RuleError('custom_rules.regex_empty_match')
        _check_timing(pattern, flags, list(tree))
    return pattern, 'g' if cfg.case_sensitive else 'gi'


# ── Entry point ───────────────────────────────────────────────────

@dataclass
class CompiledRule:
    pattern: str
    flags:   str
    config:  dict


def compile_rule(kind: Any, config: Any, check_safety: bool = True) -> CompiledRule:
    """Validate + compile a rule. check_safety=False only for rules that are already stored."""
    cfg = validate_config(kind, config)
    if kind == 'keywords':
        pattern, flags = _compile_keywords(cfg)
    elif kind == 'prefix':
        pattern, flags = _compile_prefix(cfg)
    elif kind == 'pattern':
        pattern, flags = _compile_template(cfg)
    else:
        pattern, flags = _compile_regex(cfg, check_safety)

    # Cross-check with Python re (same semantics as JS for the generated subset)
    try:
        re.compile(pattern, re.ASCII | (re.IGNORECASE if 'i' in flags else 0))
    except re.error as exc:  # pragma: no cover – would be a bug in the compiler above
        raise RuleError('custom_rules.regex_invalid', error=str(exc)) from None
    return CompiledRule(pattern=pattern, flags=flags, config=cfg.model_dump())


def python_regex(pattern: str, flags: str) -> re.Pattern:
    """Python counterpart of the delivered JS regex (tests, sanity checks)."""
    return re.compile(pattern, re.ASCII | (re.IGNORECASE if 'i' in flags else 0))
