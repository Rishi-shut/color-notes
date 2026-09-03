import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { neon } from '@neondatabase/serverless';

type RequestLike = { method?: string; body?: unknown; headers: Record<string, string | string[] | undefined> };
type ResponseLike = { status: (code: number) => ResponseLike; json: (value: unknown) => void; setHeader: (name: string, value: string) => void; end: () => void };

export type ApiRequest = RequestLike;
export type ApiResponse = ResponseLike;

const SESSION_DAYS = 30;
const sql = () => {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured.');
  return neon(process.env.DATABASE_URL);
};

let schemaReady: Promise<void> | undefined;
export function ensureSchema() {
  schemaReady ??= (async () => {
    const db = sql();
    await db`CREATE TABLE IF NOT EXISTS color_notes_users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      username_key TEXT NOT NULL UNIQUE,
      password_salt TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      encryption_salt TEXT NOT NULL,
      failed_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
    await db`CREATE TABLE IF NOT EXISTS color_notes_sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES color_notes_users(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
    await db`CREATE INDEX IF NOT EXISTS idx_color_notes_sessions_user ON color_notes_sessions(user_id)`;
    await db`CREATE TABLE IF NOT EXISTS color_notes_vaults (
      user_id TEXT PRIMARY KEY REFERENCES color_notes_users(id) ON DELETE CASCADE,
      ciphertext TEXT NOT NULL,
      iv TEXT NOT NULL,
      revision BIGINT NOT NULL DEFAULT 1,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
  })();
  return schemaReady;
}

export function database() { return sql(); }
export function normalizeUsername(value: unknown) {
  const username = typeof value === 'string' ? value.trim() : '';
  if (!/^[a-zA-Z0-9_]{3,24}$/.test(username)) return null;
  return { username, key: username.toLowerCase() };
}
export function validPassword(value: unknown): value is string { return typeof value === 'string' && value.length >= 8 && value.length <= 128; }
export function makeSalt() { return randomBytes(18).toString('base64url'); }
export function hashPassword(password: string, salt: string) { return scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }).toString('base64url'); }
export function safeEqual(a: string, b: string) { const left = Buffer.from(a); const right = Buffer.from(b); return left.length === right.length && timingSafeEqual(left, right); }
function tokenHash(token: string) { return createHash('sha256').update(token).digest('base64url'); }

export async function createSession(response: ApiResponse, userId: string) {
  const token = randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000);
  const db = database();
  await db`INSERT INTO color_notes_sessions (token_hash, user_id, expires_at) VALUES (${tokenHash(token)}, ${userId}, ${expires.toISOString()})`;
  response.setHeader('Set-Cookie', `color_notes_session=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_DAYS * 86400}`);
}

export async function currentUser(request: ApiRequest) {
  await ensureSchema();
  const rawCookie = Array.isArray(request.headers.cookie) ? request.headers.cookie.join(';') : request.headers.cookie ?? '';
  const token = rawCookie.split(';').map((part) => part.trim()).find((part) => part.startsWith('color_notes_session='))?.slice('color_notes_session='.length);
  if (!token) return null;
  const db = database();
  const rows = await db`SELECT u.id, u.username, u.username_key, u.encryption_salt
    FROM color_notes_sessions s JOIN color_notes_users u ON u.id = s.user_id
    WHERE s.token_hash = ${tokenHash(token)} AND s.expires_at > NOW() LIMIT 1`;
  return rows[0] as { id: string; username: string; username_key: string; encryption_salt: string } | undefined ?? null;
}

export function sameOrigin(request: ApiRequest) {
  const origin = typeof request.headers.origin === 'string' ? request.headers.origin : '';
  const host = typeof request.headers.host === 'string' ? request.headers.host : '';
  try { return !origin || new URL(origin).host === host; } catch { return false; }
}
export function methodNotAllowed(response: ApiResponse, methods: string[]) { response.setHeader('Allow', methods.join(', ')); response.status(405).json({ error: 'Method not allowed.' }); }
export function clearSession(response: ApiResponse) { response.setHeader('Set-Cookie', 'color_notes_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0'); }
