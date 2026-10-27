# Installer functions, run in bash against temporary directories.
#
# install.sh executes its main flow at top level, so single functions (plus the
# helpers and arrays they use) are cut out of the script and run on their own.
# chown/chgrp/id are stubbed: the tests do not run as root.

import os
import stat
import subprocess

import pytest

INSTALL_SH = os.path.join(os.path.dirname(__file__), '..', '..', 'install.sh')

HELPERS = r'''
set -euo pipefail
info() { :; }; success() { :; }; warn() { :; }; header() { :; }
error() { echo "ERROR: $*" >&2; exit 1; }
chown() { :; }; chgrp() { :; }
'''


def _source() -> str:
    with open(INSTALL_SH, encoding='utf-8') as f:
        return f.read()


def _function(name: str) -> str:
    lines, out, inside = _source().splitlines(), [], False
    for line in lines:
        if line.startswith(f'{name}() {{'):
            inside = True
        if inside:
            out.append(line)
            if line == '}':
                return '\n'.join(out)
    raise AssertionError(f'function {name} not found in install.sh')


def _block(start: str, end: str) -> str:
    text = _source()
    i = text.index(start)
    return text[i:text.index(end, i) + len(end)]


def _run(script: str, **env) -> subprocess.CompletedProcess:
    return subprocess.run(['bash', '-c', script], capture_output=True, text=True,
                          env={**os.environ, **{k: str(v) for k, v in env.items()}})


def _mode(path) -> int:
    return stat.S_IMODE(os.lstat(path).st_mode)


ID_CONTAINER = 'id() { return 1; }'            # no service user: container case
ID_NATIVE = 'id() { [[ "${1:-}" == "-gn" ]] && echo pastegate; return 0; }'


# ── F1: symlinks ──────────────────────────────────────────────────

@pytest.mark.parametrize('id_stub,expected', [(ID_CONTAINER, 0o600), (ID_NATIVE, 0o640)])
def test_apply_permissions_does_not_follow_symlinks(tmp_path, id_stub, expected):
    inst = tmp_path / 'opt'
    (inst / 'backend').mkdir(parents=True)
    (inst / 'extension').mkdir()
    env = inst / 'backend' / '.env'
    env.write_text('SECRET_KEY=x\n')
    env.chmod(0o600)
    outside = tmp_path / 'shadow'
    outside.write_text('secret\n')
    outside.chmod(0o600)
    (inst / 'extension' / 'icon.png').symlink_to('../backend/.env')
    (inst / 'extension' / 'other.png').symlink_to(outside)
    code = inst / 'backend' / 'app.py'
    code.write_text('print(1)\n')
    code.chmod(0o600)

    r = _run(HELPERS + id_stub + '\n' + _function('apply_permissions') + '\napply_permissions',
             INSTALL_DIR=inst)
    assert r.returncode == 0, r.stderr
    assert _mode(env) == expected
    assert _mode(outside) == 0o600
    assert _mode(code) == 0o644


def test_apply_permissions_keeps_compose_private(tmp_path):
    inst = tmp_path / 'opt'
    (inst / 'backend').mkdir(parents=True)
    compose = inst / 'compose.yml'
    compose.write_text('POSTGRES_PASSWORD: x\n')
    compose.chmod(0o644)
    r = _run(HELPERS + ID_CONTAINER + '\n' + _function('apply_permissions') + '\napply_permissions',
             INSTALL_DIR=inst)
    assert r.returncode == 0, r.stderr
    assert _mode(compose) == 0o600


def test_source_with_symlink_is_refused(tmp_path):
    src = tmp_path / 'src'
    (src / 'extension').mkdir(parents=True)
    (src / 'extension' / 'x.png').symlink_to('../backend/.env')
    r = _run(HELPERS + _function('check_source_symlinks') + '\ncheck_source_symlinks', SRC_DIR=src)
    assert r.returncode != 0
    assert 'extension/x.png' in r.stderr


def test_symlinks_in_node_modules_and_hidden_dirs_are_allowed(tmp_path):
    src = tmp_path / 'src'
    (src / 'dashboard' / 'node_modules' / '.bin').mkdir(parents=True)
    (src / 'dashboard' / 'node_modules' / '.bin' / 'vite').symlink_to('../vite/bin/vite.js')
    (src / '.git').mkdir()
    (src / '.git' / 'link').symlink_to('/etc/hostname')
    r = _run(HELPERS + _function('check_source_symlinks') + '\ncheck_source_symlinks', SRC_DIR=src)
    assert r.returncode == 0, r.stderr


# ── F2: stale files from the old layout ──────────────────────────

def test_install_app_files_drops_planted_files_and_keeps_env(tmp_path):
    src = tmp_path / 'src'
    (src / 'backend' / 'app').mkdir(parents=True)
    (src / 'backend' / 'app' / 'main.py').write_text('app = 1\n')
    (src / 'extension').mkdir()
    (src / 'extension' / 'content.js').write_text('//\n')
    inst = tmp_path / 'opt'
    (inst / 'backend' / 'alembic' / 'versions').mkdir(parents=True)
    (inst / 'backend' / 'alembic' / 'versions' / 'zz_planted.py').write_text('import os\n')
    (inst / 'backend' / 'psycopg2').mkdir()
    (inst / 'extension').mkdir()
    (inst / 'extension' / 'old.js').write_text('//\n')
    (inst / 'backend' / '.env').write_text('HMAC_SALT=keep\n')

    script = (HELPERS
              + _block('INSTALL_EXCLUDES=(', ')') + '\n'
              + _block('STALE_PATHS=(', ')') + '\n'
              + _function('check_source_symlinks') + '\n'
              + _function('install_app_files') + '\ninstall_app_files')
    r = _run(script, SRC_DIR=src, INSTALL_DIR=inst)
    assert r.returncode == 0, r.stderr
    assert not (inst / 'backend' / 'alembic').exists()
    assert not (inst / 'backend' / 'psycopg2').exists()
    assert not (inst / 'extension' / 'old.js').exists()
    assert (inst / 'backend' / 'app' / 'main.py').read_text() == 'app = 1\n'
    assert (inst / 'backend' / '.env').read_text() == 'HMAC_SALT=keep\n'


# ── F4: forwarded headers ─────────────────────────────────────────

def test_nothing_trusts_forwarded_headers_from_everyone():
    text = _source()
    assert "FWD_ALLOW_IPS='*'" not in text
    assert 'FORWARDED_ALLOW_IPS=*' not in text
    # nginx passes exactly one value (its $remote_addr), never the client's header
    assert '$proxy_add_x_forwarded_for' not in text
    assert text.count('X-Forwarded-For \\$remote_addr;') >= 4


def _subnet_block() -> str:
    return _block('[[ -z "$CONTAINER_SUBNET" && -f', '$(( BASH_REMATCH[4] + 1 ))"')


@pytest.mark.parametrize('given,compose,expected', [
    ('', None, '10.231.250.0/24 10.231.250.1'),                      # default
    ('172.30.9.0/24', None, '172.30.9.0/24 172.30.9.1'),            # --container-subnet
    ('', '        - subnet: 10.50.0.0/24\n', '10.50.0.0/24 10.50.0.1'),  # --update keeps it
])
def test_container_subnet_selection(tmp_path, given, compose, expected):
    if compose:
        (tmp_path / 'compose.yml').write_text(compose)
    r = _run(HELPERS + _subnet_block() + '\necho "$CONTAINER_SUBNET $CONTAINER_GATEWAY"',
             INSTALL_DIR=tmp_path, CONTAINER_SUBNET=given)
    assert r.returncode == 0, r.stderr
    assert r.stdout.strip() == expected


@pytest.mark.parametrize('bad', ['10.231.250.0', 'fd00::/64', '10.0.0.0/31', 'x.y.z.0/24',
                                 '300.1.1.0/24', '10.0.0.010/24', '10.0.0.08/24', '10.0.0.0/0',
                                 '10.0.0.0/7', '10.0.0.254/24'])
def test_invalid_container_subnet_is_refused(tmp_path, bad):
    r = _run(HELPERS + _subnet_block(), INSTALL_DIR=tmp_path, CONTAINER_SUBNET=bad)
    assert r.returncode != 0 and 'Invalid --container-subnet' in r.stderr


def test_container_env_and_compose_trust_only_the_network_gateway(tmp_path):
    inst = tmp_path / 'opt'
    (inst / 'backend').mkdir(parents=True)
    script = (HELPERS
              + 'CONTAINER_SUBNET=10.231.250.0/24; CONTAINER_GATEWAY=10.231.250.1\n'
              + _function('write_env') + '\n' + _function('write_compose') + '\n'
              + 'FWD_ALLOW_IPS="$CONTAINER_GATEWAY" write_env db 5432\nwrite_compose')
    r = _run(script, INSTALL_DIR=inst, STATE_DIR=tmp_path / 'state', DB_PASS='pw',
             PROTO='https', DOMAIN='example.org')
    assert r.returncode == 0, r.stderr
    env = (inst / 'backend' / '.env').read_text()
    assert 'FORWARDED_ALLOW_IPS=10.231.250.1\n' in env
    compose = (inst / 'compose.yml').read_text()
    assert 'subnet: 10.231.250.0/24' in compose and 'gateway: 10.231.250.1' in compose
    assert _mode(inst / 'backend' / '.env') == 0o600
    assert _mode(inst / 'compose.yml') == 0o600


# ── Review of Block G: .env itself as a link, update order, terminal ──

@pytest.mark.parametrize('kind', ['symlink', 'hardlink'])
def test_apply_permissions_refuses_linked_env(tmp_path, kind):
    inst = tmp_path / 'opt'
    (inst / 'backend').mkdir(parents=True)
    target = tmp_path / 'shadow'
    target.write_text('root:x\n')
    target.chmod(0o600)
    env = inst / 'backend' / '.env'
    if kind == 'symlink':
        env.symlink_to(target)
    else:
        os.link(target, env)
    r = _run(HELPERS + ID_NATIVE + '\n' + _function('apply_permissions') + '\napply_permissions',
             INSTALL_DIR=inst)
    assert r.returncode != 0 and 'refusing to continue' in r.stderr
    assert _mode(target) == 0o600


def test_update_stops_service_before_replacing_code():
    body = _function('update_native')
    assert body.index('systemctl stop pastegate') < body.index('pkill -KILL -u pastegate') \
        < body.index('install_app_files')


def test_alembic_runs_in_own_session_without_terminal():
    body = _function('run_alembic')
    assert 'setsid -w runuser -u pastegate --' in body
    assert body.count('</dev/null') == 2
