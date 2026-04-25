-- ─────────────────────────────────────────────────────────────
-- Migration 0003: News Intelligence Additive Schema
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS news_watchlist_tickers (
    ticker      TEXT PRIMARY KEY,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO news_watchlist_tickers (ticker, sort_order)
VALUES
    ('BTC', 0),
    ('ETH', 1),
    ('SOL', 2),
    ('SUI', 3),
    ('NASDAQ', 4),
    ('SPX', 5),
    ('DXY', 6),
    ('EURUSD', 7),
    ('GOLD', 8)
ON CONFLICT (ticker) DO NOTHING;

CREATE TABLE IF NOT EXISTS news_article_feedback (
    article_id       UUID PRIMARY KEY REFERENCES news_articles(id) ON DELETE CASCADE,
    rating           SMALLINT NOT NULL CHECK (rating IN (-1, 1, 2)),
    section_code     TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_news_feedback_section
    ON news_article_feedback (section_code, updated_at DESC);

CREATE TABLE IF NOT EXISTS news_saved_archive (
    article_id       UUID PRIMARY KEY REFERENCES news_articles(id) ON DELETE CASCADE,
    title            TEXT NOT NULL,
    summary          TEXT NOT NULL,
    url              TEXT,
    saved_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_news_archive_saved_at
    ON news_saved_archive (saved_at DESC);
