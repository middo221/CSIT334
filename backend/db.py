from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Any, Iterable

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "unipark.db"
SCHEMA_PATH = BASE_DIR / "schema.sql"


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    with connect() as conn:
        conn.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))


def one(query: str, params: Iterable[Any] = ()) -> sqlite3.Row | None:
    with connect() as conn:
        return conn.execute(query, tuple(params)).fetchone()


def all_rows(query: str, params: Iterable[Any] = ()) -> list[sqlite3.Row]:
    with connect() as conn:
        return conn.execute(query, tuple(params)).fetchall()


def execute(query: str, params: Iterable[Any] = ()) -> None:
    with connect() as conn:
        conn.execute(query, tuple(params))


def row_to_dict(row: sqlite3.Row | None) -> dict[str, Any] | None:
    if row is None:
        return None
    return dict(row)


def rows_to_dicts(rows: list[sqlite3.Row]) -> list[dict[str, Any]]:
    return [dict(r) for r in rows]
