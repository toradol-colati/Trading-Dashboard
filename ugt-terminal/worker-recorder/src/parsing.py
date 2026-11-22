"""Pure parsing and aggregation helpers (no I/O), covered by tests/."""
from __future__ import annotations

import csv
import io
import json
from dataclasses import dataclass
from datetime import date, datetime, timezone
from typing import Iterable


# ── Live ticks ──────────────────────────────────────────────

@dataclass
class Tick:
    time: datetime
    venue: str
    symbol: str
    price: float
    volume: float
    side: str | None


def parse_tick(raw: str | bytes) -> Tick:
    """Parse the JSON payload worker-broker puts in stream:prices (time in ms)."""
    d = json.loads(raw)
    return Tick(
        time=datetime.fromtimestamp(float(d["time"]) / 1000.0, tz=timezone.utc),
        venue=str(d["venue"]),
        symbol=str(d["symbol"]).upper(),
        price=float(d["price"]),
        volume=float(d.get("volume") or 0.0),
        side=d.get("side"),
    )


@dataclass
class Bar:
    bucket: datetime
    venue: str
    symbol: str
    open: float
    high: float
    low: float
    close: float
    volume: float
    trade_count: int


def aggregate_bars(ticks: Iterable[Tick]) -> list[Bar]:
    """Group ticks into 1-minute OHLCV bars, keeping arrival order for open/close."""
    bars: dict[tuple[str, str, datetime], Bar] = {}
    for t in ticks:
        bucket = t.time.replace(second=0, microsecond=0)
        key = (t.venue, t.symbol, bucket)
        b = bars.get(key)
        if b is None:
            bars[key] = Bar(bucket, t.venue, t.symbol, t.price, t.price, t.price, t.price, t.volume, 1)
        else:
            b.high = max(b.high, t.price)
            b.low = min(b.low, t.price)
            b.close = t.price
            b.volume += t.volume
            b.trade_count += 1
    return list(bars.values())


# ── Daily history ───────────────────────────────────────────

@dataclass
class DailyBar:
    day: date
    open: float | None
    high: float | None
    low: float | None
    close: float
    volume: float | None


def parse_binance_klines(rows: list, now_ms: int) -> list[DailyBar]:
    """Binance /api/v3/klines rows → closed daily bars only (open time ms in [0], close time ms in [6])."""
    out: list[DailyBar] = []
    for r in rows:
        if int(r[6]) >= now_ms:  # the current day is still open
            continue
        out.append(DailyBar(
            day=datetime.fromtimestamp(int(r[0]) / 1000, tz=timezone.utc).date(),
            open=float(r[1]), high=float(r[2]), low=float(r[3]), close=float(r[4]), volume=float(r[5]),
        ))
    return out


def parse_fred_csv(text: str) -> list[tuple[date, float]]:
    """fredgraph.csv: header 'observation_date,<ID>' (older files: 'DATE,<ID>'); missing values are '.'."""
    reader = csv.reader(io.StringIO(text))
    header = next(reader, None)
    if not header or len(header) < 2:
        raise ValueError("FRED CSV without header")
    out: list[tuple[date, float]] = []
    for row in reader:
        if len(row) < 2 or row[1] in ("", "."):
            continue
        out.append((date.fromisoformat(row[0]), float(row[1])))
    return out


def parse_stooq_csv(text: str, min_day: date | None = None) -> list[DailyBar]:
    """Stooq daily CSV: Date,Open,High,Low,Close,Volume."""
    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames or "Close" not in reader.fieldnames:
        # Stooq answers 200 with a plain-text message when it refuses a download
        raise ValueError(f"Stooq returned no CSV: {text[:120]!r}")
    out: list[DailyBar] = []
    for row in reader:
        d = date.fromisoformat(row["Date"])
        if min_day and d < min_day:
            continue
        vol = row.get("Volume")
        out.append(DailyBar(
            day=d,
            open=float(row["Open"]), high=float(row["High"]), low=float(row["Low"]),
            close=float(row["Close"]), volume=float(vol) if vol not in (None, "") else None,
        ))
    return out


def parse_fear_greed(payload: dict) -> list[tuple[date, float]]:
    """alternative.me /fng/?limit=0 → (day, value 0-100)."""
    data = payload.get("data")
    if not isinstance(data, list):
        raise ValueError(f"Fear & Greed payload without data: {str(payload)[:120]}")
    return [
        (datetime.fromtimestamp(int(x["timestamp"]), tz=timezone.utc).date(), float(x["value"]))
        for x in data
    ]
