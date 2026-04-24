import { FastifyInstance } from 'fastify';
import Redis from 'ioredis';
import { isMock } from '../db/pool.js';

const CONSUMER_GROUP = 'cg:api';
const CONSUMER_NAME = `api-${process.pid}`;

let redisClient: any = null;

async function isHostResolvable(host: string): Promise<boolean> {
  const dns = await import('node:dns/promises');
  try {
    const res = await dns.lookup(host);
    return !!res.address;
  } catch {
    return false;
  }
}

async function getRedis() {
  if (redisClient) return redisClient;
  
  if (isMock) {
    console.log('⚠️ Redis disabled (MOCK_MODE)');
    redisClient = {
      xgroup: async () => {},
      xreadgroup: async () => { await new Promise(r => setTimeout(r, 1000)); return null; },
      on: () => {}
    };
    return redisClient;
  }
  
  const isRedisResolvable = await isHostResolvable('redis');
  const redisUrl = process.env.REDIS_URL || (isRedisResolvable ? 'redis://redis:6379' : 'redis://127.0.0.1:6379');
  
  console.log(`Connecting to Redis at ${redisUrl}...`);
  const client = new Redis(redisUrl, {
    maxRetriesPerRequest: 1,
    connectTimeout: 2000,
    retryStrategy: (times) => (times > 3 ? null : 1000)
  });
  
  client.on('error', (err: any) => console.error('Redis connection error:', err.message));
  redisClient = client;
  return client;
}

export default async function wsStream(fastify: FastifyInstance) {
  const redis = await getRedis();
  
  // Ensure consumer group exists
  const streams = ['stream:prices', 'stream:onchain', 'stream:macro', 'stream:news', 'stream:sentiment', 'stream:portfolio', 'stream:pac'];
  
  for (const stream of streams) {
    try {
      await redis.xgroup('CREATE', stream, CONSUMER_GROUP, '0', 'MKSTREAM');
    } catch (err: any) {
      if (!err.message.includes('BUSYGROUP')) {
        fastify.log.error(`Error creating consumer group for ${stream}: ${err.message}`);
      }
    }
  }

  fastify.get('/ws/stream', { websocket: true }, (connection, req) => {
    const socket = (connection as any).socket || connection;
    if (!socket || typeof socket.on !== 'function') {
        fastify.log.error('WS: Internal error - socket not available');
        return;
    }

    fastify.log.info('WS: New connection established');
    const subscriptions = new Set<string>();
    
    // Price tick batching buffer
    const priceBuffer: Record<string, any> = {};
    const batchInterval = setInterval(() => {
      if (Object.keys(priceBuffer).length > 0 && subscriptions.has('prices')) {
        socket.send(JSON.stringify({ channel: 'prices', data: Object.values(priceBuffer) }));
        // Clear buffer
        for (const key in priceBuffer) delete priceBuffer[key];
      }
    }, 100);

    socket.on('message', (message: any) => {
      try {
        const { action, channel } = JSON.parse(message.toString());
        if (action === 'subscribe') {
          subscriptions.add(channel);
          fastify.log.info(`WS: Subscribed to ${channel}`);
        } else if (action === 'unsubscribe') {
          subscriptions.delete(channel);
          fastify.log.info(`WS: Unsubscribed from ${channel}`);
        }
      } catch (err) {
        fastify.log.error('WS: Error parsing message');
      }
    });

    const poll = async () => {
      while (socket.readyState === 1) { // 1 = OPEN
        try {
          // Read from all streams in one call using XREADGROUP
          const data = await redis.xreadgroup(
            'GROUP', CONSUMER_GROUP, CONSUMER_NAME,
            'COUNT', 10,
            'BLOCK', 1000,
            'STREAMS', ...streams, ...streams.map(() => '>')
          );

          if (data) {
            for (const [streamName, entries] of data as [string, any][]) {
              const channel = streamName.split(':')[1];
              if (!subscriptions.has(channel)) continue;

              for (const [id, fields] of entries) {
                // Convert [key, val, key, val] to object
                const payload: any = {};
                for (let i = 0; i < fields.length; i += 2) {
                  payload[fields[i]] = fields[i+1];
                }

                if (channel === 'prices') {
                  // Batch price ticks by symbol
                  const dataObj = JSON.parse(payload.data);
                  priceBuffer[dataObj.symbol] = dataObj;
                } else {
                  // Immediate relay for others
                  socket.send(JSON.stringify({ channel, data: JSON.parse(payload.data) }));
                }
              }
            }
          }
        } catch (err) {
          fastify.log.error(`WS: Error polling Redis: ${err}`);
          break;
        }
      }
      clearInterval(batchInterval);
    };

    poll();

    socket.on('close', () => {
      fastify.log.info('WS: Connection closed');
      clearInterval(batchInterval);
    });
  });
}
