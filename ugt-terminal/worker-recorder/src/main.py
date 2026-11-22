"""worker-recorder entry point (M0, data foundations).

- Continuous: live price stream → price_ticks + price_bars_1m.
- Hourly (minute 5): news sentiment → sentiment_hourly + sentiment_timeseries.
- Daily (00:30 UTC) and at start-up: history collectors → market_daily, macro_history.

/health answers 200 only while the database is reachable; every job's last
result is visible there, in Redis (status:worker-recorder) and in data_job_runs.
"""
from __future__ import annotations

import asyncio
import json
import os
from datetime import datetime, timedelta, timezone

import aiohttp
import asyncpg
import redis.asyncio as aioredis
import structlog
import uvicorn
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI
from fastapi.responses import JSONResponse

from .history import COLLECTORS
from .jobs import tracker
from .sentiment import aggregate_sentiment
from .ticks import TickRecorder

structlog.configure(processors=[
    structlog.processors.add_log_level,
    structlog.processors.TimeStamper(fmt="iso"),
    structlog.processors.JSONRenderer(),
])
logger = structlog.get_logger()

DATABASE_URL = os.environ.get("DATABASE_URL")
REDIS_URL = os.environ.get("REDIS_URL", "redis://redis:6379")
PORT = int(os.environ.get("CONTROL_PORT", "8004"))
HISTORY_ENABLED = os.environ.get("HISTORY_ENABLED", "true").lower() != "false"

app = FastAPI(title="UGT Recorder Worker")
state: dict = {"pool": None, "recorder": None, "scheduler": None, "tasks": []}


async def run_history() -> None:
    async with aiohttp.ClientSession() as session:
        for job, fn in COLLECTORS.items():
            await tracker.run(job, lambda fn=fn: fn(state["pool"], session))


async def run_sentiment() -> None:
    await tracker.run("sentiment_hourly", lambda: aggregate_sentiment(state["pool"]))


def status_payload() -> dict:
    recorder: TickRecorder | None = state["recorder"]
    jobs = tracker.last
    return {
        "service": "worker-recorder",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "ticks": recorder.stats if recorder else None,
        "jobs": jobs,
        "failing_jobs": sorted(j for j, r in jobs.items() if r["status"] != "ok"),
    }


async def heartbeat(redis: aioredis.Redis) -> None:
    while True:
        try:
            await redis.set("status:worker-recorder", json.dumps(status_payload()), ex=90)
        except Exception as exc:  # noqa: BLE001
            logger.error("heartbeat_failed", error=str(exc))
        await asyncio.sleep(30)


@app.on_event("startup")
async def startup() -> None:
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL missing: worker-recorder cannot start without a database.")
    pool = await asyncpg.create_pool(DATABASE_URL, min_size=1, max_size=5)
    # The API applies migrations at start-up: wait until migration 0004 exists.
    for attempt in range(60):
        if await pool.fetchval("SELECT to_regclass('public.data_job_runs') IS NOT NULL"):
            break
        logger.warning("waiting_for_migration_0004", attempt=attempt)
        await asyncio.sleep(5)
    else:
        raise RuntimeError("Migration 0004 not applied: start the api service first.")
    state["pool"] = tracker.pool = pool

    recorder = TickRecorder(REDIS_URL, pool)
    state["recorder"] = recorder
    state["tasks"] += [
        asyncio.create_task(recorder.run()),
        asyncio.create_task(heartbeat(aioredis.from_url(REDIS_URL))),
    ]

    scheduler = AsyncIOScheduler(timezone="UTC")
    soon = datetime.now(timezone.utc) + timedelta(seconds=15)
    scheduler.add_job(run_sentiment, "cron", minute=5, id="sentiment_hourly")
    scheduler.add_job(run_sentiment, "date", run_date=soon, id="sentiment_startup")
    if HISTORY_ENABLED:
        scheduler.add_job(run_history, "cron", hour=0, minute=30, id="history_daily")
        scheduler.add_job(run_history, "date", run_date=soon + timedelta(seconds=15), id="history_startup")
    scheduler.start()
    state["scheduler"] = scheduler
    logger.info("recorder_started", history=HISTORY_ENABLED)


@app.on_event("shutdown")
async def shutdown() -> None:
    for task in state["tasks"]:
        task.cancel()
    if state["scheduler"]:
        state["scheduler"].shutdown(wait=False)
    if state["pool"]:
        await state["pool"].close()


@app.get("/health")
async def health():
    try:
        await state["pool"].fetchval("SELECT 1")
    except Exception as exc:  # noqa: BLE001
        return JSONResponse(status_code=503, content={"status": "ERROR", "database": str(exc)})
    payload = status_payload()
    payload["status"] = "DEGRADED" if payload["failing_jobs"] else "OK"
    return payload


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=PORT)
