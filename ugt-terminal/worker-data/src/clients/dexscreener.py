import aiohttp
import time
from typing import List, Any, Dict
from ..base import AsyncSource, NormalizedRecord, SourceQuality

class DexScreenerClient(AsyncSource):
    def __init__(self, watchlist_pairs: List[str]):
        super().__init__("dexscreener")
        self.watchlist_pairs = watchlist_pairs # e.g. ["ethereum/0x..."]
        self.base_url = "https://api.dexscreener.com/latest/dex/pairs"

    async def fetch(self) -> Dict[str, Any]:
        if not self.watchlist_pairs: return {"pairs": []}
        
        # DexScreener allows fetching multiple pairs in one go (up to 30)
        chain_id, pair_address = self.watchlist_pairs[0].split('/')
        async with aiohttp.ClientSession() as session:
            async with session.get(f"{self.base_url}/{chain_id}/{pair_address}") as resp:
                return await resp.json()

    def normalize(self, raw: Any) -> List[NormalizedRecord]:
        records = []
        now = time.time()
        
        for pair in raw.get("pairs", []):
            records.append(NormalizedRecord(
                source=self.name,
                kind="onchain_metric",
                timestamp=now,
                source_quality=SourceQuality.LIVE_API,
                payload={
                    "metric": "dex_volume",
                    "source": pair.get("dexId"),
                    "chain": pair.get("chainId"),
                    "value": pair.get("volume", {}).get("h24", 0),
                    "metadata": {
                        "pair": f"{pair.get('baseToken', {}).get('symbol')}/{pair.get('quoteToken', {}).get('symbol')}",
                        "price_usd": pair.get("priceUsd"),
                        "liquidity": pair.get("liquidity", {}).get("usd", 0)
                    }
                }
            ))
            
        return records
