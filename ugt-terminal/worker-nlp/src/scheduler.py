import asyncio
import structlog
import os
import json
import redis.asyncio as redis
from apscheduler.schedulers.asyncio import AsyncIOScheduler

# Ingestors
from .ingestors.cryptopanic import CryptopanicIngestor
from .ingestors.rss_generic import RSSGenericIngestor
from .ingestors.scrape_fallback import ScrapeFallback

# NLP Store/Sinks
from .sinks.redis_stream import RedisStreamSink
from .sinks.timescale import TimescaleSink
from .nlp.ticker_ner import TickerNER
from .nlp.finbert import FinBERTPipeline
from .nlp.cryptobert import CryptoBERTPipeline
from .nlp.zscore import ZScoreCalculator

logger = structlog.get_logger()

# DST §4 News Config
RSS_FEEDS = [
    {"name": "CoinTelegraph", "url": "https://cointelegraph.com/rss", "class": "crypto_native"},
    {"name": "CoinDesk", "url": "https://www.coindesk.com/arc/outboundfeeds/rss/", "class": "crypto_native"},
    {"name": "TheBlock", "url": "https://www.theblock.co/rss.xml", "class": "crypto_native"},
    {"name": "Reuters", "url": "http://feeds.reuters.com/reuters/businessNews", "class": "tradfi"},
    {"name": "Bloomberg", "url": "https://www.bloomberg.com/feeds/bview/rss", "class": "tradfi"},
    {"name": "FinancialTimes", "url": "https://www.ft.com/?format=rss", "class": "tradfi"},
    {"name": "ilSole24ore", "url": "https://www.ilsole24ore.com/rss/economia.xml", "class": "tradfi"}
]

class NewsScheduler:
    def __init__(self):
        self.scheduler = AsyncIOScheduler()
        self.running = False
        self.active_ingestors = {}
        self.articles_processed = 0

        redis_url = os.getenv("REDIS_URL", "redis://127.0.0.1:6379")
        database_url = os.getenv("DATABASE_URL", "postgresql://ugt:changeme@127.0.0.1:5432/ugt_terminal")
        
        self.redis_sink = RedisStreamSink(redis_url)
        self.db_sink = TimescaleSink(database_url)
        self.redis_conn = redis.from_url(redis_url)
        
        self.ner = TickerNER()
        self.finbert = FinBERTPipeline()
        self.cryptobert = CryptoBERTPipeline()
        self.zscore_calc = ZScoreCalculator()
        self.fallback = ScrapeFallback()

    async def start(self):
        if self.running: return
        self.running = True
        
        # 1. Instantiate Ingestors
        cp_ingestor = CryptopanicIngestor()
        rss_ingestor = RSSGenericIngestor(RSS_FEEDS)
        
        # 2. Register Jobs
        self.scheduler.add_job(self._run_ingestor, 'interval', seconds=60, args=[cp_ingestor, "crypto_native"], id="cryptopanic")
        self.scheduler.add_job(self._run_ingestor, 'interval', seconds=300, args=[rss_ingestor, "mixed"], id="rss_generic")
        
        # 3. Status Heartbeat
        self.scheduler.add_job(self._report_status, 'interval', seconds=30)
        
        self.scheduler.start()
        logger.info("news_scheduler_started", ingestors=["cryptopanic", "rss_generic"])
        
        while self.running:
            await asyncio.sleep(1)

    async def _run_ingestor(self, ingestor, default_class: str):
        ingestor_name = ingestor.__class__.__name__
        try:
            articles = await ingestor.fetch_latest()
            for article in articles:
                source_class = article.get('class', default_class)
                await self.process_article(article, source_class)
            
            self.active_ingestors[ingestor_name] = {"status": "success", "last_count": len(articles)}
        except Exception as e:
            self.active_ingestors[ingestor_name] = {"status": f"error: {str(e)}"}
            logger.error("ingestor_failed", name=ingestor_name, error=str(e))

    async def process_article(self, article, source_class: str):
        # Full body fallback if missing
        if not article.get('body') and article.get('url'):
             article['body'] = await self.fallback.get_full_body(article['url'])

        # NER
        tickers = self.ner.extract(article['title'] + " " + (article.get('body') or ""))
        article['tickers'] = tickers
        
        # Sentiment
        model = self.cryptobert if source_class == 'crypto_native' else self.finbert
        sentiment = await model.analyze(article['title'])
        
        # Persist
        await self.db_sink.write_article(article, sentiment)
        await self.redis_sink.write_news(article, sentiment)
        self.articles_processed += 1
        
        # Z-Score
        for ticker in tickers:
            await self.zscore_calc.update(ticker, sentiment, source_class)

    async def _report_status(self):
        active_count = len([k for k, v in self.active_ingestors.items() if "success" in v['status']])
        status_data = {
            "active_sources_count": active_count, # Simplified for system monitor
            "ingestors": self.active_ingestors
        }
        await self.redis_conn.set("status:worker-nlp", json.dumps(status_data), ex=60)
