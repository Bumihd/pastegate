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
#   --container-subnet <cidr> Network of the app containers (default 10.231.250.0/24;
#                             --update keeps the subnet of the existing compose.yml)
#   --cert-fullchain <path>   Path to fullchain.pem  (--tls own only)
#   --cert-key <path>         Path to privkey.pem    (--tls own only)
#   --email <addr>            Contact email for Let's Encrypt
#   --db-pass <pw>            PostgreSQL password (randomly generated otherwise)
#   --update                  Update an existing installation in place: code,
#                             dependencies, dashboard, DB migrations, permissions,
#                             systemd unit. Keeps nginx, TLS, .env and the database.
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

usage() { awk 'NR > 1 && !/^#/ { exit } NR > 1 { sub(/^# ?/, ""); print }' "$0"; exit 0; }

INSTALL_DIR=/opt/pastegate
STATE_DIR=/var/lib/pastegate   # SETUP_TOKEN; native: systemd StateDirectory of the service
CONTAINER_UID=10001            # app user in the container image (APP_UID in write_dockerfile)
CONTAINER_SUBNET=""            # compose network of the app (--container-subnet, see write_compose)
SRC_DIR="$(cd "$(dirname "$0")" && pwd)"

# ── Defaults / Flags ──────────────────────────────────────────────
DOMAIN=""; SERVER_IP=""; RUNTIME="auto"; TLS_MODE=""
CERT_FULLCHAIN=""; CERT_KEY=""; LE_EMAIL=""
DB_PASS=""; ASSUME_YES="no"; UPDATE="no"
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
        --container-subnet) CONTAINER_SUBNET="$2"; shift 2;;
        --update)         UPDATE="yes"; shift;;
        --yes|-y)         ASSUME_YES="yes"; shift;;
        -h|--help)        usage;;
        *) error "Unknown argument: $1 (see --help)";;
    esac
done

# Container network: --container-subnet, else the subnet of an existing
# compose.yml (--update), else the default. The gateway (first address) is
# where the host nginx connects from – the only address FORWARDED_ALLOW_IPS trusts.
[[ -z "$CONTAINER_SUBNET" && -f "$INSTALL_DIR/compose.yml" ]] \
    && CONTAINER_SUBNET="$(sed -n 's/^ *- subnet: *//p' "$INSTALL_DIR/compose.yml" | head -1)"
CONTAINER_SUBNET="${CONTAINER_SUBNET:-10.231.250.0/24}"
__octet='(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])'   # 0-255, no leading zeros
[[ "$CONTAINER_SUBNET" =~ ^${__octet}\.${__octet}\.${__octet}\.${__octet}/([1-9][0-9]?)$ ]] \
    && (( BASH_REMATCH[5] >= 8 && BASH_REMATCH[5] <= 30 && BASH_REMATCH[4] <= 253 )) \
    || error "Invalid --container-subnet: $CONTAINER_SUBNET (expected a network like 10.231.250.0/24, prefix /8 to /30)"
CONTAINER_GATEWAY="${BASH_REMATCH[1]}.${BASH_REMATCH[2]}.${BASH_REMATCH[3]}.$(( BASH_REMATCH[4] + 1 ))"

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

if [[ "$UPDATE" == "yes" ]]; then
    # Update: no questions. Domain, TLS, nginx, secrets, DB password and the
    # setup token of the existing installation stay as they are.
    [[ -f "$INSTALL_DIR/backend/.env" ]] || error "No installation found in $INSTALL_DIR (backend/.env is missing)."
    if [[ "$RUNTIME" == "auto" && ! -f "$INSTALL_DIR/compose.yml" ]]; then RUNTIME_EFF="native"; fi
    info "Updating the existing installation in $INSTALL_DIR (runtime: $RUNTIME_EFF)"
    if [[ "$ASSUME_YES" != "yes" ]]; then
        read -rp "  Continue? [y/N]: " CONFIRM
        [[ "${CONFIRM,,}" != 'y' ]] && { echo "Aborted."; exit 0; }
    fi
else
    # A fresh install writes a new .env (SECRET_KEY, HMAC_SALT): on an existing
    # installation that would invalidate every API key and device hash.
    [[ -f "$INSTALL_DIR/backend/.env" ]] \
        && error "Existing installation found in $INSTALL_DIR. Use --update (a fresh install would replace SECRET_KEY and HMAC_SALT)."

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

    # Real client IP behind an upstream proxy (affects limit_req and X-Forwarded-For).
    # Forwarded headers are only trusted from the configured --trusted-proxy. The
    # backend always gets exactly one X-Forwarded-For value, $remote_addr: the real
    # client (resolved via real_ip) or, without a trusted proxy, the TCP peer.
    # Client-supplied X-Forwarded-For is never passed on.
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
        proxy_set_header   X-Forwarded-For \$remote_addr;
        proxy_set_header   X-Forwarded-Proto \$pg_fwd_proto;
    }
    location /api/ {
        proxy_pass         http://${upstream};
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   X-Forwarded-For \$remote_addr;
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
        proxy_set_header   X-Forwarded-For \$remote_addr;
        proxy_set_header   X-Forwarded-Proto \$scheme;
    }
    location /api/ {
        proxy_pass         http://${upstream};
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   X-Forwarded-For \$remote_addr;
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
        proxy_set_header X-Forwarded-For \$remote_addr;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
    location /api/ {
        proxy_pass http://${upstream};
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$remote_addr;
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
# Build context filter. Generated (like the Dockerfile) because hidden top-level
# entries are not copied into $INSTALL_DIR. Keeps secrets out of image layers:
# the app gets its configuration from compose (env_file), never from a file in the image.
write_dockerignore() {
    cat > "$INSTALL_DIR/.dockerignore" << 'IGNOREEOF'
.env
.env.*
**/.env
**/.env.*
extension/config.js
SETUP_TOKEN
.git
**/node_modules
**/__pycache__
**/.pytest_cache
docs/
venv/
compose.yml
Dockerfile
.dockerignore
IGNOREEOF
}

write_dockerfile() {  # multi-stage: build dashboard → python runtime
    write_dockerignore
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
# Unprivileged app user. The UID must match CONTAINER_UID in install.sh, which
# owns the bind-mounted token directory on the host.
ARG APP_UID=10001
RUN groupadd --system --gid ${APP_UID} pastegate \
    && useradd --system --uid ${APP_UID} --gid pastegate --no-create-home \
       --shell /usr/sbin/nologin pastegate
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends libpq5 curl \
    && rm -rf /var/lib/apt/lists/*
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
# Code stays root-owned and read-only for the app user
COPY backend/ ./
COPY extension/ /extension/
# Vite writes the dashboard build to ../backend/static (relative to the dashboard dir).
# In the build stage that is /backend/static.
COPY --from=dashboard /backend/static/ ./static/
RUN python -m compileall -q /app
ENV PYTHONDONTWRITEBYTECODE=1
USER pastegate
EXPOSE 8000
# Every start brings the schema to head first (Alembic only, no create_all).
# An unstamped schema from older container versions is detected and stamped
# once (app.cli migrate). If the migration fails, uvicorn does not start.
CMD ["sh", "-c", "python -m app.cli migrate && exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 2"]
DOCKEREOF
}

install_container() {
    header "Container installation (${RUNTIME_EFF})"
    local CT="$RUNTIME_EFF"

    install_app_files

    # .env for the app container: uvicorn trusts X-Forwarded-For only from the
    # host nginx, which reaches the container from the gateway of the compose network
    FWD_ALLOW_IPS="$CONTAINER_GATEWAY" write_env "db" "5432"

    # Host directory for the SETUP_TOKEN, bind-mounted read-write so the app can
    # delete the token after setup (podman refuses missing bind sources).
    prepare_container_state_dir

    write_dockerfile
    apply_permissions
    write_compose

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

# compose.yml (install and update). The app network has a fixed subnet so that
# the address the host nginx connects from (the network gateway) is known:
# FORWARDED_ALLOW_IPS trusts exactly that address, never '*'.
write_compose() {
    install -m 600 /dev/null "$INSTALL_DIR/compose.yml"   # contains the DB password
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
    networks: [pastegate]
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
    volumes:
      - ${STATE_DIR}:/var/lib/pastegate:Z
    networks: [pastegate]
    restart: unless-stopped
networks:
  pastegate:
    ipam:
      config:
        - subnet: ${CONTAINER_SUBNET}
          gateway: ${CONTAINER_GATEWAY}
volumes:
  pastegate_db:
COMPOSEEOF
}

# The app runs as CONTAINER_UID (rootful podman/docker: same UID on the host),
# so the bind-mounted token directory belongs to that UID. ':Z' in compose.yml
# gives it the container's SELinux label (no-op without SELinux).
prepare_container_state_dir() {
    mkdir -p "$STATE_DIR"
    chown -R "$CONTAINER_UID:$CONTAINER_UID" "$STATE_DIR"
    chmod 700 "$STATE_DIR"
}

# Update of a container installation: the DB password (from the existing
# compose.yml) and .env stay; compose.yml itself is regenerated.
update_container() {
    header "Container update (${RUNTIME_EFF})"
    local COMPOSE; COMPOSE="$(compose_cmd)"
    [[ -z "$COMPOSE" ]] && error "compose not available – please install podman-compose or docker compose."
    [[ -f "$INSTALL_DIR/compose.yml" ]] || error "$INSTALL_DIR/compose.yml not found – not a container installation?"
    DB_PASS="$(sed -n 's/^ *POSTGRES_PASSWORD: *//p' "$INSTALL_DIR/compose.yml" | head -1)"
    [[ -n "$DB_PASS" ]] || error "POSTGRES_PASSWORD not found in $INSTALL_DIR/compose.yml."

    install_app_files
    prepare_container_state_dir
    # Older versions trusted X-Forwarded-For from everyone ('*')
    sed -i "s/^FORWARDED_ALLOW_IPS=.*/FORWARDED_ALLOW_IPS=${CONTAINER_GATEWAY}/" "$INSTALL_DIR/backend/.env"

    write_dockerfile
    apply_permissions
    write_compose

    info "Rebuilding images and restarting containers ($COMPOSE)…"
    # 'down' (containers + network, never volumes) before 'up': otherwise compose may
    # keep a network with an old subnet, and FORWARDED_ALLOW_IPS would not match it.
    ( cd "$INSTALL_DIR" && $COMPOSE -f compose.yml build \
        && $COMPOSE -f compose.yml down && $COMPOSE -f compose.yml up -d )
    success "Containers running"
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

    # System user with its own dedicated group (.env is group-readable for it,
    # so the group must not be shared with anyone else)
    getent group pastegate &>/dev/null || groupadd --system pastegate
    if ! id pastegate &>/dev/null; then
        useradd --system -g pastegate --no-create-home --shell /usr/sbin/nologin pastegate 2>/dev/null \
            || useradd --system -g pastegate --shell /sbin/nologin pastegate 2>/dev/null || true
    fi

    install_app_files
    apply_permissions   # before any installed code runs

    info "Setting up Python environment…"
    python3 -m venv "$INSTALL_DIR/venv"
    "$INSTALL_DIR/venv/bin/pip" install --quiet --upgrade pip
    "$INSTALL_DIR/venv/bin/pip" install --quiet -r "$INSTALL_DIR/backend/requirements.txt"
    success "Python dependencies installed"

    header "Building dashboard"
    ( cd "$INSTALL_DIR/dashboard" && npm install --silent && npm run build --silent )
    success "Dashboard built"

    write_env "localhost" "5432"
    apply_permissions   # .env root:pastegate 640, so the service user can read it

    header "Database schema"
    # Alembic is the only source of the schema: on the empty database 0001
    # creates the baseline, the later migrations bring it to head.
    run_alembic upgrade head
    success "Schema created (alembic head)"

    compile_python
    apply_permissions
    write_service_unit
    systemctl enable pastegate
    restart_service

    configure_nginx "127.0.0.1:8000"
    setup_native_backup
}

# Update of a native installation: no packages, no nginx, no secrets.
update_native() {
    header "Native update"
    systemctl cat pastegate &>/dev/null || error "pastegate.service not found – not a native installation?"

    # Nothing running as the service user may touch the tree while it is replaced
    # (before 0.1.1 the service owned backend/). The service is down until the end.
    systemctl stop pastegate
    if command -v pkill &>/dev/null; then pkill -KILL -u pastegate || true; fi

    install_app_files
    apply_permissions   # before any installed code runs

    info "Updating Python dependencies…"
    "$INSTALL_DIR/venv/bin/pip" install --quiet -r "$INSTALL_DIR/backend/requirements.txt"
    success "Python dependencies updated"

    header "Building dashboard"
    ( cd "$INSTALL_DIR/dashboard" && npm install --silent && npm run build --silent )
    success "Dashboard built"

    header "Database migrations"
    local current
    current="$(run_alembic current 2>/dev/null | awk '{print $1}' | tail -1)"
    [[ -z "$current" ]] && error "No Alembic revision recorded – migrate manually ('alembic stamp <rev>', then 'alembic upgrade head')."
    info "Current revision: $current"
    run_alembic upgrade head
    success "Schema up to date"

    compile_python
    apply_permissions
    write_service_unit
    restart_service
}

# Migrations run as the service user, never as root: Alembic imports code from
# backend/ (alembic.ini: prepend_sys_path = .).
run_alembic() {
    local cmd=(env PYTHONDONTWRITEBYTECODE=1 "$INSTALL_DIR/venv/bin/alembic" "$@")
    if command -v runuser &>/dev/null; then
        # Own session, no stdin: the process must not get root's terminal (TIOCSTI)
        ( cd "$INSTALL_DIR/backend" && setsid -w runuser -u pastegate -- "${cmd[@]}" </dev/null )
    else
        ( cd "$INSTALL_DIR/backend" && su -s /bin/sh pastegate -c "$(printf '%q ' "${cmd[@]}")" </dev/null )
    fi
}

# Bytecode is compiled once as root: the service may not write into the code
# (PYTHONDONTWRITEBYTECODE=1, no ReadWritePaths).
compile_python() {
    "$INSTALL_DIR/venv/bin/python3" -m compileall -q "$INSTALL_DIR/backend" >/dev/null || true
}

# Permission model: code is owned by root and only readable for everyone else
# (dirs 755, files 644, executables 755). The service needs no writable path
# under $INSTALL_DIR – temp files go to PrivateTmp, the setup token to
# $STATE_DIR. Restricted: .env root:pastegate 640 (the app reads it) and the
# container's compose.yml root 600 (DB password).
# Symlinks are never passed to chmod: chmod would change the file they point to.
apply_permissions() {
    header "Setting permissions"
    local env="$INSTALL_DIR/backend/.env" compose="$INSTALL_DIR/compose.yml"
    local env_group=root env_mode=600
    if id pastegate &>/dev/null; then
        # Group read only for the dedicated group – never for a shared primary group
        [[ "$(id -gn pastegate)" == "pastegate" ]] \
            || error "Primary group of user 'pastegate' is '$(id -gn pastegate)', expected 'pastegate' – .env would be readable for that group. Fix with: usermod -g pastegate pastegate"
        env_group=pastegate; env_mode=640
    fi                                          # else container: only compose (root) reads .env
    # chown/chmod on a single path follow symlinks: a .env replaced by a link (e.g.
    # by the service user while it still owned backend/) would hand the target to
    # pastegate. Both secrets must be plain files with exactly one link.
    local f
    for f in "$env" "$compose"; do
        if [[ -L "$f" ]] || { [[ -e "$f" ]] && { [[ ! -f "$f" ]] || [[ "$(stat -c %h "$f")" != 1 ]]; }; }; then
            error "$f is a symlink, hard link or not a regular file – refusing to continue. Check the installation for tampering."
        fi
    done
    # Secrets first and never through the recursive chmod (they would be 644 in between)
    [[ -f "$env" ]] && { chown "root:$env_group" "$env"; chmod "$env_mode" "$env"; }
    [[ -f "$compose" ]] && { chown root:root "$compose"; chmod 600 "$compose"; }
    chown -R root:root "$INSTALL_DIR"
    [[ -f "$env" ]] && chgrp "$env_group" "$env"
    find "$INSTALL_DIR" ! -type l ! -path "$env" ! -path "$compose" -exec chmod u=rwX,go=rX {} +
    success "Code root:root (755/644)$([[ -f "$env" ]] && echo ", .env $(stat -c '%U:%G %a' "$env")")"
}

restart_service() {
    systemctl restart pastegate
    sleep 3
    systemctl is-active --quiet pastegate \
        && success "pastegate.service is running" \
        || error "Service did not start – check: journalctl -u pastegate -n 50"
}

write_service_unit() {
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
StateDirectory=pastegate
StateDirectoryMode=0700
ProtectSystem=strict
Environment=PYTHONDONTWRITEBYTECODE=1

[Install]
WantedBy=multi-user.target
SVCEOF
    systemctl daemon-reload
}

# ── Shared helpers ────────────────────────────────────────────────
# Not part of an installation: every hidden entry at the top level of the
# source (repository and tooling metadata – nothing there is read at runtime),
# internal docs, dev scripts, local notes, and secrets/build output. The .env
# of an existing installation is never overwritten (the source's .env is excluded).
INSTALL_EXCLUDES=(
    './.*' ./docs ./scripts './*.local.md'
    ./backend/.env ./extension/config.js
    node_modules __pycache__ .pytest_cache
)
# Left behind by older versions (copied with 'cp -r') – removed on install/update,
# together with every hidden top-level entry of $INSTALL_DIR
STALE_PATHS=(docs scripts SETUP_TOKEN)

# Symlinks in the source are refused: a link like extension/x -> ../backend/.env
# would be copied as-is and could expose files when permissions are set.
# node_modules is never copied (excluded) and may contain links.
check_source_symlinks() {
    local links
    links="$(find "$SRC_DIR" -mindepth 1 \( -path "$SRC_DIR/.*" -o -name node_modules \) -prune \
             -o -type l -print)"
    [[ -z "$links" ]] || error "The source contains symlinks – refusing to install:"$'\n'"$links"
}

install_app_files() {
    header "Installing application"
    mkdir -p "$INSTALL_DIR"
    if [[ "$SRC_DIR" == "$INSTALL_DIR" ]]; then
        warn "Running from $INSTALL_DIR itself – nothing copied, repository files stay in place."
    else
        check_source_symlinks
        info "Copying files to $INSTALL_DIR…"
        # Start from empty code directories: tar would keep files that are no
        # longer (or never were) in the source – e.g. planted by the service
        # account while it still owned backend/ (layout before 0.1.1).
        # The directory itself goes back to root first, so nobody else can add
        # entries between the cleanup and the extraction.
        if [[ -d "$INSTALL_DIR/backend" && ! -L "$INSTALL_DIR/backend" ]]; then
            chown -h root:root "$INSTALL_DIR/backend"; chmod 755 "$INSTALL_DIR/backend"
            find "$INSTALL_DIR/backend" -mindepth 1 -maxdepth 1 ! -name .env -exec rm -rf {} +
        fi
        rm -rf "${INSTALL_DIR:?}/extension"
        local excludes=() p
        for p in "${INSTALL_EXCLUDES[@]}"; do excludes+=(--exclude="$p"); done
        tar -C "$SRC_DIR" "${excludes[@]}" -cf - . | tar -C "$INSTALL_DIR" --no-same-owner -xf -
        for p in "${STALE_PATHS[@]}"; do rm -rf "${INSTALL_DIR:?}/$p"; done
        find "$INSTALL_DIR" -mindepth 1 -maxdepth 1 -name '.*' -exec rm -rf {} +
    fi
    # Never ship a generated extension config from the source tree
    rm -f "$INSTALL_DIR/extension/config.js" 2>/dev/null || true
    success "Files ready"
}

write_env() {  # write_env <db-host> <db-port>
    local db_host="$1" db_port="$2"
    local secret_key hmac_salt
    secret_key="$(openssl rand -hex 32)"
    hmac_salt="$(openssl rand -hex 32)"
    # Create the file as 600 first: 'cat >' alone would leave it 644 until the chmod
    install -m 600 /dev/null "$INSTALL_DIR/backend/.env"
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
# The token lives in $STATE_DIR and belongs to the account the app runs as
# (native: pastegate, 600), so the backend can delete it after setup. The file
# is only cleanup: once setup_state.completed is set in the DB, every setup
# endpoint answers 403, token or not.
write_setup_token() {
    header "Generating setup token"
    SETUP_TOKEN="$(openssl rand -hex 32)"
    local owner="$CONTAINER_UID"   # container: app user of the image (bind mount $STATE_DIR)
    [[ "$RUNTIME_EFF" == "native" ]] && owner=pastegate
    mkdir -p "$STATE_DIR"
    chown "$owner:$owner" "$STATE_DIR"; chmod 700 "$STATE_DIR"
    ( umask 077; echo -n "$SETUP_TOKEN" > "$STATE_DIR/SETUP_TOKEN" )
    chown "$owner:$owner" "$STATE_DIR/SETUP_TOKEN"; chmod 600 "$STATE_DIR/SETUP_TOKEN"
    # Token location of older versions – no longer read by the backend
    rm -f "$INSTALL_DIR/SETUP_TOKEN"
    success "SETUP_TOKEN written to $STATE_DIR/SETUP_TOKEN"
}

# ==================================================================
#  Main flow
# ==================================================================
connectivity_test() {
    header "Connectivity test"
    sleep 2
    API_CODE=$(curl -sk -o /dev/null -w "%{http_code}" "http://127.0.0.1:8000/api/v1/ping" 2>/dev/null || echo "000")
    [[ "$API_CODE" == "200" ]] && success "Backend reachable (port 8000)" \
        || warn "Backend not responding (HTTP $API_CODE) – check (container: logs / native: journalctl -u pastegate)"
}

if [[ "$UPDATE" == "yes" ]]; then
    case "$RUNTIME_EFF" in
        podman|docker) update_container;;
        native)        update_native;;
        *)             error "Unknown runtime: $RUNTIME_EFF";;
    esac
    connectivity_test
    echo ""
    echo -e "${GREEN}  Pastegate update complete${RESET} (nginx, TLS, .env and data unchanged)"
    echo ""
    exit 0
fi

case "$RUNTIME_EFF" in
    podman|docker) install_container; write_setup_token;;
    native)        install_native;    write_setup_token;;
    *)             error "Unknown runtime: $RUNTIME_EFF";;
esac

connectivity_test

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
echo -e "  /setup is locked for good (also with the token) as soon as the wizard is"
echo -e "  finished or an admin logs in for the first time."
echo ""
echo -e "  Token file:  ${STATE_DIR}/SETUP_TOKEN (chmod 600, deleted after setup)"
echo -e "  Runtime:     ${RUNTIME_EFF}"
if [[ "$RUNTIME_EFF" == "native" ]]; then
    echo -e "  Logs:        journalctl -u pastegate -f"
    echo -e "  Config:      ${INSTALL_DIR}/backend/.env (root:pastegate 640)"
else
    echo -e "  Logs:        cd ${INSTALL_DIR} && $(compose_cmd) logs -f"
fi
echo -e "  Update:      sudo bash install.sh --update   (from a new source checkout)"
echo -e "  Uninstall:   sudo bash ${INSTALL_DIR}/uninstall.sh   (--purge wipes data)"
echo ""
