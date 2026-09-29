#!/usr/bin/env bash
# dev-perms.sh — dev permission model for the test VM (NOT for production).
#
# Background: install.sh sets up the files production-style
# (owned by the service user 'pastegate'). For development, the developer
# user should be able to edit everything while the service keeps running
# as an isolated user. This script sets:
#   - Ownership: <devuser>:pastegate   (developer edits, service reads via group)
#   - Dirs:      setgid, owner rwx / group rx / other none  (new files inherit group)
#   - static/:   world-readable (public SPA, served by nginx)
#   - .env/code: locked for 'other'
#   - SETUP_TOKEN (if present): group-readable/-writable (service can empty it)
#
# Can be re-run after every install.sh run.
# Usage:   sudo bash scripts/dev-perms.sh [devuser]   (default: $SUDO_USER)

set -euo pipefail

DIR=/opt/pastegate
DEV_USER="${1:-${SUDO_USER:-$(id -un)}}"
SVC_GROUP=pastegate

[[ $EUID -ne 0 ]] && { echo "Please run with sudo."; exit 1; }
id "$DEV_USER" &>/dev/null || { echo "Unknown user: $DEV_USER"; exit 1; }
getent group "$SVC_GROUP" >/dev/null || SVC_GROUP="$DEV_USER"

echo "Setting dev permissions: owner=$DEV_USER  group=$SVC_GROUP  on $DIR"
chown -R "$DEV_USER:$SVC_GROUP" "$DIR"
chmod -R u+rwX,g+rX,o-rwx "$DIR"
find "$DIR" -type d -exec chmod g+s {} \;            # new files inherit group

# nginx (www-data = 'other') must be able to traverse to the SPA + read it
chmod o+x "$DIR" "$DIR/backend"
[[ -d "$DIR/backend/static" ]] && chmod -R u=rwX,g=rX,o=rX "$DIR/backend/static"

# Setup token: the service must be able to empty it at the end of setup
[[ -f "$DIR/SETUP_TOKEN" ]] && { chgrp "$SVC_GROUP" "$DIR/SETUP_TOKEN"; chmod 660 "$DIR/SETUP_TOKEN"; }

echo "Done. Restart the service if needed: sudo systemctl restart pastegate"
