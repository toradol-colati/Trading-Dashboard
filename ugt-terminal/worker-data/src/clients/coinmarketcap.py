import aiohttp
import time
import os
from typing import List, Any, Dict
from ..base import AsyncSource, NormalizedRecord, SourceQuality

class CoinMarketCapClient(AsyncSource):
    def __init__(self):
        super().__init__("coinmarketcap")
        self.api_key = os.getenv("CMC_API_KEY")
        self.base_url = "https://pro-api.coinmarketcap.com/v1/cryptocurrency/listings/latest"

    async def fetch(self) -> Dict[str, Any]:
        if not self.api_key: return {"data": []}
        async with aiohttp.ClientSession() as session:
            headers = {"X-CMC_PRO_API_KEY": self.api_key}
            params = {"limit": 100, "convert": "USD"}
            async with session.get(self.base_url, headers=headers, params=params) as resp:
                return await resp.json()

    def normalize(self, raw: Any) -> List[NormalizedRecord]:
        records = []
        now = time.time()
        
        for coin in raw.get("data", []):
            records.append(NormalizedRecord(
                source=self.name,
                kind="market_metric",
                timestamp=now,
                source_quality=SourceQuality.LIVE_API,
                payload={
                    "symbol": coin.get("symbol"),
                    "name": coin.get("name"),
                    "price": coin.get("quote", {}).get("USD", {}).get("price"),
                    "market_cap": coin.get("quote", {}).get("USD", {}).get("market_cap"),
                    "percent_change_24h": coin.get("quote", {}).get("USD", {}).get("percent_change_24h")
                }
            ))
            
        return records
