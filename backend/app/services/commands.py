"""Retry-safe commands serialized across application replicas on PostgreSQL."""
import hashlib
import json
from decimal import Decimal
from fastapi import HTTPException
from sqlalchemy import text
from app.models.command_receipt import CommandReceipt


def _canonical(value):
    if isinstance(value, Decimal):
        return format(value.normalize(), "f")
    if isinstance(value, dict):
        return {k: _canonical(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_canonical(v) for v in value]
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return value


def begin_invoice_command(db, user, key, data):
    if key is None:
        return None, None
    if not key or len(key) > 128 or not key.isascii() or any(ord(c) < 33 or ord(c) > 126 for c in key):
        raise HTTPException(400, "Idempotency-Key must contain 1-128 printable non-space ASCII characters")
    digest = hashlib.sha256(json.dumps(_canonical(data.model_dump()), sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    scope = f"{user.company_id}:{user.id}:sales.create:{key}"
    lock_id = int.from_bytes(hashlib.sha256(scope.encode()).digest()[:8], "big", signed=True)
    # Transaction-scoped lock also covers an uncertain/lost HTTP response.
    db.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": lock_id})
    receipt = db.query(CommandReceipt).filter_by(company_id=user.company_id, user_id=user.id, operation="sales.create", key=key).first()
    if receipt:
        if receipt.request_hash != digest:
            raise HTTPException(409, "IDEMPOTENCY_KEY_REUSED: submit the original payload or use a new key for a new invoice")
        return None, receipt.response
    return CommandReceipt(company_id=user.company_id, user_id=user.id, operation="sales.create", key=key, request_hash=digest), None
