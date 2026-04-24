import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { query } from '../db/pool.js';
import { z } from 'zod';

const onchainRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // GET /api/onchain/tvl?protocol=&chain=&window=
  fastify.get('/tvl', async (request, reply) => {
    const querySchema = z.object({
      protocol: z.string().optional(),
      chain: z.string().optional(),
      limit: z.coerce.number().default(100)
    });

    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) return reply.status(400).send(parsed.error);

    const { protocol, chain, limit } = parsed.data;
    
    let sql = 'SELECT * FROM onchain_metrics WHERE metric = \'tvl\'';
    const params: any[] = [];
    
    if (protocol) {
      params.push(protocol);
      sql += ` AND source = $${params.length}`;
    }
    
    if (chain) {
      params.push(chain);
      sql += ` AND chain = $${params.length}`;
    }
    
    params.push(limit);
    sql += ` ORDER BY time DESC LIMIT $${params.length}`;
    
    const res = await query(sql, params);
    return res.rows;
  });

  // GET /api/onchain/dex?pair=
  fastify.get('/dex', async (request, reply) => {
    const { pair } = request.query as { pair?: string };
    
    let sql = 'SELECT * FROM onchain_metrics WHERE metric = \'dex_volume\'';
    const params: any[] = [];
    
    if (pair) {
      params.push(pair);
      sql += ` AND metadata_json->>\'pair\' = $${params.length}`;
    }
    
    sql += ' ORDER BY time DESC LIMIT 100';
    
    const res = await query(sql, params);
    return res.rows;
  });
};

export default onchainRoutes;
