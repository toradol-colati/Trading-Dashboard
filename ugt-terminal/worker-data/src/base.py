import abc
import asyncio
import time
from dataclasses import dataclass
from enum import Enum
from typing import Any, Dict, List, Optional
import structlog
from aiolimiter import AsyncLimiter
import pybreaker

logger = structlog.get_logger()

class SourceQuality(str, Enum):
    LIVE_API = "live_api"
    RSS = "rss"
    SCRAPE = "scrape"
    STALE_CACHE = "stale_cache"

@dataclass
class NormalizedRecord:
    source: str
    kind: str
    timestamp: float
    payload: Dict[str, Any]
    source_quality: SourceQuality

class AsyncSource(abc.ABC):
    def __init__(self, name: str, rate_limit: Optional[AsyncLimiter] = None):
        self.name = name
        self.rate_limit = rate_limit
        self.metrics = {
            "fetch_count": 0,
            "fetch_errors": 0,
            "last_success_ts": 0,
            "source_quality_last": SourceQuality.LIVE_API
        }
        self.breaker = pybreaker.CircuitBreaker(fail_max=5, reset_timeout=1800)

    @abc.abstractmethod
    async def fetch(self) -> Any:
        pass

    @abc.abstractmethod
    def normalize(self, raw: Any) -> List[NormalizedRecord]:
        pass

    async def run(self) -> List[NormalizedRecord]:
        if self.rate_limit:
            async with self.rate_limit:
                return await self._execute()
        return await self._execute()

    async def _execute(self) -> List[NormalizedRecord]:
        try:
            raw = await self.breaker.call(self.fetch)
            records = self.normalize(raw)
            self.metrics["fetch_count"] += 1
            self.metrics["last_success_ts"] = time.time()
            self.metrics["source_quality_last"] = records[0].source_quality if records else SourceQuality.LIVE_API
            return records
        except Exception as e:
            self.metrics["fetch_errors"] += 1
            logger.warn("source_fetch_failed", source=self.name, error=str(e))
            # In a real scenario, we'd fetch from Redis cache here as fallback
            return []

    def health_check(self) -> bool:
        return self.breaker.current_state == "closed"
