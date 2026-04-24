import asyncio
from playwright.async_api import async_playwright
import structlog

logger = structlog.get_logger()

# @fragile: Scraping full article bodies from diverse news sites is highly unstable.
# This is a best-effort fallback when RSS summary is insufficient.
class ScrapeFallback:
    def __init__(self):
        pass

    async def get_full_body(self, url: str) -> str:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context(user_agent="ugt-terminal personal-use")
            page = await context.new_page()
            
            try:
                await page.goto(url, timeout=30000)
                # Try to find common article selectors (e.g. <article>, main content blocks)
                # This is a generic approach
                article_element = await page.query_selector("article")
                if article_element:
                    return await article_element.inner_text()
                
                # Fallback: get all paragraph texts
                paragraphs = await page.query_selector_all("p")
                text_parts = [await p.inner_text() for p in paragraphs if len(await p.inner_text()) > 50]
                return "\n".join(text_parts)
            except Exception as e:
                logger.warn("scrape_fallback_failed", url=url, error=str(e))
                return ""
            finally:
                await browser.close()
