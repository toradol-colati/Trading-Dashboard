import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { query } from '../db/pool.js';
import { z } from 'zod';

const pacRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // GET /api/pac/plans
    const { isMock } = await import('../db/pool.js');
    if (isMock) {
      return [
        { 
          id: 1, 
          label: "Crypto Core", 
          target_allocation_json: { "BTC": 0.6, "ETH": 0.4 }, 
          contribution_amount: 500.0, 
          contribution_currency: "EUR", 
          frequency: "monthly", 
          next_execution_date: new Date(Date.now() + 864000000).toISOString() 
        }
      ];
    }

    const { query } = await import('../db/pool.js');
    const res = await query('SELECT * FROM pac_plans ORDER BY next_execution_date');
    return res.rows;

  // POST /api/pac/plans
  fastify.post('/plans', async (request, reply) => {
    const bodySchema = z.object({
      label: z.string(),
      target_allocation_json: z.record(z.number()),
      contribution_amount: z.number(),
      contribution_currency: z.string().default('EUR'),
      frequency: z.enum(['weekly', 'biweekly', 'monthly']),
      next_execution_date: z.string() // ISO date
    });

    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send(parsed.error);

    const { label, target_allocation_json, contribution_amount, contribution_currency, frequency, next_execution_date } = parsed.data;

    const res = await query(`
      INSERT INTO pac_plans (label, target_allocation_json, contribution_amount, contribution_currency, frequency, next_execution_date)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [label, target_allocation_json, contribution_amount, contribution_currency, frequency, next_execution_date]);

    return res.rows[0];
  });

  // GET /api/pac/plans/:id/status
  fastify.get('/plans/:id/status', async (request, reply) => {
    const { id } = request.params as { id: string };
    
    const plan = await query('SELECT * FROM pac_plans WHERE id = $1', [id]);
    if (plan.rowCount === 0) return reply.status(404).send({ error: 'Plan not found' });

    const executions = await query('SELECT * FROM pac_executions WHERE plan_id = $1 ORDER BY executed_at DESC', [id]);

    return {
      plan: plan.rows[0],
      executions: executions.rows
    };
  });
};

export default pacRoutes;
