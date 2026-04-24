import asyncio
import time
from typing import List, Any, Dict
from playwright.async_api import async_playwright
from ..base import AsyncSource, NormalizedRecord, SourceQuality

# @fragile: Glassnode scraping is subject to change if they update their dashboard UI.
# This client scrapes public chart data points as a best-effort fallback.
class GlassnodeScraper(AsyncSource):
    def __init__(self):
        super().__init__("glassnode")
        self.url = "https://studio.glassnode.com/metrics?metric=MarketCap"

    async def fetch(self) -> Dict[str, Any]:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context(user_agent="ugt-terminal personal-use")
            page = await context.new_page()
            
            try:
                await page.goto(self.url, timeout=60000)
                # Wait for any specific chart element or data to load
                await page.wait_for_selector(".metric-value", timeout=15000)
                
                # Scraping logic for a specific metric value shown in the UI
                value_element = await page.query_selector(".metric-value")
                value_text = await value_element.inner_text() if value_element else "0"
                
                return {
                    "metric": "Realized Cap",
                    "value": value_text.replace('$', '').replace(',', '').strip()
                }
            except Exception as e:
                raise Exception(f"Glassnode scraping failed: {str(e)}")
            finally:
                await browser.close()

    def normalize(self, raw: Any) -> List[NormalizedRecord]:
        now = time.time()
        try:
            val = float(raw.get("value", 0))
        except:
            val = 0.0
            
        return [NormalizedRecord(
            source=self.name,
            kind="onchain_metric",
            timestamp=now,
            source_quality=SourceQuality.SCRAPE, # explicitly marked as scrape
            payload={
                "metric": raw.get("metric", "unknown"),
                "value": val,
                "metadata": {"method": "playwright_scrape"}
            }
        )]
