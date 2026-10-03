"""Reviewer decisions, persisted in SQLite so they survive a restart."""
from __future__ import annotations

import hashlib
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
        self._db.execute(
            """CREATE TABLE IF NOT EXISTS audit (
                seq INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, run_id TEXT NOT NULL, entity_id TEXT NOT NULL,
                action TEXT NOT NULL, payload TEXT NOT NULL, prev_hash TEXT NOT NULL, hash TEXT NOT NULL)"""
        )
        self._db.commit()

    # Every decision is also appended to a hash chain: each entry commits to the one before it,
    # so editing or deleting an old row breaks every hash after it.
    @staticmethod
    def _digest(prev: str, at: str, run_id: str, entity_id: str, action: str, payload: str) -> str:
        return hashlib.sha256("\x1f".join([prev, at, run_id, entity_id, action, payload]).encode()).hexdigest()

    def _append(self, at: str, run_id: str, entity_id: str, action: str, payload: dict) -> None:
        row = self._db.execute("SELECT hash FROM audit ORDER BY seq DESC LIMIT 1").fetchone()
        prev = row[0] if row else "genesis"
        body = json.dumps(payload, sort_keys=True)
        self._db.execute(
            "INSERT INTO audit (at, run_id, entity_id, action, payload, prev_hash, hash) VALUES (?,?,?,?,?,?,?)",
            (at, run_id, entity_id, action, body, prev, self._digest(prev, at, run_id, entity_id, action, body)),
        )

    def audit(self, limit: int = 12) -> dict:
        with self._lock:
            rows = self._db.execute(
                "SELECT seq, at, run_id, entity_id, action, payload, prev_hash, hash FROM audit ORDER BY seq").fetchall()
        ok, prev, bad_at = True, "genesis", None
        for seq, at, run_id, eid, action, payload, ph, h in rows:
            if ph != prev or h != self._digest(prev, at, run_id, eid, action, payload):
                ok, bad_at = False, seq
                break
            prev = h
        recent = [{"seq": r[0], "at": r[1], "run": r[2], "parcel": r[3], "action": r[4], "hash": r[7][:12]} for r in rows[-limit:]][::-1]
        return {"ok": ok, "length": len(rows), "head": prev[:12] if rows else None, "broken_at": bad_at, "recent": recent}

    def put(self, run_id: str, entity_id: str, decision: str, resolutions: dict, note: str) -> dict:
        now = datetime.now(timezone.utc).isoformat(timespec="seconds")
        with self._lock:
            self._db.execute(
                "REPLACE INTO decisions VALUES (?,?,?,?,?,?)",
                (run_id, entity_id, decision, json.dumps(resolutions), note, now),
            )
            self._append(now, run_id, entity_id, decision, {"resolutions": resolutions, "note": note})
            self._db.commit()
        return {"decision": decision, "resolutions": resolutions, "note": note, "decided_at": now}

    def delete(self, run_id: str, entity_id: str) -> None:
        with self._lock:
            self._db.execute("DELETE FROM decisions WHERE run_id=? AND entity_id=?", (run_id, entity_id))
            self._append(datetime.now(timezone.utc).isoformat(timespec="seconds"), run_id, entity_id, "undo", {})
            self._db.commit()

    def for_run(self, run_id: str) -> dict[str, dict]:
        with self._lock:
            rows = self._db.execute(
                "SELECT entity_id, decision, resolutions, note, decided_at FROM decisions WHERE run_id=?", (run_id,)
            ).fetchall()
        return {r[0]: {"decision": r[1], "resolutions": json.loads(r[2]), "note": r[3], "decided_at": r[4]} for r in rows}
