"""SQLAlchemy 2.x Base, MySQL 8.4 UUIDChar type, and UTC timestamp helpers."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import CHAR, DateTime, TypeDecorator
from sqlalchemy.dialects import mysql
from sqlalchemy.orm import DeclarativeBase


def new_uuid() -> str:
    return str(uuid.uuid4())


def utcnow() -> datetime:
    """Return a timezone-naive UTC datetime matching MySQL DATETIME(6) UTC storage."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


class UUIDChar(TypeDecorator):
    """Maps MySQL `CHAR(36) CHARACTER SET ascii COLLATE ascii_bin` cleanly."""

    impl = CHAR(36)
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "mysql":
            return dialect.type_descriptor(
                mysql.CHAR(36, charset="ascii", collation="ascii_bin")
            )
        return dialect.type_descriptor(CHAR(36))

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        return str(value)


class UTCDateTime(TypeDecorator):
    """Maps MySQL `DATETIME(6)` normalized strictly to UTC."""

    impl = DateTime
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "mysql":
            return dialect.type_descriptor(mysql.DATETIME(fsp=6))
        return dialect.type_descriptor(DateTime(timezone=False))

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if isinstance(value, datetime) and value.tzinfo is not None:
            return value.astimezone(timezone.utc).replace(tzinfo=None)
        return value


class Base(DeclarativeBase):
    pass
