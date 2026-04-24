import asyncio
import time
from typing import List, Any, Dict
from playwright.async_api import async_playwright
from ..base import AsyncSource, NormalizedRecord, SourceQuality

# @fragile: MacroMicro scraping is subject to dashboard layout changes.
# Scrapes public MacroMicro charts for US macro indicators.
class MacroMicroScraper(AsyncSource):
    def __init__(self):
        super().__init__("macromicro")
        self.url = "https://en.macromicro.me/macro/us"

    async def fetch(self) -> Dict[str, Any]:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context(user_agent="ugt-terminal personal-use")
            page = await context.new_page()
            
            try:
                await page.goto(self.url, timeout=60000)
                # Looking for container with leading indicator values
                await page.wait_for_selector(".stat-value", timeout=20000)
                
                stats = await page.query_selector_all(".stat-item")
                results = []
                for stat in stats:
                    label = await stat.query_selector(".stat-title")
                    value = await stat.query_selector(".stat-value")
                    if label and value:
                        results.append({
                            "label": await label.inner_text(),
                            "value": await value.inner_text()
                        })
                
                return {"stats": results}
            except Exception as e:
                raise Exception(f"MacroMicro scraping failed: {str(e)}")
            finally:
                await browser.close()

    def normalize(self, raw: Any) -> List[NormalizedRecord]:
        now = time.time()
        records = []
        
        for item in raw.get("stats", []):
            try:
                # Clean value string (e.g. "1.2%", "100.5")
                val_str = item.get("value", "0").replace('%', '').replace(',', '').strip()
                val = float(val_str)
            except:
                val = 0.0
                
            records.append(NormalizedRecord(
                source=self.name,
                kind="macro_metric",
                timestamp=now,
                source_quality=SourceQuality.SCRAPE,
                payload={
                    "metric": item.get("label"),
                    "value": val,
                    "metadata": {"method": "playwright_scrape"}
                }
            ))
            
        return records
