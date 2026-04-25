import asyncio
import time
from typing import Any, Dict, List

import aiohttp
import feedparser


class RSSGenericIngestor:
    def __init__(self, feeds: List[Dict[str, Any]]):
        self.feeds = feeds

    async def fetch_latest(self) -> List[Dict[str, Any]]:
        tasks = [self.fetch_feed(config) for config in self.feeds]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        articles: List[Dict[str, Any]] = []
        for result in results:
            if isinstance(result, list):
                articles.extend(result)
        return articles

    async def fetch_feed(self, config: Dict[str, Any]) -> List[Dict[str, Any]]:
        timeout = aiohttp.ClientTimeout(total=25)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.get(config['url']) as resp:
                xml = await resp.text()

        feed = feedparser.parse(xml)
        articles = []
        for entry in feed.entries:
            published_parsed = getattr(entry, 'published_parsed', None)
            published_at = entry.get('published') or entry.get('updated')
            if not published_at and published_parsed:
                published_at = time.strftime('%Y-%m-%dT%H:%M:%SZ', published_parsed)

            articles.append({
                "external_id": entry.get("id") or entry.get("link") or entry.get("title"),
                "source_code": config['name'].upper(),
                "class": config.get('class', 'tradfi'),
                "url": entry.get("link"),
                "title": entry.get("title"),
                "body": entry.get("summary") or entry.get("description") or "",
                "published_at": published_at,
            })

        return articles
