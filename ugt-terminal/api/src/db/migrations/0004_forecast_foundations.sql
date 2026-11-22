-- ─────────────────────────────────────────────────────────────
-- Migration 0004: Forecast foundations (M0)
-- Additive only: new tables, one new unique index on a table that
-- nothing writes yet, and two retention policies switched off so
-- that history is kept instead of being deleted.
-- ─────────────────────────────────────────────────────────────

-- ── Permanent 1-minute bars built from the live tick stream ──
-- price_ticks keeps its 30 day retention (raw ticks are heavy);
-- these bars are kept forever and are what the models read.
CREATE TABLE IF NOT EXISTS price_bars_1m (
    bucket       TIMESTAMPTZ NOT NULL,
    venue        TEXT NOT NULL,
    symbol       TEXT NOT NULL,
    open         NUMERIC(28, 12) NOT NULL,
    high         NUMERIC(28, 12) NOT NULL,
    low          NUMERIC(28, 12) NOT NULL,
    close        NUMERIC(28, 12) NOT NULL,
    volume       NUMERIC(28, 12) NOT NULL DEFAULT 0,
    trade_count  INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (venue, symbol, bucket)
);
SELECT create_hypertable('price_bars_1m', 'bucket',
    chunk_time_interval => INTERVAL '30 days', if_not_exists => TRUE);

-- ── Daily history (backfill + daily update), no retention ────
CREATE TABLE IF NOT EXISTS market_daily (
    source   TEXT NOT NULL,          -- 'binance', 'fred', 'stooq'
    symbol   TEXT NOT NULL,          -- 'BTCUSDT', 'SP500', ...
    day      DATE NOT NULL,
    open     DOUBLE PRECISION,
    high     DOUBLE PRECISION,
    low      DOUBLE PRECISION,
    close    DOUBLE PRECISION NOT NULL,
    volume   DOUBLE PRECISION,
    PRIMARY KEY (source, symbol, day)
);
CREATE INDEX IF NOT EXISTS idx_market_daily_symbol_day ON market_daily (symbol, day DESC);

-- ── Full macro and sentiment-index history, no retention ─────
CREATE TABLE IF NOT EXISTS macro_history (
    source     TEXT NOT NULL,        -- 'fred', 'alternative_me'
    series_id  TEXT NOT NULL,        -- 'CPIAUCSL', 'FNG', ...
    obs_date   DATE NOT NULL,
    value      DOUBLE PRECISION NOT NULL,
    PRIMARY KEY (source, series_id, obs_date)
);

-- ── Hourly news sentiment (raw mean, kept forever) ──────────
CREATE TABLE IF NOT EXISTS sentiment_hourly (
    hour           TIMESTAMPTZ NOT NULL,
    ticker         TEXT NOT NULL,
    source_class   source_class_enum NOT NULL,
    mean_compound  DOUBLE PRECISION NOT NULL,
    article_count  INTEGER NOT NULL,
    PRIMARY KEY (ticker, source_class, hour)
);

-- sentiment_timeseries has never been written: a unique index lets
-- the recorder upsert the hourly z-scores without duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS uq_sentiment_ts_ticker_class_time
    ON sentiment_timeseries (ticker, source_class, time);

-- ── Forecast engine output ──────────────────────────────────
CREATE TABLE IF NOT EXISTS forecast_results (
    id           BIGSERIAL PRIMARY KEY,
    module       TEXT NOT NULL,      -- 'M0_smoke', 'M1_radar', ...
    symbol       TEXT NOT NULL,
    computed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status       TEXT NOT NULL,      -- 'ok' | 'error'
    params       JSONB,
    result       JSONB
);
CREATE INDEX IF NOT EXISTS idx_forecast_results_lookup
    ON forecast_results (module, symbol, computed_at DESC);

-- Every daily forecast, logged for live out-of-sample scoring (M6).
CREATE TABLE IF NOT EXISTS forecast_log (
    model        TEXT NOT NULL,
    symbol       TEXT NOT NULL,
    issued_on    DATE NOT NULL,
    horizon      INTEGER NOT NULL,
    target_date  DATE NOT NULL,
    point        DOUBLE PRECISION,
    lo80         DOUBLE PRECISION,
    hi80         DOUBLE PRECISION,
    lo95         DOUBLE PRECISION,
    hi95         DOUBLE PRECISION,
    PRIMARY KEY (model, symbol, issued_on, horizon)
);

-- ── Job runs: every collector run leaves a trace, failures included ──
CREATE TABLE IF NOT EXISTS data_job_runs (
    id           BIGSERIAL PRIMARY KEY,
    job          TEXT NOT NULL,
    started_at   TIMESTAMPTZ NOT NULL,
    finished_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status       TEXT NOT NULL,      -- 'ok' | 'error'
    rows_written INTEGER NOT NULL DEFAULT 0,
    detail       TEXT
);
CREATE INDEX IF NOT EXISTS idx_data_job_runs_job ON data_job_runs (job, finished_at DESC);

-- ── Keep history: these two tables are small, nothing gets deleted ──
SELECT remove_retention_policy('sentiment_timeseries', if_exists => TRUE);
SELECT remove_retention_policy('macro_series', if_exists => TRUE);
