# app/cli.py
# Operational commands for the server (requires access to .env + DB).
#
#   python -m app.cli reset-password <username> [--disable-2fa]
#   python -m app.cli cleanup [--dry-run]
#
# For emergencies when no admin can log in anymore. The password is prompted
# interactively and hidden, never passed as an argument.

import argparse
import getpass
import sys

from sqlalchemy import func, select

from app.core import retention
from app.core.config import get_settings
from app.core.database import SessionLocal
from app.core.security import hash_password
from app.models.models import AuditLog, User

MIN_PASSWORD_LENGTH = 12


def reset_password(username: str, disable_2fa: bool) -> int:
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.username == username))
        if not user:
            print(f'User "{username}" not found.', file=sys.stderr)
            return 1

        password = getpass.getpass('New password: ')
        if len(password) < MIN_PASSWORD_LENGTH:
            print(f'Password must be at least {MIN_PASSWORD_LENGTH} characters.', file=sys.stderr)
            return 1
        if getpass.getpass('Repeat new password: ') != password:
            print('Passwords do not match.', file=sys.stderr)
            return 1

        user.password_hash = hash_password(password)
        user.is_active = True
        user.totp_failed_attempts = 0
        user.totp_locked_until = None
        if disable_2fa:
            user.totp_enabled = False
            user.totp_secret = None
        db.add(AuditLog(actor_id=user.id, action='password_reset_cli',
                        reason='2fa_disabled' if disable_2fa else None))
        db.commit()

    print(f'Password for "{username}" has been reset.' + (' 2FA disabled.' if disable_2fa else ''))
    return 0


def cleanup(dry_run: bool) -> int:
    """Run the cleanup now (otherwise runs automatically at startup and every 6 h)."""
    days = get_settings().device_retention_days
    with SessionLocal() as db:
        if dry_run:
            if days <= 0:
                print('DEVICE_RETENTION_DAYS=0 – device cleanup disabled.')
                return 0
            n = db.scalar(select(func.count()).select_from(retention.stale_devices(days).subquery()))
            print(f'{n} device(s) without contact for more than {days} days would be deleted.')
            return 0
        result = retention.run_cleanup(db)
    if result is None:
        print('Another cleanup is running – try again later.', file=sys.stderr)
        return 1
    print(f"Deleted: {result['devices']} device(s), {result['events']} event(s) past retention, "
          f"{result['revoked_tokens']} expired token revocation(s).")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog='python -m app.cli')
    sub = parser.add_subparsers(dest='command', required=True)
    p = sub.add_parser('reset-password', help='Reset a user password (interactive)')
    p.add_argument('username')
    p.add_argument('--disable-2fa', action='store_true', help='also remove the TOTP secret')
    c = sub.add_parser('cleanup', help='Run the retention cleanup now')
    c.add_argument('--dry-run', action='store_true', help='only count stale devices')
    args = parser.parse_args(argv)

    if args.command == 'reset-password':
        return reset_password(args.username, args.disable_2fa)
    if args.command == 'cleanup':
        return cleanup(args.dry_run)
    return 2


if __name__ == '__main__':
    sys.exit(main())
