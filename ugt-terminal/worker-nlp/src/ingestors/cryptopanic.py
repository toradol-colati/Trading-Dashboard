import os
from typing import Any, Dict, List

import aiohttp


class CryptopanicIngestor:
    def __init__(self):
        self.api_key = os.getenv("CRYPTOPANIC_API_KEY")
        self.base_url = "https://cryptopanic.com/api/v1/posts/"

    async def fetch_latest(self) -> List[Dict[str, Any]]:
        if not self.api_key:
            return []

        timeout = aiohttp.ClientTimeout(total=20)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            params = {
                "auth_token": self.api_key,
                "public": "true"
            }
            async with session.get(self.base_url, params=params) as resp:
                raw = await resp.json()

        return self.normalize(raw)

    def normalize(self, raw: Any) -> List[Dict[str, Any]]:
        articles = []
        for post in raw.get("results", []):
            articles.append({
                "external_id": str(post.get("id")),
                "source_code": "CRYPTOPANIC",
                "class": "crypto_native",
                "url": post.get("url"),
                "title": post.get("title"),
                "body": post.get("body") or "",
                "published_at": post.get("published_at"),
            })
        return articles
