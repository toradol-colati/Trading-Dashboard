import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { query } from '../db/pool.js';
import { z } from 'zod';

const pricesRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // GET /api/prices/ticks?symbol=&limit=
  fastify.get('/ticks', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          symbol: { type: 'string' },
          limit: { type: 'number', default: 100 }
        }
      }
    }
  }, async (request, reply) => {
    const { symbol, limit } = request.query as { symbol?: string; limit: number };
    
    const { isMock } = await import('../db/pool.js');
    if (isMock) {
      const sym = symbol || 'BTCEUR';
      const basePrice = sym.startsWith('BTC') ? 65000 : sym.startsWith('ETH') ? 3500 : 150;
      return Array.from({ length: 50 }).map((_, i) => ({
        symbol: sym,
        price: basePrice + (Math.random() * 100 - 50),
        volume: Math.random() * 5,
        time: new Date(Date.now() - i * 10000).toISOString()
      })).reverse();
    }

    const { query } = await import('../db/pool.js');
    const sym = symbol || 'BTCEUR';
    const res = await query(
      `
        SELECT symbol, price, volume, time
        FROM price_ticks
        WHERE symbol = $1
        ORDER BY time DESC
        LIMIT $2
      `,
      [sym, limit],
    );
    return res.rows;
  });

  // GET /api/prices/ohlcv?symbol=&interval=&window=
  fastify.get('/ohlcv', async (request, reply) => {
    const querySchema = z.object({
      symbol: z.string(),
      interval: z.enum(['1m', '5m', '1h', '1d']).default('1m'),
      limit: z.coerce.number().default(100)
    });

    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) return reply.status(400).send(parsed.error);

    const { symbol, interval, limit } = parsed.data;
    const tableName = `price_ohlcv_${interval}`;
    
    const sql = `
      SELECT bucket as time, open, high, low, close, volume
      FROM ${tableName}
      WHERE symbol = $1
      ORDER BY bucket DESC
      LIMIT $2
    `;
    
    const res = await query(sql, [symbol, limit]);
    return res.rows;
  });
};

export default pricesRoutes;
