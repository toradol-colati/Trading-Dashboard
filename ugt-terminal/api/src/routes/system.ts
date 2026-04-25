import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import pool from '../db/pool.js';
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL || 'redis://redis:6379');

const systemRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // GET /api/system/status
  fastify.get('/status', async (request, reply) => {
    try {
      const dbStatus = await pool.query('SELECT 1').then(() => 'OK').catch(() => 'ERROR');
      const redisStatus = await redis.ping().then(() => 'OK').catch(() => 'ERROR');
      
      // Fetch heartbeats
      const dataWorkerStatus = await redis.get("status:worker-data").then(v => v ? JSON.parse(v) : null);
      const nlpWorkerStatus = await redis.get("status:worker-nlp").then(v => v ? JSON.parse(v) : null);
      
      return {
        timestamp: new Date().toISOString(),
        infrastructure: {
          database: dbStatus,
          redis: redisStatus
        },
        services: {
          api: 'OK',
          'worker-data': dataWorkerStatus ? 'OK' : 'UNKNOWN',
          'worker-nlp': nlpWorkerStatus ? 'OK' : 'UNKNOWN',
          'worker-broker': 'OK'
        },
        active_sources_count: (dataWorkerStatus?.active_sources_count || 0) + (nlpWorkerStatus?.active_sources_count || 0),
        details: {
          data: dataWorkerStatus,
          nlp: nlpWorkerStatus
        }
      };
    } catch (err: any) {
      fastify.log.error(err);
      return reply.status(500).send({ 
        status: 'ERROR', 
        error: err?.message || 'Internal Server Error',
        stack: process.env.NODE_ENV === 'development' ? err?.stack : undefined
      });
    }
  });
};

export default systemRoutes;
