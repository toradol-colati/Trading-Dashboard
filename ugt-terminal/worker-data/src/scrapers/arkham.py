import asyncio
import time
from typing import List, Any, Dict
from playwright.async_api import async_playwright
from ..base import AsyncSource, NormalizedRecord, SourceQuality

# @fragile: Arkham scraping is highly dependent on their dashboard structure.
# This client scrapes entity balance or volume data points based on entity IDs.
class ArkhamScraper(AsyncSource):
    def __init__(self, entity_id: str):
        super().__init__("arkham")
        self.entity_id = entity_id # e.g. "binance"
        self.url = f"https://intel.arkm.com/explorer/entity/{entity_id}"

    async def fetch(self) -> Dict[str, Any]:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context(user_agent="ugt-terminal personal-use")
            page = await context.new_page()
            
            try:
                await page.goto(self.url, timeout=60000)
                await page.wait_for_selector(".entity-balance", timeout=20000)
                
                balance_element = await page.query_selector(".entity-balance")
                balance_text = await balance_element.inner_text() if balance_element else "0"
                
                return {
                    "entity": self.entity_id,
                    "balance": balance_text.replace('$', '').replace(',', '').strip()
                }
            except Exception as e:
                raise Exception(f"Arkham scraping failed for {self.entity_id}: {str(e)}")
            finally:
                await browser.close()

    def normalize(self, raw: Any) -> List[NormalizedRecord]:
        now = time.time()
        try:
            val = float(raw.get("balance", 0))
        except:
            val = 0.0
            
        return [NormalizedRecord(
            source=self.name,
            kind="onchain_metric",
            timestamp=now,
            source_quality=SourceQuality.SCRAPE,
            payload={
                "metric": "entity_balance",
                "entity": raw.get("entity"),
                "value": val,
                "metadata": {"method": "playwright_scrape"}
            }
        )]
