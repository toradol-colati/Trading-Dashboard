import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { query } from '../db/pool.js';

const isDocker = existsSync('/.dockerenv') || existsSync('/run/secrets');
const DEFAULT_KEK_PATH = isDocker ? '/run/secrets/kek.bin' : './secrets/kek.bin';
const KEK_PATH = process.env.KEK_PATH || DEFAULT_KEK_PATH;
const ALGORITHM = 'aes-256-gcm';

export async function bootstrapKek() {
  const { isMock } = await import('../db/pool.js');
  if (isMock) {
    console.log('⏩ Skipping KEK bootstrap (MOCK_MODE)');
    return;
  }

  if (existsSync(KEK_PATH)) {
    return;
  }
  
  // Ensure directory exists
  const { mkdir } = await import('node:fs/promises');
  const { dirname } = await import('node:path');
  const dir = dirname(KEK_PATH);
  
  try {
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
    const kek = randomBytes(32);
    await writeFile(KEK_PATH, kek, { mode: 0o600 });
    console.log(`✅ KEK bootstrapped at ${KEK_PATH}`);
  } catch (err: any) {
    console.error(`⚠️ Failed to bootstrap KEK at ${KEK_PATH}: ${err.message}`);
    console.log('Fallback: entering MOCK_MODE for crypto');
  }
}

async function getKek(): Promise<Buffer> {
  const { isMock } = await import('../db/pool.js');
  if (isMock) return Buffer.alloc(32, 'MOCK_KEY_MOCK_KEY_MOCK_KEY_MOCK_');

  return await readFile(KEK_PATH);
}

export async function encrypt(plaintext: string): Promise<{ ciphertext: Buffer; nonce: Buffer; tag: Buffer }> {
  const kek = await getKek();
  const nonce = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, kek, nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { ciphertext, nonce, tag };
}

export async function decrypt(
  ciphertext: Buffer,
  nonce: Buffer,
  tag: Buffer,
  brokerAccountId: string,
  callerService: string
): Promise<string> {
  const kek = await getKek();
  const decipher = createDecipheriv(ALGORITHM, kek, nonce);
  decipher.setAuthTag(tag);
  const decrypted = decipher.update(ciphertext) + decipher.final('utf8');

  // Audit log
  await query(
    'INSERT INTO key_access_log (broker_account_id, operation, caller_service) VALUES ($1, $2, $3)',
    [brokerAccountId, 'DECRYPT', callerService]
  );

  return decrypted;
}
