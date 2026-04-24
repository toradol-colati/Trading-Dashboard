import asyncio
import os
from binance.spot import Spot
from ..crypto.decryptor import Decryptor
import structlog

logger = structlog.get_logger()

class BinanceAccount:
    def __init__(self, credentials: dict):
        self.decryptor = Decryptor()
        self.api_key = self.decryptor.decrypt(
            credentials['api_key_ciphertext'],
            credentials['nonce'],
            credentials['tag']
        )
        self.api_secret = self.decryptor.decrypt(
            credentials['api_secret_ciphertext'],
            credentials['nonce'],
            credentials['tag']
        )
        self.client = Spot(api_key=self.api_key, api_secret=self.api_secret)

    async def get_holdings(self) -> list:
        # Run in executor because binance-connector is synchronous
        loop = asyncio.get_event_loop()
        account_info = await loop.run_in_executor(None, self.client.account)
        
        holdings = []
        for balance in account_info.get("balances", []):
            free = float(balance.get("free", 0))
            locked = float(balance.get("locked", 0))
            total = free + locked
            
            if total > 0:
                holdings.append({
                    "symbol": balance.get("asset"),
                    "quantity": total,
                    "asset_class": "crypto"
                })
        return holdings
