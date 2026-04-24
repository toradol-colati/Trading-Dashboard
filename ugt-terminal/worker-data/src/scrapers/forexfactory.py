import aiohttp
import time
from typing import List, Any, Dict
from bs4 import BeautifulSoup
from ..base import AsyncSource, NormalizedRecord, SourceQuality

# @fragile: ForexFactory scraping depends on their calendar table structure.
# This scraper uses basic aiohttp + BeautifulSoup as FF calendar is relatively 
# static HTML (no JS load required for basic view).
class ForexFactoryScraper(AsyncSource):
    def __init__(self):
        super().__init__("forexfactory")
        self.url = "https://www.forexfactory.com/calendar"

    async def fetch(self) -> Dict[str, Any]:
        async with aiohttp.ClientSession() as session:
            headers = {"User-Agent": "ugt-terminal personal-use"}
            async with session.get(self.url, headers=headers) as resp:
                html = await resp.text()
                return {"html": html}

    def normalize(self, raw: Any) -> List[NormalizedRecord]:
        now = time.time()
        soup = BeautifulSoup(raw["html"], "lxml")
        records = []
        
        # Parse calendar table rows (simplified)
        table = soup.find("table", class_="calendar__table")
        if not table: return []
        
        rows = table.find_all("tr", class_="calendar__row")
        for row in rows:
            event_name = row.find("td", class_="calendar__event")
            impact = row.find("td", class_="calendar__impact")
            currency = row.find("td", class_="calendar__currency")
            actual = row.find("td", class_="calendar__actual")
            
            if event_name and currency:
                records.append(NormalizedRecord(
                    source=self.name,
                    kind="macro_metric",
                    timestamp=now,
                    source_quality=SourceQuality.SCRAPE,
                    payload={
                        "metric": "economic_event",
                        "event": event_name.get_text(strip=True),
                        "currency": currency.get_text(strip=True),
                        "impact": impact.find("span")["title"] if impact and impact.find("span") else "Unknown",
                        "actual": actual.get_text(strip=True) if actual else None
                    }
                ))
                
        return records
