from fastapi import FastAPI
import uvicorn
import asyncio
import os
from .market.binance_ws import BinanceWS
from .market.coinbase_ws import CoinbaseWS

app = FastAPI(title="UGT Broker Worker")

# Watchlist from env
watchlist = os.getenv("DEFAULT_WATCHLIST", "BTCEUR,ETHEUR").split(",")

@app.on_event("startup")
async def startup_event():
    # Start WebSocket connectors for market data
    binance = BinanceWS(watchlist)
    coinbase = CoinbaseWS(watchlist)
    
    asyncio.create_task(binance.start())
    asyncio.create_task(coinbase.start())

@app.get("/health")
async def health():
    return {"status": "OK", "market_connectors": "running"}

if __name__ == "__main__":
    port = 8003
    uvicorn.run(app, host="0.0.0.0", port=port)
