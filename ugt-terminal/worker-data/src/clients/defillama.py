import aiohttp
import time
from typing import List, Any, Dict
from ..base import AsyncSource, NormalizedRecord, SourceQuality

class DefiLlamaClient(AsyncSource):
    def __init__(self):
        super().__init__("defillama")
        self.base_url = "https://api.llama.fi"

    async def fetch(self) -> Dict[str, Any]:
        async with aiohttp.ClientSession() as session:
            # Fetch global TVL as a representative data point
            async with session.get(f"{self.base_url}/charts") as resp:
                charts = await resp.json()
                # Also fetch some top protocols for more granular data
                async with session.get(f"{self.base_url}/protocols") as prot_resp:
                    protocols = await prot_resp.json()
                    return {
                        "global_tvl": charts[-1] if charts else {},
                        "top_protocols": protocols[:10]
                    }

    def normalize(self, raw: Any) -> List[NormalizedRecord]:
        records = []
        now = time.time()
        
        # 1. Global TVL record
        if raw.get("global_tvl"):
            records.append(NormalizedRecord(
                source=self.name,
                kind="onchain_metric",
                timestamp=raw["global_tvl"].get("date", now),
                source_quality=SourceQuality.LIVE_API,
                payload={
                    "metric": "tvl",
                    "source": "defillama",
                    "chain": "all",
                    "value": raw["global_tvl"].get("totalLiquidityUSD", 0),
                    "metadata": {"type": "global"}
                }
            ))
            
        # 2. Protocol specific volumes/TVL
        for proto in raw.get("top_protocols", []):
            records.append(NormalizedRecord(
                source=self.name,
                kind="onchain_metric",
                timestamp=now,
                source_quality=SourceQuality.LIVE_API,
                payload={
                    "metric": "tvl",
                    "source": proto.get("name"),
                    "chain": proto.get("chain"),
                    "value": proto.get("tvl", 0),
                    "metadata": {"slug": proto.get("slug"), "change_24h": proto.get("change_24h")}
                }
            ))
            
        return records
