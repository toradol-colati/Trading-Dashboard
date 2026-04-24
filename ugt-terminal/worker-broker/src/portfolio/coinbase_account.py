import asyncio
import os
from coinbase.rest import RESTClient
from ..crypto.decryptor import Decryptor
import structlog

logger = structlog.get_logger()

class CoinbaseAccount:
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
        self.client = RESTClient(api_key=self.api_key, api_secret=self.api_secret)

    async def get_holdings(self) -> list:
        # Coinbase Advanced Trade uses a slightly different response structure
        loop = asyncio.get_event_loop()
        accounts = await loop.run_in_executor(None, self.client.get_accounts)
        
        holdings = []
        for account in accounts.get("accounts", []):
            amount = float(account.get("available_balance", {}).get("value", 0))
            if amount > 0:
                holdings.append({
                    "symbol": account.get("currency"),
                    "quantity": amount,
                    "asset_class": "crypto"
                })
        return holdings
