import aiohttp
import time
import os
from typing import List, Any, Dict
from ..base import AsyncSource, NormalizedRecord, SourceQuality

class FredClient(AsyncSource):
    def __init__(self, series_ids: List[str]):
        super().__init__("fred")
        self.series_ids = series_ids # e.g. ["CPIAUCSL", "FEDFUNDS"]
        self.api_key = os.getenv("FRED_API_KEY")
        self.base_url = "https://api.stlouisfed.org/fred/series/observations"

    async def fetch(self) -> Dict[str, Any]:
        if not self.api_key or not self.series_ids:
            return {"observations": {}}
            
        results = {}
        async with aiohttp.ClientSession() as session:
            for sid in self.series_ids:
                params = {
                    "series_id": sid,
                    "api_key": self.api_key,
                    "file_type": "json",
                    "sort_order": "desc",
                    "limit": 1
                }
                async with session.get(self.base_url, params=params) as resp:
                    data = await resp.json()
                    results[sid] = data.get("observations", [])[0] if data.get("observations") else {}
        return {"observations": results}

    def normalize(self, raw: Any) -> List[NormalizedRecord]:
        records = []
        now = time.time()
        
        for sid, obs in raw.get("observations", {}).items():
            if not obs: continue
            records.append(NormalizedRecord(
                source=self.name,
                kind="macro_metric",
                timestamp=now,
                source_quality=SourceQuality.LIVE_API,
                payload={
                    "series_id": sid,
                    "value": float(obs.get("value", 0)),
                    "date": obs.get("date")
                }
            ))
            
        return records
