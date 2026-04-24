import asyncio
import structlog
import os
import redis.asyncio as redis
from apscheduler.schedulers.asyncio import AsyncIOScheduler

# Core Sinks
from .sinks.redis_stream import RedisStreamSink
from .sinks.timescale import TimescaleSink

# Clients
from .clients.coinmarketcap import CoinMarketCapClient
from .clients.fred import FREDClient
from .clients.defillama import DefiLlamaClient
from .clients.dexscreener import DexScreenerClient
from .clients.dune import DuneClient
from .clients.messari import MessariClient
from .clients.tradingeconomics import TradingEconomicsClient

# Scrapers
from .scrapers.glassnode import GlassnodeScraper
from .scrapers.arkham import ArkhamScraper
from .scrapers.macromicro import MacroMicroScraper
from .scrapers.forexfactory import ForexFactoryScraper

logger = structlog.get_logger()

class DataScheduler:
    def __init__(self):
        self.scheduler = AsyncIOScheduler()
        self.running = False
        self.active_sources = {}
        
        redis_url = os.getenv("REDIS_URL", "redis://redis:6379")
        db_url = os.getenv("DATABASE_URL")
        
        self.redis_sink = RedisStreamSink(redis_url)
        self.db_sink = TimescaleSink(db_url)
        self.redis_conn = redis.from_url(redis_url)

    async def start(self):
        if self.running: return
        self.running = True
        
        # 1. Instantiate Sources (7 Clients + 4 Scrapers)
        sources = [
            (CoinMarketCapClient(), 600, "market"),
            (FREDClient(), 14400, "macro"),
            (DefiLlamaClient(), 3600, "onchain"),
            (DexScreenerClient(), 300, "market"),
            (DuneClient(), 3600, "onchain"),
            (MessariClient(), 3600, "market"),
            (TradingEconomicsClient(), 3600, "macro"),
            (GlassnodeScraper(), 3600, "onchain"),
            (ArkhamScraper(), 3600, "onchain"),
            (MacroMicroScraper(), 14400, "macro"),
            (ForexFactoryScraper(), 3600, "macro")
        ]
        
        for source, interval, domain in sources:
            await self.add_source_job(source, interval, domain)
            
        # 2. Status Heartbeat
        self.scheduler.add_job(self._report_status, 'interval', seconds=30)
        
        self.scheduler.start()
        logger.info("scheduler_started", active_count=len(sources))
        
        while self.running:
            await asyncio.sleep(1)

    async def add_source_job(self, source, interval_seconds: int, domain: str):
        source_name = source.__class__.__name__
        self.active_sources[source_name] = {"last_run": None, "status": "pending"}
        self.scheduler.add_job(
            self._run_source,
            'interval',
            seconds=interval_seconds,
            args=[source, domain],
            id=source_name
        )

    async def _run_source(self, source, domain: str):
        source_name = source.__class__.__name__
        try:
            records = await source.run()
            if records:
                await self.redis_sink.write(domain, records)
                if domain == 'onchain':
                    await self.db_sink.write_onchain(records)
                elif domain == 'macro':
                    await self.db_sink.write_macro(records)
                
                self.active_sources[source_name]["status"] = "success"
                logger.info("source_run_completed", source=source_name, records=len(records))
            else:
                self.active_sources[source_name]["status"] = "no_data"
        except Exception as e:
            self.active_sources[source_name]["status"] = f"error: {str(e)}"
            logger.error("source_run_failed", source=source_name, error=str(e))
        finally:
            self.active_sources[source_name]["last_run"] = asyncio.get_event_loop().time()

    async def _report_status(self):
        active_count = len([s for s in self.active_sources.values() if s['status'] != 'pending'])
        status_data = {
            "active_sources_count": active_count,
            "total_sources_count": len(self.active_sources),
            "sources": self.active_sources
        }
        import json
        await self.redis_conn.set("status:worker-data", json.dumps(status_data), ex=60)
        logger.info("worker_status_reported", active=active_count)
