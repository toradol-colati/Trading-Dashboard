import json
from datetime import date, datetime, timezone

import pytest

from src.parsing import (
    aggregate_bars, parse_binance_klines, parse_fear_greed, parse_fred_csv, parse_stooq_csv, parse_tick,
)


def tick(ms, price, vol=1.0, symbol="BTCEUR"):
    return parse_tick(json.dumps({"time": ms, "venue": "binance", "symbol": symbol,
                                  "price": price, "volume": vol, "side": "buy"}))


def test_parse_tick_converts_ms_to_utc():
    t = tick(1_700_000_000_000, 100.5)
    assert t.time == datetime(2023, 11, 14, 22, 13, 20, tzinfo=timezone.utc)
    assert t.symbol == "BTCEUR" and t.price == 100.5


def test_aggregate_bars_ohlcv_per_minute_and_symbol():
    base = 1_700_000_040_000  # 22:14:00
    bars = aggregate_bars([
        tick(base + 1_000, 10), tick(base + 2_000, 12, 2), tick(base + 3_000, 9), tick(base + 4_000, 11),
        tick(base + 61_000, 20),                 # next minute
        tick(base + 5_000, 5, symbol="ETHEUR"),  # other symbol, same minute
    ])
    by_key = {(b.symbol, b.bucket.minute): b for b in bars}
    b = by_key[("BTCEUR", 14)]
    assert (b.open, b.high, b.low, b.close, b.volume, b.trade_count) == (10, 12, 9, 11, 5, 4)
    assert by_key[("BTCEUR", 15)].open == 20
    assert by_key[("ETHEUR", 14)].trade_count == 1


def test_binance_klines_skip_open_day():
    day_ms = 1_704_067_200_000  # 2024-01-01
    rows = [
        [day_ms, "1", "2", "0.5", "1.5", "100", day_ms + 86_399_999],
        [day_ms + 86_400_000, "1.5", "3", "1", "2", "50", day_ms + 2 * 86_400_000 - 1],
    ]
    bars = parse_binance_klines(rows, now_ms=day_ms + 86_400_000 + 3_600_000)
    assert [b.day for b in bars] == [date(2024, 1, 1)]
    assert bars[0].close == 1.5


def test_fred_csv_skips_missing_values():
    text = "observation_date,DGS10\n2024-01-01,.\n2024-01-02,3.95\n"
    assert parse_fred_csv(text) == [(date(2024, 1, 2), 3.95)]


def test_stooq_refusal_is_an_error():
    with pytest.raises(ValueError):
        parse_stooq_csv("Exceeded the daily hits limit")


def test_stooq_csv():
    text = "Date,Open,High,Low,Close,Volume\n1989-12-29,1,1,1,1,0\n2024-01-02,4745.2,4754.33,4722.67,4742.83,3743050000\n"
    bars = parse_stooq_csv(text, min_day=date(1990, 1, 1))
    assert len(bars) == 1 and bars[0].close == 4742.83


def test_fear_greed():
    payload = {"data": [{"value": "25", "timestamp": "1704067200"}]}
    assert parse_fear_greed(payload) == [(date(2024, 1, 1), 25.0)]
