import aiohttp
import time
import os
from typing import List, Any, Dict
from ..base import AsyncSource, NormalizedRecord, SourceQuality

class MessariClient(AsyncSource):
    def __init__(self):
        super().__init__("messari")
        self.api_key = os.getenv("MESSARI_API_KEY")
        self.base_url = "https://data.messari.io/api/v1/assets"

    async def fetch(self) -> Dict[str, Any]:
        async with aiohttp.ClientSession() as session:
            headers = {"x-messari-api-key": self.api_key} if self.api_key else {}
            async with session.get(self.base_url, headers=headers) as resp:
                return await resp.json()

    def normalize(self, raw: Any) -> List[NormalizedRecord]:
        records = []
        now = time.time()
        
        for asset in raw.get("data", []):
            metrics = asset.get("metrics", {})
            market_data = metrics.get("market_data", {})
            records.append(NormalizedRecord(
                source=self.name,
                kind="market_metric",
                timestamp=now,
                source_quality=SourceQuality.LIVE_API,
                payload={
                    "symbol": asset.get("symbol"),
                    "name": asset.get("name"),
                    "price": market_data.get("price_usd"),
                    "real_volume_24h": market_data.get("real_volume_last_24_hours"),
                    "dominance": metrics.get("marketcap", {}).get("marketcap_dominance_percent")
                }
            ))
            
        return records
