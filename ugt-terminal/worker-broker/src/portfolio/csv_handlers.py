import csv
import hashlib
import json
from typing import List, Dict, Any
import structlog

logger = structlog.get_logger()

class YoungPlatformCSVHandler:
    def __init__(self):
        pass

    def parse(self, csv_content: str) -> List[Dict[str, Any]]:
        # YoungPlatform CSV format (Header: Date, Asset, Amount, Type, etc.)
        # We'll normalize to: symbol, quantity, avg_cost_basis, currency, asset_class
        reader = csv.DictReader(csv_content.splitlines())
        records = []
        for row in reader:
            # Create a unique hash for the row to ensure idempotency
            row_hash = hashlib.sha256(json.dumps(row, sort_keys=True).encode()).hexdigest()
            
            # Example mapping (adjust based on actual YoungPlatform export)
            # Date,Asset,Amount,Type,Rate,Fee,Total
            records.append({
                "external_id": f"yng_{row_hash}",
                "symbol": row.get('Asset'),
                "quantity": float(row.get('Amount', 0)),
                "avg_cost_basis": float(row.get('Rate', 0)),
                "currency": "EUR",
                "asset_class": "crypto",
                "row_hash": row_hash
            })
        return records

class TradeRepublicCSVHandler:
    def __init__(self):
        pass

    def parse(self, csv_content: str) -> List[Dict[str, Any]]:
        # TradeRepublic CSV format
        reader = csv.DictReader(csv_content.splitlines())
        records = []
        for row in reader:
            row_hash = hashlib.sha256(json.dumps(row, sort_keys=True).encode()).hexdigest()
            
            # Example mapping (adjust based on actual TradeRepublic export)
            # Date,ISIN,Name,Operation,Quantity,Price,Currency
            records.append({
                "external_id": f"tr_{row_hash}",
                "symbol": row.get('ISIN') or row.get('Name'),
                "quantity": float(row.get('Quantity', 0)),
                "avg_cost_basis": float(row.get('Price', 0)),
                "currency": row.get('Currency', 'EUR'),
                "asset_class": "equity",
                "row_hash": row_hash
            })
        return records
