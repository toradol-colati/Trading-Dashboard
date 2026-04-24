import asyncpg
import json
from typing import Dict, Any

class TimescaleSink:
    def __init__(self, dsn: str):
        self.dsn = dsn
        self.pool = None

    async def connect(self):
        if not self.pool:
            self.pool = await asyncpg.create_pool(self.dsn)

    async def write_article(self, article: Dict[str, Any], sentiment: Dict[str, Any]):
        await self.connect()
        async with self.pool.acquire() as conn:
            # 1. Insert news article (UPSERT)
            article_id = await conn.fetchval(
                """
                INSERT INTO news_articles (source_code, external_id, url, title, body, published_at, tickers_detected_json)
                VALUES ($1, $2, $3, $4, $5, to_timestamp($6), $7)
                ON CONFLICT (source_code, external_id) DO UPDATE SET
                    tickers_detected_json = EXCLUDED.tickers_detected_json
                RETURNING id
                """,
                article['source_code'],
                article['external_id'],
                article.get('url'),
                article['title'],
                article.get('body'),
                article['published_at'] or 0, # timestamp
                json.dumps(article.get('tickers', []))
            )

            # 2. Insert sentiment scores
            if article_id:
                for ticker in (article.get('tickers', []) or [None]): # Score per ticker
                    await conn.execute(
                        """
                        INSERT INTO sentiment_scores (article_id, model_name, score_positive, score_negative, score_neutral, compound, ticker)
                        VALUES ($1, $2, $3, $4, $5, $6, $7)
                        ON CONFLICT (article_id, model_name, ticker) DO NOTHING
                        """,
                        article_id,
                        sentiment['model'],
                        sentiment['score_positive'],
                        sentiment['score_negative'],
                        sentiment['score_neutral'],
                        sentiment['compound'],
                        ticker or 'GENERAL'
                    )
