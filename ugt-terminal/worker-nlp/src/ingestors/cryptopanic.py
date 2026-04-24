import aiohttp
import time
import os
from typing import List, Any, Dict
from ..base import AsyncSource, NormalizedRecord, SourceQuality

class CryptoPanicIngestor(AsyncSource):
    def __init__(self):
        super().__init__("cryptopanic")
        self.api_key = os.getenv("CRYPTOPANIC_API_KEY")
        self.base_url = "https://cryptopanic.com/api/v1/posts/"

    async def fetch(self) -> Dict[str, Any]:
        if not self.api_key: return {"results": []}
        async with aiohttp.ClientSession() as session:
            params = {
                "auth_token": self.api_key,
                "public": "true"
            }
            async with session.get(self.base_url, params=params) as resp:
                return await resp.json()

    def normalize(self, raw: Any) -> List[Dict[str, Any]]:
        articles = []
        for post in raw.get("results", []):
            articles.append({
                "external_id": str(post.get("id")),
                "source_code": "cryptopanic",
                "url": post.get("url"),
                "title": post.get("title"),
                "body": post.get("body"),
                "published_at": post.get("published_at"),
            })
        return articles
