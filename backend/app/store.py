"""Reviewer decisions, persisted in SQLite so they survive a restart."""
from __future__ import annotations

import json
import os
import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path


class DecisionStore:
    def __init__(self, path: str | None = None):
        path = path or os.environ.get("GEOHARMONIZE_DB", "data/decisions.db")
        if path != ":memory:":
            Path(path).parent.mkdir(parents=True, exist_ok=True)
        self._db = sqlite3.connect(path, check_same_thread=False)
        self._lock = threading.Lock()
        self._db.execute(
            """CREATE TABLE IF NOT EXISTS decisions (
                run_id TEXT NOT NULL, entity_id TEXT NOT NULL, decision TEXT NOT NULL,
                resolutions TEXT NOT NULL, note TEXT NOT NULL, decided_at TEXT NOT NULL,
                PRIMARY KEY (run_id, entity_id))"""
        )
        self._db.commit()

    def put(self, run_id: str, entity_id: str, decision: str, resolutions: dict, note: str) -> dict:
        now = datetime.now(timezone.utc).isoformat(timespec="seconds")
        with self._lock:
            self._db.execute(
                "REPLACE INTO decisions VALUES (?,?,?,?,?,?)",
                (run_id, entity_id, decision, json.dumps(resolutions), note, now),
            )
            self._db.commit()
        return {"decision": decision, "resolutions": resolutions, "note": note, "decided_at": now}

    def delete(self, run_id: str, entity_id: str) -> None:
        with self._lock:
            self._db.execute("DELETE FROM decisions WHERE run_id=? AND entity_id=?", (run_id, entity_id))
            self._db.commit()

    def for_run(self, run_id: str) -> dict[str, dict]:
        with self._lock:
            rows = self._db.execute(
                "SELECT entity_id, decision, resolutions, note, decided_at FROM decisions WHERE run_id=?", (run_id,)
            ).fetchall()
        return {r[0]: {"decision": r[1], "resolutions": json.loads(r[2]), "note": r[3], "decided_at": r[4]} for r in rows}
