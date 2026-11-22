"""Hourly news sentiment.

1. sentiment_hourly: mean compound score per hour, ticker and source class
   (from the per-article scores worker-nlp already writes).
2. sentiment_timeseries: z-score of that mean against the previous 30 days
   of the same ticker and class. This is the table /api/sentiment reads.

Source classes use the same rule as the API (news-intelligence.ts):
crypto sources are listed, everything else is tradfi.
"""
from __future__ import annotations

import asyncpg

CRYPTO_SOURCES = ("CRYPTOPANIC", "COINDESK", "COINTELEGRAPH", "THEBLOCK", "COINMARKETCAP", "UGT_ENGINE")

# Recompute the last 48 hours every run: articles are often scored late.
RECOMPUTE_HOURS = 48
# A z-score needs a minimum of history to mean anything.
MIN_HOURS_FOR_Z = 24

AGGREGATE = """
INSERT INTO sentiment_hourly (hour, ticker, source_class, mean_compound, article_count)
SELECT date_trunc('hour', a.published_at) AS hour,
       s.ticker,
       (CASE WHEN upper(regexp_replace(a.source_code, '[^A-Za-z0-9]', '', 'g')) = ANY($2::text[])
             THEN 'crypto_native' ELSE 'tradfi' END)::source_class_enum AS source_class,
       avg(s.compound)::double precision,
       count(DISTINCT a.id)::int
FROM sentiment_scores s
JOIN news_articles a ON a.id = s.article_id
WHERE a.published_at >= $1
  AND a.published_at < date_trunc('hour', now())
GROUP BY 1, 2, 3
ON CONFLICT (ticker, source_class, hour) DO UPDATE SET
    mean_compound = EXCLUDED.mean_compound,
    article_count = EXCLUDED.article_count
"""

ZSCORES = """
WITH z AS (
    SELECT hour, ticker, source_class, article_count,
           (mean_compound - avg(mean_compound) OVER w)
             / NULLIF(stddev_samp(mean_compound) OVER w, 0) AS z,
           count(*) OVER w AS n
    FROM sentiment_hourly
    WINDOW w AS (PARTITION BY ticker, source_class ORDER BY hour
                 RANGE BETWEEN INTERVAL '30 days' PRECEDING AND CURRENT ROW)
)
INSERT INTO sentiment_timeseries (time, ticker, source_class, zscore, article_count)
SELECT hour, ticker, source_class,
       CASE WHEN n >= $2 THEN round(z::numeric, 4) END,
       article_count
FROM z
WHERE hour >= $1
ON CONFLICT (ticker, source_class, time) DO UPDATE SET
    zscore = EXCLUDED.zscore,
    article_count = EXCLUDED.article_count
"""


async def aggregate_sentiment(pool: asyncpg.Pool) -> int:
    async with pool.acquire() as conn:
        async with conn.transaction():
            has_rows = await conn.fetchval("SELECT EXISTS (SELECT 1 FROM sentiment_hourly)")
            # First run: everything already scored. Later runs: a sliding window.
            since = await conn.fetchval(
                "SELECT CASE WHEN $1 THEN date_trunc('hour', now()) - make_interval(hours => $2)"
                " ELSE '-infinity'::timestamptz END",
                has_rows, RECOMPUTE_HOURS,
            )
            status = await conn.execute(AGGREGATE, since, list(CRYPTO_SOURCES))
            await conn.execute(ZSCORES, since, MIN_HOURS_FOR_Z)
    return int(status.split()[-1])
