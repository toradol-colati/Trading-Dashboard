import asyncpg
import json
from typing import List
from ..base import NormalizedRecord

class TimescaleSink:
    def __init__(self, dsn: str):
        self.dsn = dsn
        self.pool = None

    async def connect(self):
        self.pool = await asyncpg.create_pool(self.dsn)

    async def write_onchain(self, records: List[NormalizedRecord]):
        if not self.pool: await self.connect()
        async with self.pool.acquire() as conn:
            for r in records:
                # payload: protocol, chain, metric, value, metadata...
                await conn.execute(
                    """
                    INSERT INTO onchain_metrics (time, source, metric, chain, value, metadata_json)
                    VALUES (to_timestamp($1), $2, $3, $4, $5, $6)
                    """,
                    r.timestamp,
                    r.payload.get('source', r.source),
                    r.payload.get('metric'),
                    r.payload.get('chain'),
                    r.payload.get('value'),
                    json.dumps(r.payload.get('metadata', {}))
                )

    async def write_macro(self, records: List[NormalizedRecord]):
        if not self.pool: await self.connect()
        async with self.pool.acquire() as conn:
            for r in records:
                await conn.execute(
                    """
                    INSERT INTO macro_series (time, source, series_id, value)
                    VALUES (to_timestamp($1), $2, $3, $4)
                    """,
                    r.timestamp,
                    r.source,
                    r.payload.get('series_id'),
                    r.payload.get('value')
                )
