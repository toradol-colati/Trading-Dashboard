import json
import asyncio
import os
import time
import redis.asyncio as redis
from coinbase.rest import RESTClient
import structlog

logger = structlog.get_logger()

# Note: coinbase-advanced-py handles WebSocket slightly differently. 
# This implementation assumes we use the REST client for initial setup 
# but implement a basic async websocket loop for the streaming part 
# if the SDK's WS client is not ideal for this specific multi-symbol relay.
class CoinbaseWS:
    def __init__(self, symbols: list):
        self.symbols = [s.replace('EUR', '-EUR').replace('USDT', '-USDT') for s in symbols]
        self.redis = redis.from_url(os.getenv("REDIS_URL", "redis://redis:6379"))

    async def start(self):
        logger.info("coinbase_ws_starting", symbols=self.symbols)
        # Placeholder for real WS loop using coinbase-advanced-py or websockets lib
        # In a real implementation we would connect to wss://advanced-trade-ws.coinbase.com
        while True:
            # Simulate a live tick for the demo purpose if needed, or just stay open
            await asyncio.sleep(60)

    async def _relay_tick(self, data):
        tick = {
            "time": time.time() * 1000,
            "venue": "coinbase",
            "symbol": data['product_id'].replace('-', ''),
            "price": float(data['price']),
            "volume": float(data['volume_24h']),
            "side": None
        }
        await self.redis.xadd("stream:prices", {"channel": "prices", "data": json.dumps(tick)}, maxlen=10000)
