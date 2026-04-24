import aiohttp
import hmac
import hashlib
import time
import os
from ..crypto.decryptor import Decryptor
import structlog

logger = structlog.get_logger()

class YouHodlerAccount:
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
        self.base_url = "https://api.youhodler.com/api/v1"

    async def get_holdings(self) -> list:
        # YouHodler API requires signature on requests
        # This is a representative implementation of their HMAC auth
        timestamp = str(int(time.time() * 1000))
        path = "/wallets"
        method = "GET"
        
        message = timestamp + method + path
        signature = hmac.new(
            self.api_secret.encode('utf-8'),
            message.encode('utf-8'),
            hashlib.sha256
        ).hexdigest()

        headers = {
            "X-YH-APIKEY": self.api_key,
            "X-YH-MSG-TIMESTAMP": timestamp,
            "X-YH-MSG-SIGNATURE": signature
        }

        async with aiohttp.ClientSession() as session:
            async with session.get(f"{self.base_url}{path}", headers=headers) as resp:
                if resp.status != 200:
                    logger.error("youhodler_api_error", status=resp.status)
                    return []
                    
                data = await resp.json()
                holdings = []
                for wallet in data:
                    amount = float(wallet.get("balance", 0))
                    if amount > 0:
                        holdings.append({
                            "symbol": wallet.get("alias"),
                            "quantity": amount,
                            "asset_class": "crypto"
                        })
                return holdings
