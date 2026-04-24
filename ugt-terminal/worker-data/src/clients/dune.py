import aiohttp
import time
import os
import yaml
from typing import List, Any, Dict
from ..base import AsyncSource, NormalizedRecord, SourceQuality

class DuneClient(AsyncSource):
    def __init__(self, config_path: str):
        super().__init__("dune")
        self.api_key = os.getenv("DUNE_API_KEY")
        self.config_path = config_path
        self.base_url = "https://api.dune.com/api/v1"

    def _load_config(self) -> List[Dict]:
        if not os.path.exists(self.config_path): return []
        with open(self.config_path, 'r') as f:
            config = yaml.safe_load(f)
            return config.get('queries', [])

    async def fetch(self) -> Dict[str, Any]:
        if not self.api_key: return {"results": []}
        
        queries = self._load_config()
        if not queries: return {"results": []}
        
        results = []
        async with aiohttp.ClientSession() as session:
            headers = {"X-DUNE-API-KEY": self.api_key}
            for q in queries:
                # Execution of the query
                q_id = q.get('query_id')
                exec_url = f"{self.base_url}/query/{q_id}/execute"
                async with session.post(exec_url, headers=headers, json={"query_parameters": q.get('params', {})}) as resp:
                    exec_data = await resp.json()
                    exec_id = exec_data.get("execution_id")
                    
                    # Polling for results (simplified)
                    res_url = f"{self.base_url}/execution/{exec_id}/results"
                    while True:
                        async with session.get(res_url, headers=headers) as res_resp:
                            res_data = await res_resp.json()
                            if res_data.get("state") == "QUERY_STATE_COMPLETED":
                                results.append({
                                    "query_name": q.get('name'),
                                    "data": res_data.get("result", {}).get("rows", [])
                                })
                                break
                        await asyncio.sleep(5)
        return {"results": results}

    def normalize(self, raw: Any) -> List[NormalizedRecord]:
        records = []
        now = time.time()
        
        for res in raw.get("results", []):
            records.append(NormalizedRecord(
                source=f"{self.name}:{res.get('query_name')}",
                kind="onchain_metric",
                timestamp=now,
                source_quality=SourceQuality.LIVE_API,
                payload={
                    "metric": "dune_query_result",
                    "data": res.get("data")
                }
            ))
            
        return records
