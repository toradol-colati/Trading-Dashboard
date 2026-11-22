"""Price recorder: reads stream:prices with its own consumer group and writes
price_ticks (raw, 30 day retention) and price_bars_1m (kept forever).

worker-broker and the API's consumer group (cg:api) are not touched: Redis
streams deliver every entry to every group independently.
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any

import asyncpg
import redis.asyncio as aioredis
import structlog

from .parsing import Tick, aggregate_bars, parse_tick

logger = structlog.get_logger()

STREAM = "stream:prices"
GROUP = "cg:recorder"
CONSUMER = "recorder-1"

UPSERT_BAR = """
INSERT INTO price_bars_1m (bucket, venue, symbol, open, high, low, close, volume, trade_count)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
ON CONFLICT (venue, symbol, bucket) DO UPDATE SET
    high = GREATEST(price_bars_1m.high, EXCLUDED.high),
    low = LEAST(price_bars_1m.low, EXCLUDED.low),
    close = EXCLUDED.close,
    volume = price_bars_1m.volume + EXCLUDED.volume,
    trade_count = price_bars_1m.trade_count + EXCLUDED.trade_count
"""


class TickRecorder:
    def __init__(self, redis_url: str, pool: asyncpg.Pool) -> None:
        self.redis = aioredis.from_url(redis_url)
        self.pool = pool
        self.stats: dict[str, Any] = {
            "ticks_written": 0,
            "bars_upserted": 0,
            "last_tick_at": None,
            "last_error": None,
            "running": False,
        }

    async def ensure_group(self) -> None:
        try:
            # '$' = start from new entries; history comes from the daily backfill
            await self.redis.xgroup_create(STREAM, GROUP, id="$", mkstream=True)
            logger.info("recorder_group_created", stream=STREAM, group=GROUP)
        except aioredis.ResponseError as exc:
            if "BUSYGROUP" not in str(exc):
                raise

    async def write(self, ticks: list[Tick]) -> None:
        if not ticks:
            return
        bars = aggregate_bars(ticks)
        async with self.pool.acquire() as conn:
            async with conn.transaction():
                await conn.copy_records_to_table(
                    "price_ticks",
                    records=[(t.time, t.venue, t.symbol, t.price, t.volume, t.side) for t in ticks],
                    columns=["time", "venue", "symbol", "price", "volume", "side"],
                )
                await conn.executemany(UPSERT_BAR, [
                    (b.bucket, b.venue, b.symbol, b.open, b.high, b.low, b.close, b.volume, b.trade_count)
                    for b in bars
                ])
        self.stats["ticks_written"] += len(ticks)
        self.stats["bars_upserted"] += len(bars)
        self.stats["last_tick_at"] = ticks[-1].time.isoformat()

    async def process(self, entries: list) -> int:
        ids: list[bytes] = []
        ticks: list[Tick] = []
        for entry_id, fields in entries:
            ids.append(entry_id)
            if fields.get(b"channel") != b"prices":
                continue  # order book snapshots: not stored in M0
            try:
                ticks.append(parse_tick(fields[b"data"]))
            except Exception as exc:  # noqa: BLE001
                logger.error("tick_parse_failed", entry=entry_id, error=str(exc))
        await self.write(ticks)
        if ids:
            await self.redis.xack(STREAM, GROUP, *ids)
        return len(ticks)

    async def run(self) -> None:
        self.stats["running"] = True
        backoff = 1.0
        while True:
            try:
                await self.ensure_group()
                # First deliver anything read but not acknowledged before a restart
                pending = await self.redis.xreadgroup(GROUP, CONSUMER, {STREAM: "0"}, count=1000)
                for _, entries in pending or []:
                    await self.process(entries)
                while True:
                    resp = await self.redis.xreadgroup(GROUP, CONSUMER, {STREAM: ">"}, count=500, block=2000)
                    for _, entries in resp or []:
                        await self.process(entries)
                    backoff = 1.0
            except asyncio.CancelledError:
                self.stats["running"] = False
                raise
            except Exception as exc:  # noqa: BLE001 - keep going, but make the failure visible
                self.stats["last_error"] = {
                    "at": datetime.now(timezone.utc).isoformat(),
                    "error": f"{type(exc).__name__}: {exc}",
                }
                logger.error("tick_recorder_error", error=str(exc), retry_in=backoff)
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 60.0)
