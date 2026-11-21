import pg from 'pg';

const { Pool } = pg;

// No mock mode: without a database UGT must fail loudly, never serve invented data.
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL missing: the API cannot start without a database.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

export const query = (text: string, params?: any[]) => pool.query(text, params);
export default pool;
