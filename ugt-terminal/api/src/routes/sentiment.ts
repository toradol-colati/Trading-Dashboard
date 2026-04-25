import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { query } from '../db/pool.js';
import { z } from 'zod';

const sentimentRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // GET /api/sentiment/ticker/:ticker?window=
  fastify.get('/ticker/:ticker', async (request, reply) => {
    const { ticker } = request.params as { ticker: string };
    const { window } = request.query as { window?: string }; // es: 24h, 7d
    
    const sql = `
      SELECT * FROM sentiment_timeseries
      WHERE ticker = $1
      ORDER BY time DESC
      LIMIT 168 -- approx 1 week if hourly
    `;
    
    const res = await query(sql, [ticker]);
    return res.rows;
  });

  // GET /api/sentiment/divergence?ticker=
  fastify.get('/divergence', async (request, reply) => {
    const { ticker } = request.query as { ticker?: string };
    
    let sql = `
      SELECT time, ticker, 
             MAX(CASE WHEN source_class = 'crypto_native' THEN zscore END) as z_crypto,
             MAX(CASE WHEN source_class = 'tradfi' THEN zscore END) as z_tradfi
      FROM sentiment_timeseries
    `;
    
    const params: any[] = [];
    if (ticker) {
      params.push(ticker);
      sql += ' WHERE ticker = $1';
    }
    
    sql += ' GROUP BY time, ticker ORDER BY time DESC LIMIT 100';
    
    const res = await query(sql, params);
    
    // Calculate divergence in-situ or rely on table? 
    // Spec says divergence is z_crypto - z_tradfi.
    const rows = res.rows.map((r: Record<string, number | string | null>) => ({
      ...r,
      divergence: Number(r.z_crypto || 0) - Number(r.z_tradfi || 0)
    }));
    
    return rows;
  });
};

export default sentimentRoutes;
