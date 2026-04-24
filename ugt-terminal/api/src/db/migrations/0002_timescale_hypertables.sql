-- ─────────────────────────────────────────────────────────────
-- Migration 0002: TimescaleDB Hypertables + Continuous Aggregates
-- U.G.T. Strategic Terminal v1
-- ─────────────────────────────────────────────────────────────

-- ── Price Ticks ─────────────────────────────────────────────
-- Real-time trade data from Binance/Coinbase WebSockets.
-- Partition: 1 day. Retention: 30 days full resolution.

CREATE TABLE price_ticks (
    time    TIMESTAMPTZ NOT NULL,
    venue   TEXT NOT NULL,
    symbol  TEXT NOT NULL,
    price   NUMERIC(28, 12) NOT NULL,
    volume  NUMERIC(28, 12) NOT NULL DEFAULT 0,
    side    TEXT  -- 'buy' | 'sell' | NULL
);

SELECT create_hypertable('price_ticks', 'time',
    chunk_time_interval => INTERVAL '1 day');

CREATE INDEX idx_price_ticks_symbol_time
    ON price_ticks (symbol, time DESC);

-- Retention policy: drop chunks older than 30 days
SELECT add_retention_policy('price_ticks', INTERVAL '30 days');

-- ── Continuous Aggregates: OHLCV ────────────────────────────

-- 1-minute OHLCV
CREATE MATERIALIZED VIEW price_ohlcv_1m
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 minute', time) AS bucket,
    venue,
    symbol,
    first(price, time)  AS open,
    max(price)           AS high,
    min(price)           AS low,
    last(price, time)   AS close,
    sum(volume)          AS volume,
    count(*)             AS trade_count
FROM price_ticks
GROUP BY bucket, venue, symbol
WITH NO DATA;

SELECT add_continuous_aggregate_policy('price_ohlcv_1m',
    start_offset    => INTERVAL '3 minutes',
    end_offset      => INTERVAL '1 minute',
    schedule_interval => INTERVAL '1 minute');

-- 5-minute OHLCV
CREATE MATERIALIZED VIEW price_ohlcv_5m
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('5 minutes', time) AS bucket,
    venue,
    symbol,
    first(price, time)  AS open,
    max(price)           AS high,
    min(price)           AS low,
    last(price, time)   AS close,
    sum(volume)          AS volume,
    count(*)             AS trade_count
FROM price_ticks
GROUP BY bucket, venue, symbol
WITH NO DATA;

SELECT add_continuous_aggregate_policy('price_ohlcv_5m',
    start_offset    => INTERVAL '15 minutes',
    end_offset      => INTERVAL '5 minutes',
    schedule_interval => INTERVAL '5 minutes');

-- 1-hour OHLCV
CREATE MATERIALIZED VIEW price_ohlcv_1h
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 hour', time) AS bucket,
    venue,
    symbol,
    first(price, time)  AS open,
    max(price)           AS high,
    min(price)           AS low,
    last(price, time)   AS close,
    sum(volume)          AS volume,
    count(*)             AS trade_count
FROM price_ticks
GROUP BY bucket, venue, symbol
WITH NO DATA;

SELECT add_continuous_aggregate_policy('price_ohlcv_1h',
    start_offset    => INTERVAL '3 hours',
    end_offset      => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour');

-- 1-day OHLCV
CREATE MATERIALIZED VIEW price_ohlcv_1d
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 day', time) AS bucket,
    venue,
    symbol,
    first(price, time)  AS open,
    max(price)           AS high,
    min(price)           AS low,
    last(price, time)   AS close,
    sum(volume)          AS volume,
    count(*)             AS trade_count
FROM price_ticks
GROUP BY bucket, venue, symbol
WITH NO DATA;

SELECT add_continuous_aggregate_policy('price_ohlcv_1d',
    start_offset    => INTERVAL '3 days',
    end_offset      => INTERVAL '1 day',
    schedule_interval => INTERVAL '1 day');

-- ── Order Book L2 Snapshots ─────────────────────────────────
-- Heavy data — 7 day retention only.

CREATE TABLE order_book_l2_snapshots (
    time        TIMESTAMPTZ NOT NULL,
    venue       TEXT NOT NULL,
    symbol      TEXT NOT NULL,
    bids_json   JSONB NOT NULL,
    asks_json   JSONB NOT NULL
);

SELECT create_hypertable('order_book_l2_snapshots', 'time',
    chunk_time_interval => INTERVAL '1 day');

CREATE INDEX idx_l2_symbol_time
    ON order_book_l2_snapshots (symbol, time DESC);

SELECT add_retention_policy('order_book_l2_snapshots', INTERVAL '7 days');

-- ── On-chain Metrics ────────────────────────────────────────
-- TVL (DefiLlama), DEX volumes (DexScreener), Glassnode, Messari.

CREATE TABLE onchain_metrics (
    time            TIMESTAMPTZ NOT NULL,
    source          TEXT NOT NULL,
    metric          TEXT NOT NULL,
    chain           TEXT,
    value           NUMERIC(28, 8) NOT NULL,
    metadata_json   JSONB
);

SELECT create_hypertable('onchain_metrics', 'time',
    chunk_time_interval => INTERVAL '7 days');

CREATE INDEX idx_onchain_source_metric_time
    ON onchain_metrics (source, metric, time DESC);

-- 90 day retention for on-chain metrics
SELECT add_retention_policy('onchain_metrics', INTERVAL '90 days');

-- ── Macro Series ────────────────────────────────────────────
-- FRED, TradingEconomics data points.

CREATE TABLE macro_series (
    time        TIMESTAMPTZ NOT NULL,
    source      TEXT NOT NULL,
    series_id   TEXT NOT NULL,
    value       NUMERIC(28, 8) NOT NULL
);

SELECT create_hypertable('macro_series', 'time',
    chunk_time_interval => INTERVAL '30 days');

CREATE INDEX idx_macro_series_id_time
    ON macro_series (series_id, time DESC);

-- 1 year retention for macro data
SELECT add_retention_policy('macro_series', INTERVAL '365 days');

-- ── Sentiment Timeseries ────────────────────────────────────
-- Hourly Z-scores per ticker per source class.
-- Used for divergence computation.

CREATE TABLE sentiment_timeseries (
    time            TIMESTAMPTZ NOT NULL,
    ticker          TEXT NOT NULL,
    source_class    source_class_enum NOT NULL,
    zscore          NUMERIC(8, 4),
    article_count   INTEGER NOT NULL DEFAULT 0
);

SELECT create_hypertable('sentiment_timeseries', 'time',
    chunk_time_interval => INTERVAL '7 days');

CREATE INDEX idx_sentiment_ts_ticker_time
    ON sentiment_timeseries (ticker, time DESC);

CREATE INDEX idx_sentiment_ts_class_ticker_time
    ON sentiment_timeseries (source_class, ticker, time DESC);

-- 180 day retention for sentiment time series
SELECT add_retention_policy('sentiment_timeseries', INTERVAL '180 days');
