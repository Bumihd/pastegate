#!/usr/bin/env bash
# Pastegate – install.sh
# Distro-agnostic installer (phase 1).
#
# Prefers containers (Podman, with Docker as fallback): app + PostgreSQL run as
# containers, so the host setup barely matters. Without a container runtime the
# native fallback with package manager detection kicks in (apt/dnf/zypper/pacman/apk).
#
# No admin account is created. Instead, the installer generates a SETUP_TOKEN;
# the first admin is then created via the browser setup wizard
# (/setup).
#
# Usage:
#   sudo bash install.sh                 # interactive
#   sudo bash install.sh --domain ps.example.com --tls letsencrypt --email a@b.de
#
# Flags (all optional – missing values are prompted for interactively):
#   --domain <fqdn>            Public domain (e.g. pastegate.example.com)
#   --ip <addr>               Additional server IP for server_name
#   --runtime <auto|podman|docker|native>   Runtime (default: auto)
#   --tls <own|letsencrypt|selfsigned|proxy> Certificate mode
#                             proxy = TLS terminates at an upstream proxy
#                             (gateway, Cloudflare, load balancer); nginx serves
#                             the app over HTTP on :80, without redirect
#   --trusted-proxy <ip[,ip]> Upstream proxies whose client IP header is trusted
#   --real-ip-header <name>   Header carrying the client IP (default X-Forwarded-For,
#                             behind Cloudflare: CF-Connecting-IP)
#   --cert-fullchain <path>   Path to fullchain.pem  (--tls own only)
#   --cert-key <path>         Path to privkey.pem    (--tls own only)
#   --email <addr>            Contact email for Let's Encrypt
#   --db-pass <pw>            PostgreSQL password (randomly generated otherwise)
#   --yes                     No prompts (non-interactive; use defaults)
#   -h | --help               Show this help

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

info()    { echo -e "${CYAN}  >${RESET} $*"; }
success() { echo -e "${GREEN}  ok${RESET} $*"; }
warn()    { echo -e "${YELLOW}  warn${RESET} $*"; }
error()   { echo -e "${RED}  error${RESET} $*"; exit 1; }
header()  { echo -e "\n${BOLD}── $* ${RESET}"; }

usage() { sed -n '2,40p' "$0" | sed 's/^# \{0,1\}//'; exit 0; }

INSTALL_DIR=/opt/pastegate
SRC_DIR="$(cd "$(dirname "$0")" && pwd)"

# ── Defaults / Flags ──────────────────────────────────────────────
DOMAIN=""; SERVER_IP=""; RUNTIME="auto"; TLS_MODE=""
CERT_FULLCHAIN=""; CERT_KEY=""; LE_EMAIL=""
DB_PASS=""; ASSUME_YES="no"
TRUSTED_PROXY=""; REAL_IP_HEADER="X-Forwarded-For"

while [[ $# -gt 0 ]]; do
    case "$1" in
        --domain)         DOMAIN="$2"; shift 2;;
        --ip)             SERVER_IP="$2"; shift 2;;
        --runtime)        RUNTIME="$2"; shift 2;;
        --tls)            TLS_MODE="$2"; shift 2;;
        --cert-fullchain) CERT_FULLCHAIN="$2"; shift 2;;
        --cert-key)       CERT_KEY="$2"; shift 2;;
        --email)          LE_EMAIL="$2"; shift 2;;
        --db-pass)        DB_PASS="$2"; shift 2;;
        --trusted-proxy)  TRUSTED_PROXY="$2"; shift 2;;
        --real-ip-header) REAL_IP_HEADER="$2"; shift 2;;
        --yes|-y)         ASSUME_YES="yes"; shift;;
        -h|--help)        usage;;
        *) error "Unknown argument: $1 (see --help)";;
    esac
done

ask() {  # ask <varname> <prompt> [default]  – honours --yes
    local __var="$1" __prompt="$2" __def="${3:-}" __val
    if [[ -n "${!__var:-}" ]]; then return; fi
    if [[ "$ASSUME_YES" == "yes" ]]; then printf -v "$__var" '%s' "$__def"; return; fi
    if [[ -n "$__def" ]]; then read -rp "  $__prompt [$__def]: " __val; else read -rp "  $__prompt: " __val; fi
    printf -v "$__var" '%s' "${__val:-$__def}"
}

# ── Root-Check ────────────────────────────────────────────────────
[[ $EUID -ne 0 ]] && error "Please run as root or with sudo."

# ── Package manager detection ─────────────────────────────────────
detect_pkg_mgr() {
    for pm in apt-get dnf zypper pacman apk; do
        command -v "$pm" &>/dev/null && { echo "$pm"; return; }
    done
    echo "none"
}
PKG_MGR="$(detect_pkg_mgr)"

# ── Runtime-Detection ─────────────────────────────────────────────
detect_runtime() {
    case "$RUNTIME" in
        podman|docker|native) echo "$RUNTIME"; return;;
    esac
    if command -v podman &>/dev/null; then echo "podman"; return; fi
    if command -v docker &>/dev/null && docker info &>/dev/null; then echo "docker"; return; fi
    echo "native"
}

compose_cmd() {  # echo the matching compose command for the selected runtime
    if [[ "$RUNTIME_EFF" == "podman" ]]; then
        if command -v podman-compose &>/dev/null; then echo "podman-compose";
        elif podman compose version &>/dev/null 2>&1; then echo "podman compose";
        else echo ""; fi
    else
        if docker compose version &>/dev/null 2>&1; then echo "docker compose";
        elif command -v docker-compose &>/dev/null; then echo "docker-compose";
        else echo ""; fi
    fi
}

# ── Input ─────────────────────────────────────────────────────────
header "Pastegate Setup"
echo ""
info "Package manager: ${PKG_MGR}"
RUNTIME_EFF="$(detect_runtime)"
info "Runtime:         ${RUNTIME_EFF}$( [[ "$RUNTIME" == auto ]] && echo ' (auto-detected)' )"
echo ""

ask DOMAIN    "Domain (e.g. pastegate.example.com)"
ask SERVER_IP "Additional server IP (optional, press Enter to skip)" " "
SERVER_IP="${SERVER_IP// /}"
[[ -z "$DOMAIN" ]] && error "Domain must not be empty."

if [[ -z "$TLS_MODE" ]]; then
    echo ""
    echo "  TLS certificate mode:"
    echo "    1) own certificate (provide fullchain + privkey)"
    echo "    2) Let's Encrypt (certbot; requires public DNS + ports 80/443)"
    echo "    3) self-signed (internal / testing)"
    echo "    4) behind a proxy that terminates TLS (gateway, Cloudflare, load balancer)"
    if [[ "$ASSUME_YES" == "yes" ]]; then TLS_MODE="selfsigned"; else
        read -rp "  Choice [1/2/3/4] (default: 3): " __tls
        case "${__tls:-3}" in 1) TLS_MODE="own";; 2) TLS_MODE="letsencrypt";; 4) TLS_MODE="proxy";; *) TLS_MODE="selfsigned";; esac
    fi
fi

case "$TLS_MODE" in
    own)
        ask CERT_FULLCHAIN "Path to fullchain.pem"
        ask CERT_KEY       "Path to privkey.pem"
        [[ -f "$CERT_FULLCHAIN" ]] || error "Certificate not found: $CERT_FULLCHAIN"
        [[ -f "$CERT_KEY"       ]] || error "Private key not found: $CERT_KEY"
        ;;
    letsencrypt)
        ask LE_EMAIL "Contact email for Let's Encrypt"
        [[ -z "$LE_EMAIL" ]] && error "Let's Encrypt requires a contact email."
        ;;
    selfsigned) ;;
    proxy)
        ask TRUSTED_PROXY "IP of the upstream proxy (for real client IPs, Enter = none)" " "
        TRUSTED_PROXY="${TRUSTED_PROXY// /}"
        ;;
    *) error "Invalid TLS mode: $TLS_MODE (own|letsencrypt|selfsigned|proxy)";;
esac

# DB password: generate a cryptographically random one if not provided
if [[ -z "$DB_PASS" ]]; then
    DB_PASS="$(openssl rand -hex 24 2>/dev/null || head -c18 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9')"
fi

PROTO="https"  # The phase 1 installer always terminates TLS at the reverse proxy

echo ""
info "Domain:    $DOMAIN"
[[ -n "$SERVER_IP" ]] && info "Server-IP: $SERVER_IP"
info "Runtime:   $RUNTIME_EFF"
info "TLS:       $TLS_MODE"
[[ -n "$TRUSTED_PROXY" ]] && info "Proxy:     $TRUSTED_PROXY ($REAL_IP_HEADER)"
echo ""
if [[ "$ASSUME_YES" != "yes" ]]; then
    read -rp "  Continue? [y/N]: " CONFIRM
    [[ "${CONFIRM,,}" != 'y' ]] && { echo "Aborted."; exit 0; }
fi

# ── Reverse proxy: nginx site + TLS (on the host, for both paths) ──
# $1 = upstream (e.g. 127.0.0.1:8000). For containers the upstream points to the
# published app container port.
configure_nginx() {
    local upstream="$1"
    header "Configuring nginx reverse proxy"

    command -v nginx &>/dev/null || install_pkgs nginx
    mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled /etc/nginx/conf.d

    cat > /etc/nginx/conf.d/pastegate_limit.conf << 'LIMITEOF'
limit_req_zone $binary_remote_addr zone=auth_limit:10m rate=5r/m;
LIMITEOF

    # Provide TLS material depending on the mode
    local ssl_cert ssl_key
    case "$TLS_MODE" in
        own)
            ssl_cert="$CERT_FULLCHAIN"; ssl_key="$CERT_KEY"
            ;;
        selfsigned)
            mkdir -p /etc/pastegate/tls
            ssl_cert=/etc/pastegate/tls/fullchain.pem
            ssl_key=/etc/pastegate/tls/privkey.pem
            if [[ ! -f "$ssl_cert" ]]; then
                openssl req -x509 -nodes -newkey rsa:2048 -days 825 \
                    -keyout "$ssl_key" -out "$ssl_cert" \
                    -subj "/CN=${DOMAIN}" \
                    -addext "subjectAltName=DNS:${DOMAIN}${SERVER_IP:+,IP:$SERVER_IP}" 2>/dev/null
                chmod 600 "$ssl_key"
                success "Self-signed certificate created"
            fi
            ;;
        letsencrypt|proxy)
            # letsencrypt: HTTP site first (ACME challenge), certbot adds TLS.
            # proxy: TLS terminates upstream, HTTP only here.
            ssl_cert=""; ssl_key=""
            ;;
    esac

    # Pass through the upstream proto; without an upstream proxy our own scheme applies
    cat > /etc/nginx/conf.d/pastegate_proto.conf << 'PROTOEOF'
map $http_x_forwarded_proto $pg_fwd_proto {
    default $scheme;
    "~.+"   $http_x_forwarded_proto;
}
PROTOEOF

    # Real client IP behind an upstream proxy (affects limit_req and X-Forwarded-For)
    local real_ip=""
    if [[ "$TLS_MODE" == "proxy" && -n "$TRUSTED_PROXY" ]]; then
        local ip
        for ip in ${TRUSTED_PROXY//,/ }; do real_ip+="    set_real_ip_from ${ip};"$'\n'; done
        real_ip+="    real_ip_header ${REAL_IP_HEADER};"$'\n'"    real_ip_recursive on;"
    fi

    if [[ "$TLS_MODE" == "proxy" ]]; then
        cat > /etc/nginx/sites-available/pastegate << NGINXEOF
# TLS terminates at the upstream proxy. No redirect to https: the proxy talks to
# this box over HTTP, so a redirect would point to the internal address.
server {
    listen 80 default_server;
    server_name ${DOMAIN} ${SERVER_IP} _;
${real_ip}

    location ~ ^/api/v1/auth/(login|ldap/login)\$ {
        limit_req zone=auth_limit burst=3 nodelay;
        proxy_pass         http://${upstream};
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$pg_fwd_proto;
    }
    location /api/ {
        proxy_pass         http://${upstream};
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$pg_fwd_proto;
        proxy_read_timeout 30s;
        client_max_body_size 512k;
    }
    location / {
        proxy_pass         http://${upstream};
        proxy_set_header   Host \$host;
        proxy_set_header   X-Forwarded-Proto \$pg_fwd_proto;
    }
}
NGINXEOF
    elif [[ -n "$ssl_cert" ]]; then
        cat > /etc/nginx/sites-available/pastegate << NGINXEOF
server {
    listen 80;
    server_name ${DOMAIN} ${SERVER_IP};
    return 301 https://\$host\$request_uri;
}
server {
    listen 443 ssl http2;
    server_name ${DOMAIN} ${SERVER_IP};

    ssl_certificate     ${ssl_cert};
    ssl_certificate_key ${ssl_key};
    ssl_protocols TLSv1.2 TLSv1.3;

    location ~ ^/api/v1/auth/(login|ldap/login)\$ {
        limit_req zone=auth_limit burst=3 nodelay;
        proxy_pass         http://${upstream};
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
    }
    location /api/ {
        proxy_pass         http://${upstream};
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_read_timeout 30s;
        client_max_body_size 512k;
    }
    location / {
        proxy_pass         http://${upstream};
        proxy_set_header   Host \$host;
        proxy_set_header   X-Forwarded-Proto \$scheme;
    }
}
NGINXEOF
    else
        # Let's Encrypt: HTTP-only site, certbot adds TLS + redirect itself.
        cat > /etc/nginx/sites-available/pastegate << NGINXEOF
server {
    listen 80;
    server_name ${DOMAIN} ${SERVER_IP};

    location ~ ^/api/v1/auth/(login|ldap/login)\$ {
        limit_req zone=auth_limit burst=3 nodelay;
        proxy_pass http://${upstream};
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
    location /api/ {
        proxy_pass http://${upstream};
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        client_max_body_size 512k;
    }
    location / {
        proxy_pass http://${upstream};
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
NGINXEOF
    fi

    ln -sf /etc/nginx/sites-available/pastegate /etc/nginx/sites-enabled/pastegate
    rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
    # On distros without sites-enabled (RHEL/SUSE), include via conf.d
    if ! grep -rq 'sites-enabled' /etc/nginx/nginx.conf 2>/dev/null; then
        ln -sf /etc/nginx/sites-available/pastegate /etc/nginx/conf.d/pastegate.conf
    fi

    nginx -t && { systemctl reload nginx 2>/dev/null || systemctl restart nginx 2>/dev/null || nginx -s reload; }
    success "nginx configured"

    if [[ "$TLS_MODE" == "letsencrypt" ]]; then
        header "Let's Encrypt"
        install_pkgs certbot python3-certbot-nginx || warn "certbot installation failed"
        certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$LE_EMAIL" --redirect \
            && success "Let's Encrypt certificate issued" \
            || warn "certbot failed – run manually: certbot --nginx -d $DOMAIN"
    fi
}

# ── Package installation (distro-agnostic) ────────────────────────
install_pkgs() {
    case "$PKG_MGR" in
        apt-get) apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "$@";;
        dnf)     dnf install -y -q "$@";;
        zypper)  zypper --non-interactive install "$@";;
        pacman)  pacman -Sy --noconfirm "$@";;
        apk)     apk add --no-cache "$@";;
        *)       warn "No supported package manager – please install manually: $*"; return 1;;
    esac
}

# ==================================================================
#  CONTAINER PATH
# ==================================================================
install_container() {
    header "Container installation (${RUNTIME_EFF})"
    local CT="$RUNTIME_EFF"

    install_app_files

    # .env for the app container
    FWD_ALLOW_IPS='*' write_env "db" "5432"

    # Dockerfile (multi-stage: build dashboard → python runtime)
    cat > "$INSTALL_DIR/Dockerfile" << 'DOCKEREOF'
# Stage 1 – build dashboard
FROM docker.io/library/node:20-alpine AS dashboard
WORKDIR /build
COPY dashboard/package*.json ./
RUN npm ci || npm install
COPY dashboard/ ./
RUN npm run build

# Stage 2 – Python runtime
FROM docker.io/library/python:3.12-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends libpq5 curl \
    && rm -rf /var/lib/apt/lists/*
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ ./
COPY extension/ /extension/
# Vite writes the dashboard build to ../backend/static (relative to the dashboard dir).
# In the build stage that is /backend/static.
COPY --from=dashboard /backend/static/ ./static/
EXPOSE 8000
# Tables are created on app startup via lifespan (create_all); the app serves
# the SPA itself (StaticFiles mount). uvicorn starts afterwards.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
DOCKEREOF

    # compose.yml
    cat > "$INSTALL_DIR/compose.yml" << COMPOSEEOF
services:
  db:
    image: docker.io/library/postgres:16-alpine
    environment:
      POSTGRES_USER: pastegate
      POSTGRES_PASSWORD: ${DB_PASS}
      POSTGRES_DB: pastegate
    volumes:
      - pastegate_db:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U pastegate"]
      interval: 5s
      timeout: 5s
      retries: 10
    restart: unless-stopped
  app:
    build:
      context: .
      dockerfile: Dockerfile
    env_file: ./backend/.env
    depends_on:
      db:
        condition: service_healthy
    ports:
      - "127.0.0.1:8000:8000"
    restart: unless-stopped
volumes:
  pastegate_db:
COMPOSEEOF

    local COMPOSE; COMPOSE="$(compose_cmd)"
    if [[ -z "$COMPOSE" ]]; then
        warn "No compose tool found for $CT – attempting installation"
        if [[ "$CT" == "podman" ]]; then install_pkgs podman-compose || true
        else install_pkgs docker-compose-plugin || install_pkgs docker-compose || true; fi
        COMPOSE="$(compose_cmd)"
        [[ -z "$COMPOSE" ]] && error "compose not available – please install podman-compose or docker compose."
    fi

    info "Building images and starting containers ($COMPOSE)…"
    ( cd "$INSTALL_DIR" && $COMPOSE -f compose.yml up -d --build )
    success "Containers running"

    configure_nginx "127.0.0.1:8000"
}

# ==================================================================
#  NATIVE PATH
# ==================================================================
install_native() {
    header "Native installation (package manager: ${PKG_MGR})"
    [[ "$PKG_MGR" == "none" ]] && error "No supported package manager and no container runtime found."

    header "Installing system packages"
    case "$PKG_MGR" in
        apt-get) install_pkgs python3 python3-pip python3-venv postgresql postgresql-contrib nginx curl git unzip zip openssl;;
        dnf)     install_pkgs python3 python3-pip postgresql-server postgresql nginx curl git unzip zip openssl;;
        zypper)  install_pkgs python3 python3-pip postgresql-server postgresql nginx curl git unzip zip openssl;;
        pacman)  install_pkgs python python-pip postgresql nginx curl git unzip zip openssl;;
        apk)     install_pkgs python3 py3-pip postgresql postgresql-contrib nginx curl git unzip zip openssl;;
    esac
    success "System packages installed"

    # Node.js (for the dashboard build)
    local NODE_VER=0
    command -v node &>/dev/null && NODE_VER=$(node -v | cut -d. -f1 | tr -d 'v')
    if [[ "$NODE_VER" -lt 18 ]]; then
        info "Installing Node.js 20…"
        if [[ "$PKG_MGR" == "apt-get" ]]; then
            curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && install_pkgs nodejs
        elif [[ "$PKG_MGR" == "dnf" ]]; then
            curl -fsSL https://rpm.nodesource.com/setup_20.x | bash - && install_pkgs nodejs
        else
            install_pkgs nodejs npm || warn "Please install Node.js (>=18) manually."
        fi
    fi
    success "Node.js $(node -v 2>/dev/null || echo '?') ready"

    # Initialize PostgreSQL (distro-specific, best effort)
    header "Setting up PostgreSQL"
    case "$PKG_MGR" in
        dnf|zypper) [[ -d /var/lib/pgsql/data/base ]] || postgresql-setup --initdb 2>/dev/null || \
                    su - postgres -c "initdb -D /var/lib/pgsql/data" 2>/dev/null || true;;
        pacman)     [[ -d /var/lib/postgres/data/base ]] || su - postgres -c "initdb -D /var/lib/postgres/data" 2>/dev/null || true;;
    esac
    systemctl enable --now postgresql 2>/dev/null || { service postgresql start 2>/dev/null || true; }

    sudo -u postgres psql -v ON_ERROR_STOP=0 -c "
      DO \$\$ BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='pastegate') THEN
          CREATE ROLE pastegate LOGIN PASSWORD '${DB_PASS}';
        ELSE ALTER ROLE pastegate PASSWORD '${DB_PASS}'; END IF;
      END \$\$;" 2>/dev/null
    sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='pastegate'" 2>/dev/null | grep -q 1 \
        || sudo -u postgres psql -c "CREATE DATABASE pastegate OWNER pastegate;" 2>/dev/null
    success "PostgreSQL configured"

    # System user
    if ! id pastegate &>/dev/null; then
        useradd --system --no-create-home --shell /usr/sbin/nologin pastegate 2>/dev/null \
            || useradd --system --shell /sbin/nologin pastegate 2>/dev/null || true
    fi

    install_app_files

    info "Setting up Python environment…"
    python3 -m venv "$INSTALL_DIR/venv"
    "$INSTALL_DIR/venv/bin/pip" install --quiet --upgrade pip
    "$INSTALL_DIR/venv/bin/pip" install --quiet -r "$INSTALL_DIR/backend/requirements.txt"
    success "Python dependencies installed"

    header "Building dashboard"
    ( cd "$INSTALL_DIR/dashboard" && npm install --silent && npm run build --silent )
    success "Dashboard built"

    write_env "localhost" "5432"

    header "Database schema"
    # Schema bootstrap: create tables from the models (idempotent), then stamp
    # the Alembic revision to head. Future changes go through
    # 'alembic revision --autogenerate' + 'alembic upgrade head'.
    ( cd "$INSTALL_DIR/backend" && "$INSTALL_DIR/venv/bin/python3" -c "
import sys; sys.path.insert(0, '.')
from app.core.database import Base, engine
import app.models.models  # noqa: F401  – registers all tables
Base.metadata.create_all(bind=engine)
print('Schema created.')
" )
    ( cd "$INSTALL_DIR/backend" && "$INSTALL_DIR/venv/bin/alembic" stamp head ) 2>/dev/null \
        || warn "alembic stamp failed – schema updates may need to be applied manually later."

    # Permissions
    chown -R pastegate:pastegate "$INSTALL_DIR/backend"
    # The service must be able to read extension/ (the extension builder copies from it)
    chown -R pastegate:pastegate "$INSTALL_DIR/extension"
    chmod 600 "$INSTALL_DIR/backend/.env"
    chmod -R 755 "$INSTALL_DIR/backend/static" 2>/dev/null || true

    header "systemd-Service"
    cat > /etc/systemd/system/pastegate.service << SVCEOF
[Unit]
Description=Pastegate API Server
After=network.target postgresql.service
Requires=postgresql.service

[Service]
Type=simple
User=pastegate
Group=pastegate
WorkingDirectory=${INSTALL_DIR}/backend
EnvironmentFile=${INSTALL_DIR}/backend/.env
ExecStart=${INSTALL_DIR}/venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 2
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=${INSTALL_DIR}/backend

[Install]
WantedBy=multi-user.target
SVCEOF
    systemctl daemon-reload
    systemctl enable pastegate
    systemctl restart pastegate
    sleep 3
    systemctl is-active --quiet pastegate \
        && success "pastegate.service is running" \
        || error "Service did not start – check: journalctl -u pastegate -n 50"

    configure_nginx "127.0.0.1:8000"
    setup_native_backup
}

# ── Shared helpers ────────────────────────────────────────────────
install_app_files() {
    header "Installing application"
    mkdir -p "$INSTALL_DIR"
    if [[ "$SRC_DIR" != "$INSTALL_DIR" ]]; then
        info "Copying files to $INSTALL_DIR…"
        cp -r "$SRC_DIR/." "$INSTALL_DIR/"
    fi
    # Never take over secrets from the source tree
    rm -f "$INSTALL_DIR/backend/.env" "$INSTALL_DIR/extension/config.js" 2>/dev/null || true
    success "Files ready"
}

write_env() {  # write_env <db-host> <db-port>
    local db_host="$1" db_port="$2"
    local secret_key hmac_salt
    secret_key="$(openssl rand -hex 32)"
    hmac_salt="$(openssl rand -hex 32)"
    cat > "$INSTALL_DIR/backend/.env" << ENV
DATABASE_URL=postgresql://pastegate:${DB_PASS}@${db_host}:${db_port}/pastegate
SECRET_KEY=${secret_key}
HMAC_SALT=${hmac_salt}
SERVER_URL=${PROTO}://${DOMAIN}
DEBUG=false
EVENT_RETENTION_DAYS=90

# Reverse proxies whose X-Forwarded-For uvicorn trusts (comma-separated, '*' = all).
# If another proxy/gateway sits in front of nginx, add its IP here – otherwise the
# login rate limit and audit log only see the gateway IP instead of the real client IP.
FORWARDED_ALLOW_IPS=${FWD_ALLOW_IPS:-127.0.0.1}

AZURE_TENANT_ID=
AZURE_CLIENT_ID=
AZURE_CLIENT_SECRET=

LDAP_HOST=
LDAP_PORT=636
LDAP_BASE_DN=
LDAP_BIND_DN=
LDAP_BIND_PASSWORD=
LDAP_USER_ATTR=sAMAccountName
ENV
    chmod 600 "$INSTALL_DIR/backend/.env"
    success ".env written"
}

setup_native_backup() {
    header "Backup configuration"
    local BACKUP_DIR=/var/backups/pastegate
    mkdir -p "$BACKUP_DIR"; chmod 700 "$BACKUP_DIR"; chown postgres:postgres "$BACKUP_DIR" 2>/dev/null || true
    cat > /usr/local/bin/pastegate-backup << 'BACKUP_SCRIPT'
#!/usr/bin/env bash
set -euo pipefail
BACKUP_DIR=/var/backups/pastegate
FILE="${BACKUP_DIR}/pastegate_$(date +%Y-%m-%d_%H%M).sql.gz"
# Runs as OS user postgres (peer auth via the local socket)
pg_dump pastegate | gzip > "$FILE"
chmod 600 "$FILE"
find "$BACKUP_DIR" -name 'pastegate_*.sql.gz' -mtime +7 -delete
echo "Backup created: $FILE"
BACKUP_SCRIPT
    chmod 755 /usr/local/bin/pastegate-backup
    local CRON_FILE=/etc/cron.d/pastegate-backup
    # Output goes to syslog/journal: postgres may not create files under /var/log,
    # and redirecting there would abort the job before it starts.
    if [[ -d /etc/cron.d ]]; then
        echo "0 2 * * * postgres /usr/local/bin/pastegate-backup 2>&1 | logger -t pastegate-backup" > "$CRON_FILE"
        chmod 644 "$CRON_FILE"
    fi
    success "Backup cron configured (daily at 02:00, 7-day retention)"
}

# ── Generate SETUP_TOKEN ──────────────────────────────────────────
write_setup_token() {
    header "Generating setup token"
    SETUP_TOKEN="$(openssl rand -hex 32)"
    echo -n "$SETUP_TOKEN" > "$INSTALL_DIR/SETUP_TOKEN"
    # Owner stays root. So that the backend service (user 'pastegate') can read
    # the token AND empty it at the end of setup (the app directory is not owned
    # by the service, so deleting it is not possible), the native setup makes it
    # group-readable and -writable (root:pastegate 660).
    # In the container the app runs as root and reads the read-only mount (600 suffices).
    if getent group pastegate &>/dev/null; then
        chown root:pastegate "$INSTALL_DIR/SETUP_TOKEN" 2>/dev/null || true
        chmod 660 "$INSTALL_DIR/SETUP_TOKEN"
    else
        chown root:root "$INSTALL_DIR/SETUP_TOKEN" 2>/dev/null || true
        chmod 600 "$INSTALL_DIR/SETUP_TOKEN"
    fi
    success "SETUP_TOKEN written to $INSTALL_DIR/SETUP_TOKEN"
}

# Container: mount SETUP_TOKEN into the app container so /setup can read it.
mount_setup_token_container() {
    # Add a read-only volume for the token file to compose.yml (idempotent)
    if ! grep -q 'SETUP_TOKEN:ro' "$INSTALL_DIR/compose.yml" 2>/dev/null; then
        # mount the volume below the app ports
        sed -i "/127.0.0.1:8000:8000/a\\    volumes:\n      - ${INSTALL_DIR}/SETUP_TOKEN:/app/SETUP_TOKEN:ro" "$INSTALL_DIR/compose.yml"
        local COMPOSE; COMPOSE="$(compose_cmd)"
        [[ -n "$COMPOSE" ]] && ( cd "$INSTALL_DIR" && $COMPOSE -f compose.yml up -d ) || true
    fi
}

# ==================================================================
#  Main flow
# ==================================================================
case "$RUNTIME_EFF" in
    podman|docker) install_container; write_setup_token; mount_setup_token_container;;
    native)        install_native;    write_setup_token;;
    *)             error "Unknown runtime: $RUNTIME_EFF";;
esac

# ── Connectivity test ─────────────────────────────────────────────
header "Connectivity test"
sleep 2
API_CODE=$(curl -sk -o /dev/null -w "%{http_code}" "http://127.0.0.1:8000/api/v1/ping" 2>/dev/null || echo "000")
[[ "$API_CODE" == "200" ]] && success "Backend reachable (port 8000)" \
    || warn "Backend not responding (HTTP $API_CODE) – check (container: logs / native: journalctl -u pastegate)"

# ── Summary ───────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}══════════════════════════════════════════════════════${RESET}"
echo -e "${GREEN}  Pastegate installation complete${RESET}"
echo -e "${BOLD}══════════════════════════════════════════════════════${RESET}"
echo ""
echo -e "  Dashboard:   ${CYAN}${PROTO}://${DOMAIN}${RESET}"
echo -e "  Setup-URL:   ${CYAN}${PROTO}://${DOMAIN}/setup${RESET}"
echo ""
echo -e "  ${BOLD}SETUP_TOKEN (for the initial setup in the browser):${RESET}"
echo -e "  ${YELLOW}${SETUP_TOKEN}${RESET}"
echo ""
echo -e "  Open ${PROTO}://${DOMAIN}/setup and enter the token"
echo -e "  to create the first admin account."
echo ""
echo -e "  Token file:  ${INSTALL_DIR}/SETUP_TOKEN (chmod 600, root)"
echo -e "  Runtime:     ${RUNTIME_EFF}"
if [[ "$RUNTIME_EFF" == "native" ]]; then
    echo -e "  Logs:        journalctl -u pastegate -f"
    echo -e "  Config:      ${INSTALL_DIR}/backend/.env"
else
    echo -e "  Logs:        cd ${INSTALL_DIR} && $(compose_cmd) logs -f"
fi
echo -e "  Uninstall:   sudo bash ${INSTALL_DIR}/uninstall.sh   (--purge wipes data)"
echo ""
