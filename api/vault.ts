import { currentUser, database, methodNotAllowed, sameOrigin, type ApiRequest, type ApiResponse } from './_lib/server.js';

export default async function handler(request: ApiRequest, response: ApiResponse) {
  try {
    response.setHeader('Cache-Control', 'private, no-store, max-age=0');
    const user = await currentUser(request);
    if (!user) return response.status(401).json({ error: 'Sign in required.' });
    const db = database();
    if (request.method === 'GET') {
      const revisions = await db`SELECT revision FROM color_notes_vaults WHERE user_id = ${user.id} LIMIT 1`;
      const revision = revisions[0] ? Number(revisions[0].revision) : 0;
      const etag = `"${revision}"`;
      response.setHeader('ETag', etag);
      const knownRevision = Array.isArray(request.headers['if-none-match']) ? request.headers['if-none-match'][0] : request.headers['if-none-match'];
      if (knownRevision === etag) return response.status(304).end();
      const rows = await db`SELECT ciphertext, iv, revision, updated_at FROM color_notes_vaults WHERE user_id = ${user.id} LIMIT 1`;
      return response.status(200).json({ vault: rows[0] ?? null });
    }
    if (request.method !== 'PUT') return methodNotAllowed(response, ['GET', 'PUT']);
    if (!sameOrigin(request)) return response.status(403).json({ error: 'Request origin was rejected.' });
    const body = request.body && typeof request.body === 'object' ? request.body as Record<string, unknown> : {};
    if (typeof body.ciphertext !== 'string' || typeof body.iv !== 'string' || !Number.isSafeInteger(body.baseRevision) || body.ciphertext.length > 5_000_000) return response.status(400).json({ error: 'Invalid encrypted vault.' });
    const baseRevision = Number(body.baseRevision);
    const rows = await db`INSERT INTO color_notes_vaults (user_id, ciphertext, iv, revision)
      VALUES (${user.id}, ${body.ciphertext}, ${body.iv}, 1)
      ON CONFLICT (user_id) DO UPDATE SET ciphertext = EXCLUDED.ciphertext, iv = EXCLUDED.iv,
        revision = color_notes_vaults.revision + 1, updated_at = NOW()
      WHERE color_notes_vaults.revision = ${baseRevision}
      RETURNING revision, updated_at`;
    if (!rows[0]) {
      const latest = await db`SELECT ciphertext, iv, revision, updated_at FROM color_notes_vaults WHERE user_id = ${user.id} LIMIT 1`;
      return response.status(409).json({ error: 'Vault changed on another device.', vault: latest[0] ?? null });
    }
    return response.status(200).json({ revision: Number(rows[0].revision), updatedAt: rows[0].updated_at });
  } catch (error) {
    console.error(error);
    return response.status(500).json({ error: 'Encrypted sync is temporarily unavailable.' });
  }
}
