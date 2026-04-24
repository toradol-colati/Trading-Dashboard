import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { query } from '../db/pool.js';
import { z } from 'zod';

const newsRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // GET /api/news?source_class=&ticker=&limit=
  fastify.get('/', async (request, reply) => {
    const querySchema = z.object({
      source_class: z.enum(['crypto_native', 'tradfi']).optional(),
      ticker: z.string().optional(),
      limit: z.coerce.number().default(50)
    });

    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) return reply.status(400).send(parsed.error);

    const { source_class, ticker, limit } = parsed.data;

    const { isMock } = await import('../db/pool.js');
    if (isMock) {
      return [
        { 
          id: 1, 
          title: "BTC/EUR Divergence Detected: Crypto-Native Strength vs TradFi Flat-ling", 
          source: "UGT_ENGINE", 
          published_at: new Date().toISOString(),
          sentiment: JSON.stringify({ compound: 0.85, pos: 0.4, neg: 0.0 }),
          tickers: JSON.stringify(["BTC", "EUR"])
        },
        { 
          id: 2, 
          title: "Institutional flows entering SOL as network congestion resolves", 
          source: "COINDESK", 
          published_at: new Date(Date.now() - 3600000).toISOString(),
          sentiment: JSON.stringify({ compound: 0.42, pos: 0.2, neg: 0.0 }),
          tickers: JSON.stringify(["SOL"])
        },
        { 
          id: 3, 
          title: "ECB maintaining rates: Impact on EUR-denominated crypto pairs", 
          source: "REUTERS", 
          published_at: new Date(Date.now() - 7200000).toISOString(),
          sentiment: JSON.stringify({ compound: -0.12, pos: 0.1, neg: 0.2 }),
          tickers: JSON.stringify(["EUR", "BTC"])
        }
      ];
    }

    const { query } = await import('../db/pool.js');
    const res = await query(sql, params);
    return res.rows;
  });
};

export default newsRoutes;
