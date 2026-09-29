# Security Policy

Pastegate is a clipboard-DLP tool that handles authentication secrets, API
keys and (hashed) device identifiers. Security reports are taken seriously.

## Reporting a vulnerability

**Please do not open public GitHub issues for security vulnerabilities.**

Instead, use GitHub's private vulnerability reporting
(**Security → Report a vulnerability**) or email the maintainers. Include:

- affected component (extension / backend / dashboard / installer),
- version or commit hash,
- a description and, if possible, steps to reproduce.

We aim to acknowledge reports within a few working days.

## Scope / design guarantees

- The browser extension performs detection **locally**. No clipboard plaintext
  is sent to the server — only category, severity, a URL hash and a device hash.
- API keys are stored as **HMAC-SHA256** hashes, never in plaintext.
- Device IDs are stored as non-reversible HMAC-SHA256 hashes (server-side salt).
- JWTs use a fixed signing algorithm with an explicit allow-list on decode.
- TOTP QR codes are rendered **server-side**; the TOTP secret never leaves the
  self-hosted trust boundary (no third-party chart/QR service).

## Hardening checklist for operators

- Terminate TLS in front of the backend (the installer offers own-cert,
  Let's Encrypt or self-signed). Do not expose the app over plain HTTP.
- Keep `SECRET_KEY`, `HMAC_SALT` and `SETUP_TOKEN` out of version control
  (see `.gitignore`) and rotate them if leaked.
- Restrict dashboard access by role (RBAC: itsec, infosec, admin, management,
  dataprivacy, viewer).
- Enable TOTP 2FA for privileged accounts.
