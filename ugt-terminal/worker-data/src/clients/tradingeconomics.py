import aiohttp
import time
import os
from typing import List, Any, Dict
from ..base import AsyncSource, NormalizedRecord, SourceQuality

class TradingEconomicsClient(AsyncSource):
    def __init__(self):
        super().__init__("tradingeconomics")
        self.auth = os.getenv("TRADINGECONOMICS_AUTH", "guest:guest")
        self.base_url = "https://api.tradingeconomics.com"

    async def fetch(self) -> Dict[str, Any]:
        # Uses guest:guest by default for freemium calendar
        async with aiohttp.ClientSession() as session:
            url = f"{self.base_url}/calendar?c={self.auth}&f=json"
            async with session.get(url) as resp:
                return {"calendar": await resp.json()}

    def normalize(self, raw: Any) -> List[NormalizedRecord]:
        records = []
        now = time.time()
        
        for item in raw.get("calendar", []):
            records.append(NormalizedRecord(
                source=self.name,
                kind="macro_metric",
                timestamp=now,
                source_quality=SourceQuality.LIVE_API,
                payload={
                    "metric": "economic_event",
                    "event": item.get("Event"),
                    "country": item.get("Country"),
                    "actual": item.get("Actual"),
                    "previous": item.get("Previous"),
                    "forecast": item.get("Forecast"),
                    "importance": item.get("Importance")
                }
            ))
            
        return records
