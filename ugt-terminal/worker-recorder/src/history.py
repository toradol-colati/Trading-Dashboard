"""Daily history collectors. Each one fills from scratch on the first run and
then only adds the days that are missing. Upserts only: nothing is deleted.

Sources (all free, no API key needed):
- Binance public market data: daily klines since 2018 for crypto pairs.
- FRED fredgraph.csv: the full history of each macro series.
- Stooq: S&P 500 index daily OHLC.
- alternative.me: Crypto Fear & Greed index (since 2018).
"""
from __future__ import annotations

import os
import time
from datetime import date, datetime, timedelta, timezone

import aiohttp
import asyncpg

from .parsing import DailyBar, parse_binance_klines, parse_fear_greed, parse_fred_csv, parse_stooq_csv

HISTORY_START = date(2018, 1, 1)
BINANCE_BASE = os.getenv("BINANCE_DATA_URL", "https://data-api.binance.vision")
BINANCE_SYMBOLS = [s.strip().upper() for s in os.getenv(
    "HISTORY_BINANCE_SYMBOLS", "BTCUSDT,ETHUSDT,BTCEUR,ETHEUR").split(",") if s.strip()]
FRED_SERIES = [s.strip().upper() for s in os.getenv(
    "HISTORY_FRED_SERIES",
    "CPIAUCSL,FEDFUNDS,DFEDTARU,DFEDTARL,DGS10,DGS2,T10Y2Y,UNRATE,SP500,NASDAQCOM,DTWEXBGS,M2SL,VIXCLS,DCOILWTICO",
).split(",") if s.strip()]
STOOQ_SYMBOLS = {"SPX": "^spx"}
TIMEOUT = aiohttp.ClientTimeout(total=60)
HEADERS = {"User-Agent": "ugt-terminal/0.1 (personal research)"}

UPSERT_DAILY = """
INSERT INTO market_daily (source, symbol, day, open, high, low, close, volume)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
ON CONFLICT (source, symbol, day) DO UPDATE SET
    open = EXCLUDED.open, high = EXCLUDED.high, low = EXCLUDED.low,
    close = EXCLUDED.close, volume = EXCLUDED.volume
"""

UPSERT_MACRO = """
INSERT INTO macro_history (source, series_id, obs_date, value)
VALUES ($1, $2, $3, $4)
ON CONFLICT (source, series_id, obs_date) DO UPDATE SET value = EXCLUDED.value
"""


class SourceError(RuntimeError):
    pass


async def _get(session: aiohttp.ClientSession, url: str, **params) -> aiohttp.ClientResponse:
    resp = await session.get(url, params=params or None, headers=HEADERS, timeout=TIMEOUT)
    if resp.status != 200:
        body = (await resp.text())[:200]
        raise SourceError(f"HTTP {resp.status} from {url}: {body}")
    return resp


async def _write_daily(pool: asyncpg.Pool, source: str, symbol: str, bars: list[DailyBar]) -> int:
    if bars:
        await pool.executemany(UPSERT_DAILY, [
            (source, symbol, b.day, b.open, b.high, b.low, b.close, b.volume) for b in bars
        ])
    return len(bars)


async def binance_daily(pool: asyncpg.Pool, session: aiohttp.ClientSession) -> int:
    written = 0
    errors: list[str] = []
    for symbol in BINANCE_SYMBOLS:
        try:
            last = await pool.fetchval(
                "SELECT max(day) FROM market_daily WHERE source = 'binance' AND symbol = $1", symbol)
            start = (last + timedelta(days=1)) if last else HISTORY_START
            start_ms = int(datetime(start.year, start.month, start.day, tzinfo=timezone.utc).timestamp() * 1000)
            while True:
                resp = await _get(session, f"{BINANCE_BASE}/api/v3/klines",
                                  symbol=symbol, interval="1d", startTime=start_ms, limit=1000)
                rows = await resp.json()
                if not rows:
                    break
                written += await _write_daily(pool, "binance", symbol,
                                              parse_binance_klines(rows, int(time.time() * 1000)))
                if len(rows) < 1000:
                    break
                start_ms = int(rows[-1][0]) + 86_400_000
        except Exception as exc:  # noqa: BLE001 - one bad symbol must not hide the others
            errors.append(f"{symbol}: {exc}")
    if errors:
        raise SourceError(f"{written} rows written, failed: " + "; ".join(errors))
    return written


async def fred_history(pool: asyncpg.Pool, session: aiohttp.ClientSession) -> int:
    written = 0
    errors: list[str] = []
    for series in FRED_SERIES:
        try:
            resp = await _get(session, "https://fred.stlouisfed.org/graph/fredgraph.csv", id=series)
            obs = parse_fred_csv(await resp.text())
            if not obs:
                raise SourceError("empty series")
            await pool.executemany(UPSERT_MACRO, [("fred", series, d, v) for d, v in obs])
            written += len(obs)
        except Exception as exc:  # noqa: BLE001
            errors.append(f"{series}: {exc}")
    if errors:
        raise SourceError(f"{written} rows written, failed: " + "; ".join(errors))
    return written


async def stooq_daily(pool: asyncpg.Pool, session: aiohttp.ClientSession) -> int:
    written = 0
    for symbol, code in STOOQ_SYMBOLS.items():
        resp = await _get(session, "https://stooq.com/q/d/l/", s=code, i="d")
        bars = parse_stooq_csv(await resp.text(), min_day=date(1990, 1, 1))
        written += await _write_daily(pool, "stooq", symbol, bars)
    return written


async def fear_greed(pool: asyncpg.Pool, session: aiohttp.ClientSession) -> int:
    resp = await _get(session, "https://api.alternative.me/fng/", limit="0", format="json")
    obs = parse_fear_greed(await resp.json(content_type=None))
    await pool.executemany(UPSERT_MACRO, [("alternative_me", "FNG", d, v) for d, v in obs])
    return len(obs)


COLLECTORS = {
    "history_binance": binance_daily,
    "history_fred": fred_history,
    "history_stooq": stooq_daily,
    "history_fear_greed": fear_greed,
}
