import os
import asyncpg
import json
import structlog
from datetime import datetime, timedelta
from typing import Dict, List

logger = structlog.get_logger()

class PACEngine:
    def __init__(self, dsn: str):
        self.dsn = dsn
        self.pool = None

    async def connect(self):
        if not self.pool:
            self.pool = await asyncpg.create_pool(self.dsn)

    async def run_check(self):
        """Main check loop for all PAC plans."""
        await self.connect()
        async with self.pool.acquire() as conn:
            # 1. Fetch plans due for execution
            plans = await conn.fetch("SELECT * FROM pac_plans WHERE next_execution_date <= CURRENT_DATE")
            
            for plan in plans:
                logger.info("pac_plan_due", label=plan['label'])
                await self.execute_plan(plan, conn)

    async def execute_plan(self, plan: Dict, conn):
        # 1. Get current portfolio prices/holdings to check rebalancing
        # In a real scenario, we'd fetch prices from Redis/DB
        
        # 2. Record execution (Simulated as successful)
        executed_at = datetime.now()
        target_allocation = json.loads(plan['target_allocation_json'])
        
        # Record results
        result_json = {
            "target": target_allocation,
            "status": "notified", # Since execution on brokers is usually manual or via external bot
            "advice": self._generate_advice(plan, target_allocation)
        }
        
        await conn.execute(
            """
            INSERT INTO pac_executions (plan_id, executed_at, result_json)
            VALUES ($1, $2, $3)
            """,
            plan['id'], executed_at, json.dumps(result_json)
        )
        
        # 3. Update next execution date
        next_date = self._calculate_next_date(plan['next_execution_date'], plan['frequency'])
        await conn.execute(
            "UPDATE pac_plans SET next_execution_date = $1, last_execution_at = $2 WHERE id = $3",
            next_date, executed_at, plan['id']
        )
        
        logger.info("pac_plan_executed", label=plan['label'], next_date=next_date)

    def _calculate_next_date(self, current: datetime, frequency: str) -> datetime:
        if frequency == 'weekly':
            return current + timedelta(weeks=1)
        elif frequency == 'biweekly':
            return current + timedelta(weeks=2)
        elif frequency == 'monthly':
            # Simplified month increment
            return current + timedelta(days=30)
        return current

    def _generate_advice(self, plan, target_allocation: Dict) -> str:
        advice = f"Deploy {plan['contribution_amount']} {plan['contribution_currency']} as follows:\n"
        for symbol, weight in target_allocation.items():
            amount = plan['contribution_amount'] * (weight / 100)
            advice += f"- Buy {symbol}: {amount:.2f} {plan['contribution_currency']}\n"
        return advice
