import re
from typing import List, Set

class TickerNER:
    def __init__(self):
        # Whitelist: aligned with dashboard watchlist + common majors / indices
        self.whitelist = {
            "BTC", "ETH", "SOL", "SUI", "XRP", "BNB", "ADA", "DOGE", "AVAX", "DOT", "LINK",
            "SPX", "NDX", "NASDAQ", "TSLA", "AAPL", "NVDA",
            "DXY", "EURUSD", "GOLD",
            "EUR", "USD", "JPY", "GBP",
        }
        # Regex for cashtags: $BTC, $ETH
        self.cashtag_regex = re.compile(r'\$([A-Z]{2,6})\b')
        # Simple alias map
        self.aliases = {
            "bitcoin": "BTC",
            "ether": "ETH",
            "ethereum": "ETH",
            "solana": "SOL",
            "sui": "SUI",
            "nasdaq": "NASDAQ",
            "s&p 500": "SPX",
            "s&p500": "SPX",
            "sp500": "SPX",
            "dollar index": "DXY",
            "euro/dollar": "EURUSD",
            "eur/usd": "EURUSD",
            "gold": "GOLD",
            "xau": "GOLD",
            "xauusd": "GOLD",
        }

    def extract(self, text: str) -> List[str]:
        found: Set[str] = set()
        
        # 1. Cashtags
        tags = self.cashtag_regex.findall(text.upper())
        for t in tags:
            if t in self.whitelist:
                found.add(t)
                
        # 2. Whitelist lookup (exact matches)
        words = re.findall(r'\b[A-Z]{2,6}\b', text.upper())
        for w in words:
            if w in self.whitelist:
                found.add(w)
                
        # 3. Aliases (case-insensitive)
        text_lower = text.lower()
        for alias, symbol in self.aliases.items():
            if alias in text_lower:
                found.add(symbol)
                
        return list(found)
