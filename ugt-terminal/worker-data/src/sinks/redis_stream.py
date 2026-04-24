import json
import redis.asyncio as redis
from typing import List
from ..base import NormalizedRecord

class RedisStreamSink:
    def __init__(self, redis_url: str):
        self.redis = redis.from_url(redis_url)

    async def write(self, domain: str, records: List[NormalizedRecord]):
        for record in records:
            stream_name = f"stream:{domain}"
            data = {
                "source": record.source,
                "kind": record.kind,
                "timestamp": record.timestamp,
                "quality": record.source_quality,
                "data": json.dumps(record.payload)
            }
            await self.redis.xadd(stream_name, data, maxlen=10000, approximate=True)
