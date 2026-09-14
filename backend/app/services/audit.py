import json
from typing import Any
from sqlalchemy.orm import Session
from app.models.audit_log import AuditLog


def _json(value: Any) -> str | None:
    if value is None:
        return None
    return json.dumps(value, default=str, sort_keys=True)


def write_audit(
    db: Session,
    *,
    company_id: int,
    user_id: int | None,
    action: str,
    entity_type: str | None = None,
    entity_id: int | None = None,
    old_value: Any = None,
    new_value: Any = None,
) -> None:
    db.add(AuditLog(
        company_id=company_id,
        user_id=user_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        old_value=_json(old_value),
        new_value=_json(new_value),
    ))
