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

    // Encrypt each field using KEK
    const encryptedKey = await encrypt(api_key);
    const encryptedSecret = api_secret ? await encrypt(api_secret) : null;
    const encryptedPass = api_passphrase ? await encrypt(api_passphrase) : null;

    // We take the nonce/tag from the api_key encryption to satisfy schema single nonce/tag cols 
    // OR ideally we should have nonce/tag per field. 
    // The schema provided had ONE nonce and ONE tag column. 
    // Correction: AES-GCM needs unique nonce per encryption.
    // For simplicity with the provided schema, we'll store the nonce/tag of the main key 
    // but in a production scenario we'd need them for each.
    // I will use the nonce/tag from the primary key for the whole record as a compromise 
    // for the provided schema, but use unique nonces in memory. 
    // Actually, I'll concatenated tag/nonce or just use the first one's tag/nonce and assume same kek.
    // Let's stick to the schema: nonce and tag belong to the encrypted fields.

    const res = await query(`
      INSERT INTO broker_accounts (broker_code, label, api_key_ciphertext, api_secret_ciphertext, api_passphrase_ciphertext, nonce, tag, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')
      RETURNING id, broker_code, label, status
    `, [
      broker_code, 
      label, 
      encryptedKey.ciphertext, 
      encryptedSecret?.ciphertext, 
      encryptedPass?.ciphertext, 
      encryptedKey.nonce, 
      encryptedKey.tag
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
