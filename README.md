# Pastegate

> **Alpha version (0.1.0-alpha.2).** It works, but it is not finished.
> Things can still change before version 1.0. Make a backup before you update.

Pastegate stops people from pasting secrets into websites by accident.

Example: someone copies a password or an API key and pastes it into ChatGPT.
Pastegate sees the secret **before** it is pasted and shows a warning.
The user can cancel, or paste anyway (if you allow it).

It has two parts:

1. **A browser extension** (Chrome, Edge). It checks what you paste.
2. **A server** you run yourself. It collects the warnings and shows them in a dashboard.

Website: https://pastegate.zerotrustlab.de

## What gets detected

100 built-in rules, for example:

- API keys and tokens (AWS, GitHub, OpenAI, Stripe, Slack, …)
- Passwords, private keys, database connection strings
- Credit card numbers, IBANs
- ID card, passport, tax and social security numbers (DE, AT, CH, EU, US, UK)

You can add your own rules in the dashboard.

## What gets sent to the server

The check happens in the browser. **The pasted text is never sent anywhere.**

The server only gets:

- which rule matched (for example "AWS Access Key") and how serious it is
- the website (for example `chatgpt.com`)
- a hash of the full URL (not the URL itself)
- a random ID for the device (not the person's name)

You can link a device to a person. Only the security roles (itsec, infosec) can see that,
and every time they look, it is written to the audit log.

## Install the server

You need:

- a Linux server with root access and internet access
- a domain name or IP address that the users' computers can reach

```bash
git clone https://github.com/Bumihd/pastegate.git
cd pastegate
sudo bash install.sh
```

The installer asks for your domain and how you want HTTPS
(your own certificate, Let's Encrypt, or self-signed).
It uses Podman or Docker if available, otherwise it installs everything directly.

At the end it shows a **setup URL** and a **setup token**:

1. Open `https://<your-domain>/setup` in your browser.
2. Enter the setup token.
3. Create the admin account and the first API key.

For all installer options: `bash install.sh --help`

### Uninstall

```bash
sudo bash uninstall.sh           # removes the app, keeps the database and backups
sudo bash uninstall.sh --purge   # removes everything, including the database
```

## Install the extension

1. In the dashboard, go to **Build extension** and download the package.
   It already contains your server address and API key.
2. To test it: unzip it, open `chrome://extensions`, turn on **Developer mode**,
   click **Load unpacked** and select the folder.
3. For all company computers: roll it out with Intune or another MDM.
   The dashboard has a step-by-step guide (**MDM guide**).

Users do not have to set anything up.

## Roles

| Role        | What they see                                  |
|-------------|------------------------------------------------|
| itsec       | all events, API access, reports                |
| infosec     | all events, API access, reports                |
| admin       | settings, users, statistics                    |
| management  | reports only                                   |
| dataprivacy | anonymous data, compliance reports, audit log  |
| viewer      | only the devices assigned to them              |

## Known limitations

- Firefox is not supported yet.
- The extension is not in the Chrome Web Store yet.
- Updates between alpha versions are not fully tested on every setup. Make a backup first.

## Folders

```
extension/   browser extension
backend/     server (Python, FastAPI, PostgreSQL)
dashboard/   web dashboard (React)
install.sh   installer
```

## More

- [CONTRIBUTING.md](CONTRIBUTING.md): how to run it locally and run the tests
- [CHANGELOG.md](CHANGELOG.md): what changed in each version
- [SECURITY.md](SECURITY.md): how to report a security problem (please not as a public issue)

## License

Pastegate is open source under the [GNU AGPL v3](LICENSE), with one extra rule in [NOTICE](NOTICE).

In short:

- You can use Pastegate for free, also in your company.
- You can change it, share it, and even sell it or sell support for it.
- If you give your version to others, or run it as a service for others,
  you must publish your source code under the same license.
- You must keep "Pastegate by Bumihd" with the link visible in the dashboard
  and in the extension popup.

Using Pastegate inside your own company does not mean you have to publish anything.

This short version is not legal advice. The [LICENSE](LICENSE) and [NOTICE](NOTICE) files are what counts.
