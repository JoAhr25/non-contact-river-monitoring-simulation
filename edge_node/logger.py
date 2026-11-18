"""Local SQLite timestamped hydrological & debris telemetry logger."""

from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional


SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS telemetry_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp_utc TEXT NOT NULL,
    water_level_m REAL NOT NULL,
    v_surface_ms REAL NOT NULL,
    v_mean_ms REAL NOT NULL,
    discharge_m3s REAL NOT NULL,
    debris_count INTEGER NOT NULL,
    hazard_index REAL NOT NULL,
    alert_level TEXT NOT NULL,
    lora_tx_ok INTEGER NOT NULL DEFAULT 0
);
"""


class TelemetryLogger:
    """Persists 5-second edge-node telemetry cycles to local SQLite."""

    def __init__(self, db_path: str | Path = "river_telemetry.db") -> None:
        self.db_path = Path(db_path)
        self._conn: Optional[sqlite3.Connection] = None

    def connect(self) -> None:
        """Open SQLite connection and ensure schema exists."""
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(str(self.db_path))
        self._conn.execute("PRAGMA journal_mode=WAL;")
        self._conn.execute(SCHEMA_SQL)
        self._conn.commit()

    def close(self) -> None:
        """Close SQLite connection."""
        if self._conn is not None:
            self._conn.close()
            self._conn = None

    def log_cycle(
        self,
        water_level_m: float,
        v_surface_ms: float,
        v_mean_ms: float,
        discharge_m3s: float,
        debris_count: int,
        hazard_index: float,
        alert_level: str,
        lora_tx_ok: bool,
        timestamp_utc: Optional[str] = None,
    ) -> int:
        """Insert a telemetry record and return its row ID."""
        if self._conn is None:
            raise RuntimeError("TelemetryLogger is not connected. Call connect() first.")

        ts = timestamp_utc or datetime.now(timezone.utc).isoformat()
        cur = self._conn.execute(
            """
            INSERT INTO telemetry_logs (
                timestamp_utc, water_level_m, v_surface_ms, v_mean_ms,
                discharge_m3s, debris_count, hazard_index, alert_level, lora_tx_ok
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                ts,
                round(water_level_m, 4),
                round(v_surface_ms, 4),
                round(v_mean_ms, 4),
                round(discharge_m3s, 4),
                int(debris_count),
                round(hazard_index, 2),
                alert_level,
                1 if lora_tx_ok else 0,
            ),
        )
        self._conn.commit()
        return int(cur.lastrowid)
