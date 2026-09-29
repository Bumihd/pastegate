# app/core/logging.py
# Structured JSON logging for SIEM integration (Wazuh, Splunk, Elastic).

import json
import logging
import sys
import time
import uuid
from contextvars import ContextVar
from datetime import datetime, timezone

# ContextVar for request IDs — isolated per async task
request_id_var: ContextVar[str | None] = ContextVar('request_id', default=None)


class JsonFormatter(logging.Formatter):
    """
    Formats log records as JSON lines.
    Schema:
      ts        - ISO 8601 UTC
      level     - DEBUG/INFO/WARNING/ERROR/CRITICAL
      logger    - logger name
      msg       - log message
      request_id - correlation ID (if set)
      ... further extras from record.__dict__
    """
    RESERVED_KEYS = {
        'name', 'msg', 'args', 'levelname', 'levelno', 'pathname', 'filename',
        'module', 'exc_info', 'exc_text', 'stack_info', 'lineno', 'funcName',
        'created', 'msecs', 'relativeCreated', 'thread', 'threadName',
        'processName', 'process', 'message', 'asctime', 'taskName',
    }

    def format(self, record: logging.LogRecord) -> str:
        payload = {
            'ts':     datetime.now(timezone.utc).isoformat(),
            'level':  record.levelname,
            'logger': record.name,
            'msg':    record.getMessage(),
        }

        rid = request_id_var.get()
        if rid:
            payload['request_id'] = rid

        # Add extras (e.g. log.info('x', extra={'foo': 'bar'}))
        for key, value in record.__dict__.items():
            if key not in self.RESERVED_KEYS and not key.startswith('_'):
                try:
                    json.dumps(value)  # make sure it is serializable
                    payload[key] = value
                except (TypeError, ValueError):
                    payload[key] = repr(value)

        if record.exc_info:
            payload['exception'] = self.formatException(record.exc_info)

        return json.dumps(payload, ensure_ascii=False)


def configure_logging(debug: bool = False) -> None:
    """
    Initialise the root logger with the JSON formatter on stdout.
    Called once at app startup.
    """
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())

    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(logging.DEBUG if debug else logging.INFO)

    # pass uvicorn loggers through — otherwise they get formatted twice
    for name in ('uvicorn', 'uvicorn.access', 'uvicorn.error'):
        lg = logging.getLogger(name)
        lg.handlers.clear()
        lg.propagate = True


def new_request_id() -> str:
    """Generate a new request ID (short, URL-safe)."""
    return uuid.uuid4().hex[:16]
