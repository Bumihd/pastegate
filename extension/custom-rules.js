// ═══════════════════════════════════════════════════════
// Pastegate — custom-rules.js
// Rule matching (built-in + organization rules from the server).
// Loaded BEFORE content.js and included in background.js via importScripts
// (pgDiagnose). No DOM/chrome access; testable in Node via module.exports
// (tests/detect.test.js).
// ═══════════════════════════════════════════════════════

(function (root) {
  // Upper bounds against faulty or very broad organization rules.
  const MAX_CUSTOM_RULES      = 200;
  const MAX_PATTERN_LEN       = 2000;
  const MAX_RULE_ID_LEN       = 64;
  const MAX_MATCHES_PER_RULE  = 50;
  const CUSTOM_SEVERITIES     = ['critical', 'high', 'medium', 'low'];
  // 'y' (sticky) would pin the search to the start of the text; 'g' is enforced anyway.
  const ALLOWED_FLAGS         = 'imsu';

  function str(v, max) {
    return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;
  }

  // Server list -> compiled rules. Invalid entries are skipped.
  function compileCustomRules(list) {
    if (!Array.isArray(list)) return [];
    const out = [];
    const seen = new Set();
    for (const raw of list.slice(0, MAX_CUSTOM_RULES)) {
      if (!raw || typeof raw !== 'object') continue;
      // Backend: rule_id max. 64 chars (otherwise 422 for the whole batch)
      const id = typeof raw.rule_id === 'string' ? raw.rule_id.trim() : '';
      if (!id || id.length > MAX_RULE_ID_LEN || seen.has(id)) continue;
      if (typeof raw.pattern !== 'string' || !raw.pattern || raw.pattern.length > MAX_PATTERN_LEN) continue;
      const flags = 'g' + [...new Set(String(raw.flags || ''))].filter((f) => ALLOWED_FLAGS.includes(f)).join('');
      let pattern;
      try { pattern = new RegExp(raw.pattern, flags); } catch { continue; }
      seen.add(id);
      out.push({
        id,
        name:        str(raw.name, 200) || id,
        description: str(raw.description, 500) || '',
        severity:    CUSTOM_SEVERITIES.includes(raw.severity) ? raw.severity : 'medium',
        pattern,
        custom:      true,
      });
    }
    return out;
  }

  // Global copy of a built-in pattern (for rules with a validator), cached.
  function globalPattern(rule) {
    if (rule.pattern.global) return rule.pattern;
    if (!rule._g) rule._g = new RegExp(rule.pattern.source, rule.pattern.flags + 'g');
    return rule._g;
  }

  // First valid match of a rule, or null.
  // Without a validator and without 'g', a single exec() is enough. Otherwise up to
  // MAX_MATCHES_PER_RULE matches are checked; empty matches don't count and
  // lastIndex is advanced so that /a*/g and the like don't loop forever.
  function findRuleMatch(rule, text) {
    if (!rule.validator && !rule.pattern.global) {
      const m = rule.pattern.exec(text);
      return m && m[0] ? m : null;
    }
    const re = globalPattern(rule);
    re.lastIndex = 0;
    for (let i = 0; i < MAX_MATCHES_PER_RULE; i++) {
      const m = re.exec(text);
      if (!m) break;
      if (!m[0]) {
        re.lastIndex++;
        if (re.lastIndex > text.length) break;
        continue;
      }
      if (!rule.validator || rule.validator(m, text)) {
        re.lastIndex = 0;
        return m;
      }
    }
    re.lastIndex = 0;
    return null;
  }

  const api = {
    MAX_CUSTOM_RULES, MAX_PATTERN_LEN, MAX_RULE_ID_LEN, MAX_MATCHES_PER_RULE,
    compileCustomRules, findRuleMatch,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) {
    root.compileCustomRules = compileCustomRules;
    root.findRuleMatch      = findRuleMatch;
    root.PSCustomRules      = api;
  }
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this));
