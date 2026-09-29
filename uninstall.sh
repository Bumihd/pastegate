#!/usr/bin/env bash
# Pastegate – uninstall.sh
#
# Removes a Pastegate installation. Automatically detects container vs.
# native installation. Idempotent: running it multiple times is harmless.
#
#   sudo bash uninstall.sh            Default (DATA-SAFE):
#                                       - stop + disable + remove systemd service
#                                       - remove nginx site + reload
#                                       - remove app directory + SETUP_TOKEN
#                                       - stop + remove containers (volumes are KEPT)
#                                     DB, DB user and backups are KEPT.
#
#   sudo bash uninstall.sh --purge    Additionally (DESTRUCTIVE, asks for confirmation):
#                                       - drop PostgreSQL DB + DB user
#                                       - delete container volumes
#                                       - delete backups under /var/backups/pastegate
#
#   --yes      Skip the --purge confirmation (for automation)
#   -h|--help  Help

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'
info()    { echo -e "${CYAN}  >${RESET} $*"; }
success() { echo -e "${GREEN}  ok${RESET} $*"; }
warn()    { echo -e "${YELLOW}  warn${RESET} $*"; }
header()  { echo -e "\n${BOLD}── $* ${RESET}"; }

INSTALL_DIR=/opt/pastegate
BACKUP_DIR=/var/backups/pastegate
PURGE="no"; ASSUME_YES="no"

while [[ $# -gt 0 ]]; do
    case "$1" in
        --purge) PURGE="yes"; shift;;
        --yes|-y) ASSUME_YES="yes"; shift;;
        -h|--help) sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//'; exit 0;;
        *) echo "Unknown argument: $1"; exit 1;;
    esac
done

[[ $EUID -ne 0 ]] && { echo -e "${RED}Please run as root or with sudo.${RESET}"; exit 1; }

header "Pastegate uninstall"
[[ "$PURGE" == "yes" ]] && warn "PURGE mode: DB, volumes and backups will be deleted!" \
                        || info "Data-safe mode: DB and backups are kept."

# ── Detect & remove container installation ────────────────────────
COMPOSE=""
detect_compose() {
    if command -v podman-compose &>/dev/null; then echo "podman-compose";
    elif podman compose version &>/dev/null 2>&1; then echo "podman compose";
    elif docker compose version &>/dev/null 2>&1; then echo "docker compose";
    elif command -v docker-compose &>/dev/null; then echo "docker-compose";
    else echo ""; fi
}

if [[ -f "$INSTALL_DIR/compose.yml" ]]; then
    header "Stopping + removing containers"
    COMPOSE="$(detect_compose)"
    if [[ -n "$COMPOSE" ]]; then
        if [[ "$PURGE" == "yes" ]]; then
            ( cd "$INSTALL_DIR" && $COMPOSE -f compose.yml down -v ) 2>/dev/null \
                && success "Containers + volumes removed" || warn "compose down -v failed"
        else
            ( cd "$INSTALL_DIR" && $COMPOSE -f compose.yml down ) 2>/dev/null \
                && success "Containers stopped + removed (volumes kept)" || warn "compose down failed"
        fi
    else
        warn "No compose tool found – remove containers manually if needed."
    fi
fi

# ── Remove systemd service ────────────────────────────────────────
header "Removing systemd service"
# Always stop – service detection via list-unit-files is unreliable.
systemctl stop pastegate 2>/dev/null || true
systemctl disable pastegate 2>/dev/null || true
# Fallback: kill the running process hard in case the unit file is already gone
pkill -f 'uvicorn app.main:app' 2>/dev/null || true
success "Service stopped (if it was active)"
rm -f /etc/systemd/system/pastegate.service
systemctl daemon-reload 2>/dev/null || true

# ── Remove nginx site ─────────────────────────────────────────────
header "Removing nginx configuration"
removed_nginx="no"
for p in /etc/nginx/sites-enabled/pastegate /etc/nginx/sites-available/pastegate \
         /etc/nginx/conf.d/pastegate.conf /etc/nginx/conf.d/pastegate_limit.conf; do
    [[ -e "$p" ]] && { rm -f "$p"; removed_nginx="yes"; }
done
if [[ "$removed_nginx" == "yes" ]]; then
    if command -v nginx &>/dev/null && nginx -t &>/dev/null; then
        systemctl reload nginx 2>/dev/null || nginx -s reload 2>/dev/null || true
    fi
    success "nginx site removed + reloaded"
else
    info "No nginx site found"
fi

# ── Remove backup cron + helper (backups themselves are kept unless --purge) ──
rm -f /etc/cron.d/pastegate-backup /usr/local/bin/pastegate-backup 2>/dev/null || true

# ── Remove app directory + SETUP_TOKEN ────────────────────────────
header "Removing application files"
rm -f "$INSTALL_DIR/SETUP_TOKEN" 2>/dev/null || true
if [[ -d "$INSTALL_DIR" ]]; then
    rm -rf "$INSTALL_DIR"
    success "App directory removed ($INSTALL_DIR)"
else
    info "App directory already removed"
fi
rm -rf /etc/pastegate 2>/dev/null || true

# ── PURGE: DB + DB-User + Backups ─────────────────────────────────
if [[ "$PURGE" == "yes" ]]; then
    header "PURGE: deleting database + backups"
    if [[ "$ASSUME_YES" != "yes" ]]; then
        echo -e "${RED}  This IRREVERSIBLY deletes the PostgreSQL database 'pastegate', the DB user${RESET}"
        echo -e "${RED}  and all backups under ${BACKUP_DIR}.${RESET}"
        read -rp "  Type 'pastegate' to confirm: " CONFIRM
        [[ "$CONFIRM" != "pastegate" ]] && { warn "Aborted – DB/backups are kept."; exit 0; }
    fi

    # Native PostgreSQL (via the local postgres superuser)
    if command -v psql &>/dev/null && id postgres &>/dev/null; then
        sudo -u postgres psql -c "DROP DATABASE IF EXISTS pastegate;" 2>/dev/null \
            && success "Database 'pastegate' deleted" || warn "DB drop failed (possibly a container DB)"
        sudo -u postgres psql -c "DROP ROLE IF EXISTS pastegate;" 2>/dev/null \
            && success "DB user 'pastegate' deleted" || warn "Role drop skipped"
    else
        info "No local PostgreSQL – container volume was already removed via 'down -v'."
    fi

    # Backups
    if [[ -d "$BACKUP_DIR" ]]; then
        rm -rf "$BACKUP_DIR"
        success "Backups deleted ($BACKUP_DIR)"
    fi
fi

echo ""
echo -e "${GREEN}  Pastegate has been removed.${RESET}"
if [[ "$PURGE" != "yes" ]]; then
    echo -e "  ${YELLOW}Note:${RESET} DB 'pastegate' and backups under ${BACKUP_DIR} are kept."
    echo -e "  Remove completely with: ${CYAN}sudo bash uninstall.sh --purge${RESET}"
fi
echo ""
