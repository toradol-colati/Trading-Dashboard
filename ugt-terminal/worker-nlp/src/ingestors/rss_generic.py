import feedparser
import aiohttp
import asyncio
from typing import List, Dict, Any
import time

class RSSGenericIngestor:
    def __init__(self, feeds: Dict[str, Dict[str, Any]]):
        self.feeds = feeds # Name -> {url, source_class, interval}

    async def fetch_all(self) -> List[Dict[str, Any]]:
        tasks = []
        for name, config in self.feeds.items():
            tasks.append(self.fetch_feed(name, config))
        
        results = await asyncio.gather(*tasks)
        # Flatten results
        return [article for sublist in results for article in sublist]

    async def fetch_feed(self, name: str, config: Dict[str, Any]) -> List[Dict[str, Any]]:
        async with aiohttp.ClientSession() as session:
            async with session.get(config['url']) as resp:
                xml = await resp.text()
                feed = feedparser.parse(xml)
                
                articles = []
                for entry in feed.entries:
                    articles.append({
                        "external_id": entry.get("id") or entry.get("link"),
                        "source_code": name,
                        "source_class": config['source_class'],
                        "url": entry.get("link"),
                        "title": entry.get("title"),
                        "body": entry.get("summary") or entry.get("description"),
                        "published_at": entry.get("published") or time.strftime('%Y-%m-%dT%H:%M:%SZ', entry.published_parsed) if hasattr(entry, 'published_parsed') else None,
                    })
                return articles
