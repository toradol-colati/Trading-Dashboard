import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { query } from '../db/pool.js';
import { z } from 'zod';
import { encrypt } from '../crypto/kek.js';

const brokerRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // POST /api/broker/credentials
  fastify.post('/credentials', {
    onRequest: async (request, reply) => {
      const ip = request.ip;
      if (ip !== '127.0.0.1' && ip !== '::1' && ip !== 'localhost') {
        reply.status(403).send({ error: 'Endpoint available only on localhost' });
      }
    }
  }, async (request, reply) => {
    const bodySchema = z.object({
      broker_code: z.enum(['IBKR', 'BINANCE', 'COINBASE', 'ROBINHOOD', 'YOUNGPLATFORM', 'YOUHODLER', 'TRADEREPUBLIC']),
      label: z.string(),
      api_key: z.string(),
      api_secret: z.string().optional(),
      api_passphrase: z.string().optional()
    });

    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send(parsed.error);

    const { broker_code, label, api_key, api_secret, api_passphrase } = parsed.data;

    // Encrypt each field independently — AES-256-GCM requires unique nonce per encryption
    const encryptedKey = await encrypt(api_key);
    const encryptedSecret = api_secret ? await encrypt(api_secret) : null;
    const encryptedPass = api_passphrase ? await encrypt(api_passphrase) : null;

    const res = await query(`
      INSERT INTO broker_accounts (
        broker_code, label,
        api_key_ciphertext, api_key_nonce, api_key_tag,
        api_secret_ciphertext, api_secret_nonce, api_secret_tag,
        api_passphrase_ciphertext, api_passphrase_nonce, api_passphrase_tag,
        status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'active')
      RETURNING id, broker_code, label, status
    `, [
      broker_code, 
      label, 
      encryptedKey.ciphertext, 
      encryptedKey.nonce, 
      encryptedKey.tag,
      encryptedSecret?.ciphertext ?? null, 
      encryptedSecret?.nonce ?? null, 
      encryptedSecret?.tag ?? null,
      encryptedPass?.ciphertext ?? null, 
      encryptedPass?.nonce ?? null, 
      encryptedPass?.tag ?? null
    ]);

    return res.rows[0];
  });

  // GET /api/broker/accounts
  fastify.get('/accounts', async (request, reply) => {
    const res = await query('SELECT id, broker_code, label, status, last_sync_at FROM broker_accounts');
    return res.rows;
  });
};

export default brokerRoutes;
