"""Job bookkeeping: every run is written to data_job_runs and kept in memory for /health.

No silent failures: an error is logged, stored with its message and shown by the API.
"""
from __future__ import annotations

import traceback
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable

import asyncpg
import structlog

logger = structlog.get_logger()


class JobTracker:
    def __init__(self) -> None:
        self.pool: asyncpg.Pool | None = None
        self.last: dict[str, dict[str, Any]] = {}

    async def run(self, job: str, fn: Callable[[], Awaitable[int]]) -> None:
        started = datetime.now(timezone.utc)
        status, rows, detail = "ok", 0, None
        try:
            rows = int(await fn() or 0)
        except Exception as exc:  # noqa: BLE001 - every failure must be recorded
            status, detail = "error", f"{type(exc).__name__}: {exc}"
            logger.error("job_failed", job=job, error=detail, trace=traceback.format_exc(limit=5))
        else:
            logger.info("job_ok", job=job, rows=rows)
        finished = datetime.now(timezone.utc)
        self.last[job] = {
            "status": status,
            "rows_written": rows,
            "detail": detail,
            "started_at": started.isoformat(),
            "finished_at": finished.isoformat(),
        }
        if self.pool is not None:
            try:
                await self.pool.execute(
                    "INSERT INTO data_job_runs (job, started_at, finished_at, status, rows_written, detail)"
                    " VALUES ($1, $2, $3, $4, $5, $6)",
                    job, started, finished, status, rows, detail,
                )
            except Exception as exc:  # noqa: BLE001
                logger.error("job_run_not_recorded", job=job, error=str(exc))


tracker = JobTracker()
