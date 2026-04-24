from ib_insync import IB, Stock, Forex, Crypto
import asyncio
import os
import structlog

logger = structlog.get_logger()

# IBKR Connector: Connects to IBKR Gateway (running on host)
# Requires Gateway/TWS to be open and authenticated manually.
class IBKRAccount:
    def __init__(self, host: str = "host.docker.internal", port: int = 4001, client_id: int = 1):
        self.host = host
        self.port = port
        self.client_id = client_id
        self.ib = IB()

    async def get_holdings(self) -> list:
        try:
            await self.ib.connectAsync(self.host, self.port, clientId=self.client_id, timeout=10)
            
            holdings = []
            positions = self.ib.positions()
            
            for pos in positions:
                # pos: Position(account='...', contract=..., position=..., avgCost=...)
                contract = pos.contract
                holdings.append({
                    "symbol": contract.localSymbol or contract.symbol,
                    "quantity": float(pos.position),
                    "asset_class": self._map_sec_type(contract.secType),
                    "avg_cost_basis": float(pos.avgCost),
                    "currency": contract.currency
                })
            
            self.ib.disconnect()
            return holdings
        except Exception as e:
            logger.error("ibkr_connection_failed", error=str(e))
            return []

    def _map_sec_type(self, sec_type: str) -> str:
        mapping = {
            "STK": "equity",
            "CASH": "forex",
            "CRYPTO": "crypto",
            "OPT": "option",
            "FUT": "future"
        }
        return mapping.get(sec_type, "other")
