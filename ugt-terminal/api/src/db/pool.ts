import pg from 'pg';

const { Pool } = pg;

let isMock = false;
let pool: any;

try {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL missing');
  }
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });
  // Note: No top-level await here to avoid blocking startup
  // Connectivity check will happen in server.ts or on-demand
} catch (err) {
  console.error('⚠️ DB Configuration invalid, entering MOCK_MODE');
  isMock = true;
  pool = {
    query: async (text: string, params?: any[]) => {
      return { rows: [] };
    }
  };
}

export { isMock };
export const query = (text: string, params?: any[]) => pool.query(text, params);
export default pool;
