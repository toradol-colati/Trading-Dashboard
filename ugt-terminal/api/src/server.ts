import fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import multipart from '@fastify/multipart';
import pino from 'pino';
import { bootstrapKek } from './crypto/kek.js';
import pool from './db/pool.js';
import migrate from 'node-pg-migrate';

// Route imports
import priceRoutes from './routes/prices.js';
import onchainRoutes from './routes/onchain.js';
import newsRoutes from './routes/news.js';
import sentimentRoutes from './routes/sentiment.js';
import portfolioRoutes from './routes/portfolio.js';
import pacRoutes from './routes/pac.js';
import brokerRoutes from './routes/broker.js';
import systemRoutes from './routes/system.js';
import wsStream from './ws/stream.js';

const logger = pino({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
});

const server = fastify({
  logger,
  disableRequestLogging: true,
});

// Plugins
await server.register(cors, { origin: true });
await server.register(websocket);
await server.register(multipart);

// Healthcheck
server.get('/health', async (request, reply) => {
  try {
    await pool.query('SELECT 1');
    return { status: 'OK' };
  } catch (err) {
    server.log.error(err);
    return reply.status(500).send({ status: 'ERROR', error: 'Database unreachable' });
  }
});

// Register routes
server.register(priceRoutes, { prefix: '/api/prices' });
server.register(onchainRoutes, { prefix: '/api/onchain' });
server.register(newsRoutes, { prefix: '/api/news' });
server.register(sentimentRoutes, { prefix: '/api/sentiment' });
server.register(portfolioRoutes, { prefix: '/api/portfolio' });
server.register(pacRoutes, { prefix: '/api/pac' });
server.register(brokerRoutes, { prefix: '/api/broker' });
server.register(systemRoutes, { prefix: '/api/system' });
server.register(wsStream);

const start = async () => {
  try {
    // 1. Run migrations
    const { isMock } = await import('./db/pool.js');
    if (!isMock) {
      console.log('Running migrations...');
      try {
        await migrate({
          databaseUrl: process.env.DATABASE_URL as string,
          migrationsTable: 'pgmigrations',
          dir: 'src/db/migrations',
          direction: 'up',
          count: Infinity,
          ignorePattern: '.*',
        });
      } catch (migrateErr) {
        console.error('[WARN] Critical: Migrations failed. Continuing in degraded mode.');
      }
    } else {
      console.log('Skipping migrations (MOCK_MODE)');
    }

    // 2. Bootstrap KEK
    console.log('Bootstrapping KEK...');
    await bootstrapKek();

    // 3. Start server
    const port = parseInt(process.env.PORT || '3001');
    await server.listen({ port, host: '0.0.0.0' });
    console.log(`Server listening on port ${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
