import json
import asyncio
import os
import time
import redis.asyncio as redis
from binance.websocket.spot.websocket_client import SpotWebsocketClient
import structlog

logger = structlog.get_logger()

class BinanceWS:
    def __init__(self, symbols: list):
        self.symbols = [s.lower() for s in symbols]
        self.redis = redis.from_url(os.getenv("REDIS_URL", "redis://redis:6379"))
        self.client = SpotWebsocketClient(on_message=self.on_message)

    def on_message(self, _, message):
        try:
            data = json.loads(message)
            event = data.get("e")
            
            if event == "aggTrade":
                asyncio.run_coroutine_threadsafe(self.process_trade(data), asyncio.get_event_loop())
            elif "depth20" in data.get("stream", ""):
                asyncio.run_coroutine_threadsafe(self.process_depth(data['data'], data['stream'].split('@')[0]), asyncio.get_event_loop())
        except Exception as e:
            logger.error("binance_ws_msg_error", error=str(e))

    async def process_trade(self, data):
        tick = {
            "time": time.time() * 1000,
            "venue": "binance",
            "symbol": data['s'],
            "price": float(data['p']),
            "volume": float(data['q']),
            "side": "buy" if not data['m'] else "sell"
        }
        await self.redis.xadd("stream:prices", {"channel": "prices", "data": json.dumps(tick)}, maxlen=10000)

    async def process_depth(self, data, symbol):
        snapshot = {
            "time": time.time() * 1000,
            "venue": "binance",
            "symbol": symbol.upper(),
            "bids": data['bids'][:5],
            "asks": data['asks'][:5]
        }
        await self.redis.xadd("stream:prices", {"channel": "book", "data": json.dumps(snapshot)}, maxlen=1000)

    async def start(self):
        logger.info("binance_ws_starting", symbols=self.symbols)
        for s in self.symbols:
            self.client.agg_trade(symbol=s)
            self.client.partial_book_depth(symbol=s, level=20, speed=100)
        
        while True:
            await asyncio.sleep(1)
