import os
import pickle
import robin_stocks.robinhood as r
import structlog
from ..crypto.decryptor import Decryptor

logger = structlog.get_logger()

class RobinhoodAccount:
    def __init__(self, credentials: dict):
        self.session_path = os.getenv("ROBINHOOD_SESSION_PATH", "/run/secrets/robinhood.pickle")
        self.decryptor = Decryptor()
        self.username = self.decryptor.decrypt(
            credentials['api_key_ciphertext'], # Used as username in RH context
            credentials['nonce'],
            credentials['tag']
        )
        self.password = self.decryptor.decrypt(
            credentials['api_secret_ciphertext'],
            credentials['nonce'],
            credentials['tag']
        )

    def login(self):
        # Spec says to use pre-authenticated pickle if available to bypass MFA
        if os.path.exists(self.session_path):
            with open(self.session_path, "rb") as f:
                r.login(pickle_file=f)
            return True
        
        # Fallback to standard login (might trigger MFA, which isn't ideal for worker)
        r.login(self.username, self.password)
        return True

    def get_holdings(self) -> list:
        self.login()
        
        equity_holdings = r.build_holdings()
        crypto_holdings = r.crypto.get_crypto_positions()
        
        holdings = []
        
        # 1. Equity
        for symbol, data in equity_holdings.items():
            holdings.append({
                "symbol": symbol,
                "quantity": float(data['quantity']),
                "asset_class": "equity",
                "avg_cost_basis": float(data['average_buy_price'])
            })
            
        # 2. Crypto
        for pos in crypto_holdings:
            quantity = float(pos['quantity'])
            if quantity > 0:
                holdings.append({
                    "symbol": pos['currency']['code'],
                    "quantity": quantity,
                    "asset_class": "crypto",
                    "avg_cost_basis": float(pos['cost_bases'][0]['direct_cost_basis']) if pos['cost_bases'] else 0
                })
        
        r.logout()
        return holdings
