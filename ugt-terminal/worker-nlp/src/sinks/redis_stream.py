import json
import redis.asyncio as redis
from typing import Dict, Any

class RedisStreamSink:
    def __init__(self, redis_url: str):
        self.redis = redis.from_url(redis_url)

    async def write_news(self, article: Dict[str, Any], sentiment: Dict[str, Any]):
        stream_name = "stream:news"
        data = {
            "title": article['title'],
            "source": article['source_code'],
            "tickers": json.dumps(article.get('tickers', [])),
            "sentiment": json.dumps(sentiment),
            "url": article.get('url', '')
        }
        await self.redis.xadd(stream_name, {"channel": "news", "data": json.dumps(data)}, maxlen=10000, approximate=True)
