import { randomUUID } from 'node:crypto';
import { clearSession, createSession, currentUser, database, ensureSchema, hashVerifier, makeSalt, methodNotAllowed, normalizeUsername, safeEqual, sameOrigin, validEncryptionSalt, validVerifier, type ApiRequest, type ApiResponse } from './_lib/server.js';

export default async function handler(request: ApiRequest, response: ApiResponse) {
  try {
    response.setHeader('Cache-Control', 'private, no-store, max-age=0');
    if (request.method === 'GET') {
      const user = await currentUser(request);
      if (!user) return response.status(401).json({ error: 'Sign in required.' });
      return response.status(200).json({ username: user.username, usernameKey: user.username_key, encryptionSalt: user.encryption_salt });
    }
    if (request.method !== 'POST') return methodNotAllowed(response, ['GET', 'POST']);
    if (!sameOrigin(request)) return response.status(403).json({ error: 'Request origin was rejected.' });
    await ensureSchema();
    const body = request.body && typeof request.body === 'object' ? request.body as Record<string, unknown> : {};
    const action = body.action;
    if (action === 'logout') { clearSession(response); return response.status(200).json({ ok: true }); }
    const normalized = normalizeUsername(body.username);
    if (!normalized) return response.status(400).json({ error: 'Use 3–24 letters, numbers, or underscores.' });
    const db = database();

    if (action === 'challenge') {
      const rows = await db`SELECT encryption_salt FROM color_notes_users WHERE username_key = ${normalized.key} LIMIT 1`;
      if (!rows[0]) return response.status(401).json({ error: 'Username or password is incorrect.' });
      return response.status(200).json({ encryptionSalt: rows[0].encryption_salt });
    }

    if (action === 'signup') {
      if (!validVerifier(body.verifier) || !validEncryptionSalt(body.encryptionSalt)) return response.status(400).json({ error: 'Invalid account key.' });
      const passwordSalt = makeSalt();
      const encryptionSalt = body.encryptionSalt;
      const id = randomUUID();
      try {
        await db`INSERT INTO color_notes_users (id, username, username_key, password_salt, password_hash, encryption_salt)
          VALUES (${id}, ${normalized.username}, ${normalized.key}, ${passwordSalt}, ${hashVerifier(body.verifier, passwordSalt)}, ${encryptionSalt})`;
      } catch (error) {
        if ((error as { code?: string }).code === '23505') return response.status(409).json({ error: 'That username is already taken.' });
        throw error;
      }
      await createSession(response, id);
      return response.status(201).json({ username: normalized.username, usernameKey: normalized.key, encryptionSalt });
    }

    if (action === 'login') {
      if (!validVerifier(body.verifier)) return response.status(401).json({ error: 'Username or password is incorrect.' });
      const rows = await db`SELECT id, username, username_key, password_salt, password_hash, encryption_salt, failed_attempts, locked_until
        FROM color_notes_users WHERE username_key = ${normalized.key} LIMIT 1`;
      const user = rows[0] as Record<string, unknown> | undefined;
      if (!user) return response.status(401).json({ error: 'Username or password is incorrect.' });
      const lockedUntil = user.locked_until instanceof Date ? user.locked_until : typeof user.locked_until === 'string' || typeof user.locked_until === 'number' ? new Date(user.locked_until) : null;
      if (lockedUntil && lockedUntil.getTime() > Date.now()) return response.status(429).json({ error: 'Too many attempts. Try again in 15 minutes.' });
      const valid = safeEqual(hashVerifier(body.verifier, String(user.password_salt)), String(user.password_hash));
      if (!valid) {
        const attempts = Number(user.failed_attempts ?? 0) + 1;
        await db`UPDATE color_notes_users SET failed_attempts = ${attempts >= 5 ? 0 : attempts}, locked_until = ${attempts >= 5 ? new Date(Date.now() + 15 * 60_000).toISOString() : null} WHERE id = ${String(user.id)}`;
        return response.status(401).json({ error: 'Username or password is incorrect.' });
      }
      await db`UPDATE color_notes_users SET failed_attempts = 0, locked_until = NULL WHERE id = ${String(user.id)}`;
      await createSession(response, String(user.id));
      return response.status(200).json({ username: user.username, usernameKey: user.username_key, encryptionSalt: user.encryption_salt });
    }
    return response.status(400).json({ error: 'Unknown account action.' });
  } catch (error) {
    console.error(error);
    return response.status(500).json({ error: 'The account service is temporarily unavailable.' });
  }
}
