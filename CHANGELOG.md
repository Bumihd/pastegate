# Changelog

## [0.1.1-alpha.1] - 2026-10-27

### Upgrade (read first)

Native installation:

1. Make a backup of the database and of `/opt/pastegate/backend/.env`:
   `sudo -u postgres pg_dump pastegate | gzip > pastegate-0.1.0.sql.gz`
   `sudo cp -a /opt/pastegate/backend/.env /root/pastegate-env-0.1.0.bak`
   Without this file (`HMAC_SALT`) devices and stored names cannot be recovered.
2. Delete the old setup token: `sudo rm -f /opt/pastegate/SETUP_TOKEN`
3. In the folder of the new version: `sudo bash install.sh --update`

Container installation:

1. Make a backup of the database and of `/opt/pastegate/backend/.env`:
   `cd /opt/pastegate && sudo podman compose exec db pg_dump -U pastegate pastegate | gzip > pastegate-0.1.0.sql.gz`
   (with Docker: `docker compose`)
   `sudo cp -a /opt/pastegate/backend/.env /root/pastegate-env-0.1.0.bak`
   Without this file (`HMAC_SALT`) devices and stored names cannot be recovered.
2. Delete the old setup token: `sudo rm -f /opt/pastegate/SETUP_TOKEN`
3. In the folder of the new version: `sudo bash install.sh --update`.
   This builds a new image and migrates the database when the container starts.
4. Delete the old images: `sudo podman image prune` (or `sudo docker image prune`).
   They contain your `.env`, see Security.

Do not run `install.sh` without `--update` on an existing installation. It now stops
with an error, because it would create new secrets.

### Security

- **The setup token stayed valid after setup.**
  Affects all versions up to and including 0.1.0-alpha.3.
  The server could not delete it
  (systemd sandbox, read-only mount in the container). Anyone with the token could
  still reset the 2FA of the first admin, create API keys and change the organisation
  language. Now setup is locked in the database when it is finished: all
  `/api/v1/setup/*` requests return 403, also with the correct token. Failed token
  checks are limited to 10 per minute per IP. Setup is also locked as soon as an
  admin logs in for the first time, so an unfinished wizard no longer keeps the
  token valid. Setup can no longer replace an active 2FA. The token is now stored in
  `/var/lib/pastegate/` and readable only by the service.
  To check whether this was used: look for `POST /api/v1/setup/` requests after
  your setup in the server log, check the API key list for keys you do not know,
  and check that 2FA is still on for your admin.
- **File permissions under /opt/pastegate.** The service could change its own code
  and its `.env`. Now the code belongs to root and is read-only for the service,
  `.env` is `root:pastegate 640`, and the service has no write access under
  `/opt/pastegate`. During installation `.env` is never readable for other users,
  not even for a moment. In container installations `compose.yml`, which contains
  the database password, was readable for all local users; it is now `600`.
- **Client IP in container installations could be faked.** The server trusted the
  `X-Forwarded-For` header from every address. A client could send any IP, which
  got around the login and setup rate limits and put a wrong IP into the audit log.
  Now the server trusts only the nginx on the host, and nginx passes on only the
  address it sees itself (or the one from `--trusted-proxy`).
- **`.env` in container images.** Images built with earlier versions contain
  `backend/.env` with `SECRET_KEY`, `HMAC_SALT` and the database password. The app
  in the container also ran as root. New images do not contain `.env` and run as
  their own user (UID 10001).
  - Image only on this server: delete the old images (see Upgrade).
  - Image was pushed to a registry: delete it there, then change the database
    password and `SECRET_KEY` as described below.
  - **Never change `HMAC_SALT`.** Device hashes are built from it, and the key that
    encrypts device owner names is derived from it. After a change, all devices
    appear as new devices and stored names can no longer be read.

  Change `SECRET_KEY`:
  1. Create a new value: `openssl rand -hex 32`
  2. Put it into `SECRET_KEY=` in `/opt/pastegate/backend/.env`.
  3. Restart: `sudo systemctl restart pastegate`
     (container: `cd /opt/pastegate && sudo podman compose up -d --force-recreate app`).
  4. Effect: everyone is logged out. **All API keys stop working**, so installed
     extensions stop reporting. **All personal API tokens (`pgr_…`) stop working.**
     Azure SSO logins that are running at that moment fail once and have to be
     started again.
  5. In the dashboard: create a new API key (API Keys), build the extension again
     (Build Extension) and roll it out again. Users create new personal tokens
     (API access). Delete the old keys.

  Change the database password (set it interactively with `\password pastegate`,
  then `\q`. This keeps the password out of the shell history). `DATABASE_URL` is a
  URL: if the password contains characters such as `@`, `:`, `/`, `#` or `%`, write
  them percent-encoded there (for example `@` as `%40`), otherwise the server does
  not start:
  - Native: `sudo -u postgres psql`, then `\password pastegate`.
    Change the password in `DATABASE_URL` in `/opt/pastegate/backend/.env`,
    then `sudo systemctl restart pastegate`.
  - Container: `cd /opt/pastegate && sudo podman compose exec db psql -U pastegate -d pastegate`,
    then `\password pastegate`. Change it in `POSTGRES_PASSWORD` in `compose.yml`
    and in `DATABASE_URL` in `backend/.env`, then
    `sudo podman compose up -d --force-recreate app`.
    Changing only `compose.yml` is not enough: the database image uses that value
    only when the database is created.

### Added

- `python -m app.cli migrate`: brings the database to the newest version.

### Changed

- `install.sh --update` updates an existing installation: code, dependencies,
  dashboard, database, permissions and the systemd service. It does not touch nginx,
  TLS, `.env` or your data. It stops the service for the whole update, removes old
  files in `backend/` and `extension/` before copying, sets permissions before any
  installed code runs, and runs the migrations as the service user, not as root.
  It stops with an error if `.env` or `compose.yml` is a link.
- The installer stops if the source folder contains symbolic links (outside
  `node_modules`).
- Containers run in their own network `10.231.250.0/24` (change it with
  `--container-subnet`). `--update` rewrites `compose.yml` and keeps the database
  password and the network.
- The database schema now comes only from the migrations (Alembic). The server no
  longer creates tables when it starts. New native installations run
  `alembic upgrade head`.
- Containers update the database on every start, before the server starts.
  Containers from earlier versions had no recorded database version. It is detected
  from the existing tables on the first start.
- The service user `pastegate` gets its own group `pastegate`. The installer stops
  if the user has a different main group.
- The installation no longer contains `.git`, other hidden files, `docs/` or `scripts/`.
  `scripts/dev-perms.sh` was removed.
- If the setup wizard was not finished: admins can create API keys and set the
  organisation language in the dashboard (API Keys, Settings).
- Documentation: installation with all four HTTPS options (including behind a
  reverse proxy or gateway), Edge for MDM rollout, the new setup token location.

### Fixed

- `alembic upgrade head` works on an empty database.
- User guide: 100 detection rules (was "more than 80"). The severity examples now
  match the actual rules. Built-in rules use critical, high and medium only.

### Detection

- No changes to the detection rules.

### Known limitations

- The container path (new image, own user, migration at start) was not tested in a
  real container yet.
- Very old container installations whose tables do not match one database version
  stop at the migration with an error. In that case, open an issue on GitHub with
  the error message.
- If `10.231.250.0/24` is already used on the host, the containers do not start.
  Choose another network with `--container-subnet`, for example
  `sudo bash install.sh --update --container-subnet 10.232.0.0/24`.
- `--update` does not change the nginx configuration. Existing native installations
  keep their old `X-Forwarded-For` line. This is safe, because the server trusts
  only nginx on `127.0.0.1`. Behind a gateway without `--trusted-proxy`, all clients
  share one rate limit.

## [0.1.0-alpha.3] - 2026-09-29

- New license: Apache License 2.0 (was AGPL v3). If you share or sell Pastegate,
  you must include the LICENSE and NOTICE files.
- "Pastegate by Bumihd" in the dashboard and extension popup stays, but is no longer required.

## [0.1.0-alpha.2] - 2026-09-29

- New license: GNU AGPL v3 (was MIT). If you share or sell a changed version,
  you must publish its source code. The attribution "Pastegate by Bumihd" must
  stay visible in the dashboard and the extension popup (see NOTICE).
- The dashboard and extension popup now show "Pastegate by Bumihd".

## [0.1.0-alpha.1] - 2026-09-29

First public release.

- Browser extension for Chrome and Edge with 100 built-in detection rules
- Your own rules and per-website settings (warn, block, allow)
- Server with dashboard, user roles and audit log
- Setup in the browser after installation
- Login with Azure AD, LDAP or local accounts with 2FA
- API for reports (Grafana, Jira, BI tools)
- Dashboard in English, German, French and Spanish
- Installer for all common Linux systems, and an uninstaller

[0.1.1-alpha.1]: https://github.com/Bumihd/pastegate/releases/tag/v0.1.1-alpha.1
[0.1.0-alpha.3]: https://github.com/Bumihd/pastegate/releases/tag/v0.1.0-alpha.3
[0.1.0-alpha.2]: https://github.com/Bumihd/pastegate/releases/tag/v0.1.0-alpha.2
[0.1.0-alpha.1]: https://github.com/Bumihd/pastegate/releases/tag/v0.1.0-alpha.1
