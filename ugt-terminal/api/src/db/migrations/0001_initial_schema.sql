-- ─────────────────────────────────────────────────────────────
-- Migration 0001: Initial Schema — Relational Tables
-- U.G.T. Strategic Terminal v1
-- ─────────────────────────────────────────────────────────────

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- ── Enums ───────────────────────────────────────────────────

CREATE TYPE broker_code_enum AS ENUM (
    'IBKR',
    'BINANCE',
    'COINBASE',
    'ROBINHOOD',
    'YOUNGPLATFORM',
    'YOUHODLER',
    'TRADEREPUBLIC'
);

CREATE TYPE broker_status_enum AS ENUM (
    'active',
    'inactive',
    'error',
    'syncing'
);

CREATE TYPE pac_frequency_enum AS ENUM (
    'weekly',
    'biweekly',
    'monthly'
);

CREATE TYPE source_class_enum AS ENUM (
    'crypto_native',
    'tradfi'
);

-- ── Broker Accounts ─────────────────────────────────────────
-- API keys are AES-256-GCM encrypted. NEVER store plaintext.

CREATE TABLE broker_accounts (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    broker_code     broker_code_enum NOT NULL,
    label           TEXT NOT NULL,
    -- Encrypted credential fields (AES-256-GCM)
    api_key_ciphertext      BYTEA,
    api_secret_ciphertext   BYTEA,
    api_passphrase_ciphertext BYTEA,
    nonce           BYTEA NOT NULL,
    tag             BYTEA NOT NULL,
    -- Metadata
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_sync_at    TIMESTAMPTZ,
    status          broker_status_enum NOT NULL DEFAULT 'inactive'
);

CREATE INDEX idx_broker_accounts_code ON broker_accounts (broker_code);

-- ── Portfolio Holdings ──────────────────────────────────────
-- Snapshot of current holdings per broker account.

CREATE TABLE portfolio_holdings (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    broker_account_id   UUID NOT NULL REFERENCES broker_accounts(id) ON DELETE CASCADE,
    symbol              TEXT NOT NULL,
    quantity            NUMERIC(28, 12) NOT NULL,
    avg_cost_basis      NUMERIC(28, 12),
    currency            TEXT NOT NULL DEFAULT 'EUR',
    asset_class         TEXT NOT NULL DEFAULT 'crypto',
    last_update_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (broker_account_id, symbol)
);

CREATE INDEX idx_holdings_broker_update
    ON portfolio_holdings (broker_account_id, last_update_at DESC);

-- ── PAC Plans ───────────────────────────────────────────────
-- Savings accumulation plans (Piano di Accumulo del Capitale).

CREATE TABLE pac_plans (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    label                   TEXT NOT NULL,
    -- Target allocation as JSON: {"BTC": 0.4, "ETH": 0.3, "VWCE": 0.3}
    target_allocation_json  JSONB NOT NULL,
    contribution_amount     NUMERIC(18, 2) NOT NULL,
    contribution_currency   TEXT NOT NULL DEFAULT 'EUR',
    frequency               pac_frequency_enum NOT NULL DEFAULT 'monthly',
    next_execution_date     DATE NOT NULL,
    active                  BOOLEAN NOT NULL DEFAULT TRUE,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── PAC Executions ──────────────────────────────────────────
-- Log of actual vs. planned executions.

CREATE TABLE pac_executions (
    id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    plan_id                     UUID NOT NULL REFERENCES pac_plans(id) ON DELETE CASCADE,
    executed_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    amount                      NUMERIC(18, 2) NOT NULL,
    -- Actual allocation at execution: {"BTC": 0.42, "ETH": 0.28, "VWCE": 0.30}
    asset_allocation_actual_json JSONB NOT NULL,
    slippage_vs_plan            NUMERIC(8, 4),
    broker_account_id           UUID REFERENCES broker_accounts(id),
    notes                       TEXT
);

CREATE INDEX idx_pac_executions_plan ON pac_executions (plan_id, executed_at DESC);

-- ── News Articles ───────────────────────────────────────────

CREATE TABLE news_articles (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_code         TEXT NOT NULL,
    external_id         TEXT NOT NULL,
    url                 TEXT,
    title               TEXT NOT NULL,
    body                TEXT,
    published_at        TIMESTAMPTZ NOT NULL,
    ingested_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    language            TEXT DEFAULT 'en',
    tickers_detected_json JSONB,
    UNIQUE (source_code, external_id)
);

CREATE INDEX idx_news_source_published
    ON news_articles (source_code, published_at DESC);
CREATE INDEX idx_news_tickers
    ON news_articles USING GIN (tickers_detected_json);

-- ── Sentiment Scores ────────────────────────────────────────
-- Per-ticker, per-article sentiment from FinBERT/CryptoBERT.

CREATE TABLE sentiment_scores (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    article_id      UUID NOT NULL REFERENCES news_articles(id) ON DELETE CASCADE,
    model_name      TEXT NOT NULL,
    score_positive  NUMERIC(6, 4) NOT NULL,
    score_negative  NUMERIC(6, 4) NOT NULL,
    score_neutral   NUMERIC(6, 4) NOT NULL,
    compound        NUMERIC(6, 4) NOT NULL,
    ticker          TEXT NOT NULL,
    UNIQUE (article_id, model_name, ticker)
);

CREATE INDEX idx_sentiment_ticker ON sentiment_scores (ticker, article_id);

-- ── Key Access Audit Log ────────────────────────────────────
-- Tracks every decryption of broker credentials. Retention 90d.

CREATE TABLE key_access_log (
    id                  BIGSERIAL PRIMARY KEY,
    timestamp           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    broker_account_id   UUID NOT NULL REFERENCES broker_accounts(id),
    operation           TEXT NOT NULL,
    caller_service      TEXT NOT NULL
);

CREATE INDEX idx_key_access_ts ON key_access_log (timestamp DESC);
