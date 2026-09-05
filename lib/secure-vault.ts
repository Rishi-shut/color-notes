import type { Note } from './note-types';

export type VaultPayload = { version: 1; notes: Note[]; tombstones: Record<string, string> };
export type EncryptedVault = { ciphertext: string; iv: string; revision: number };
export type LocalVault = EncryptedVault & { username: string; usernameKey: string; encryptionSalt: string };
export type RememberedVaultSession = { key: CryptoKey; verifier: string | null };

const bytesToBase64 = (bytes: Uint8Array) => { let value = ''; for (const byte of bytes) value += String.fromCharCode(byte); return btoa(value); };
const base64ToBytes = (value: string) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0));

export function createEncryptionSalt() { return bytesToBase64(crypto.getRandomValues(new Uint8Array(18))); }
export async function deriveVaultCredentials(password: string, salt: string) {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: base64ToBytes(salt), iterations: 310_000, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', key));
  const label = new TextEncoder().encode('color-notes-auth-v1');
  const verifierInput = new Uint8Array(raw.length + label.length);
  verifierInput.set(raw); verifierInput.set(label, raw.length);
  const verifier = bytesToBase64(new Uint8Array(await crypto.subtle.digest('SHA-256', verifierInput)));
  return { key, verifier };
}
export async function deriveVaultKey(password: string, salt: string) { return (await deriveVaultCredentials(password, salt)).key; }
export async function exportVaultKey(key: CryptoKey) { return bytesToBase64(new Uint8Array(await crypto.subtle.exportKey('raw', key))); }
export async function importVaultKey(value: string) { return crypto.subtle.importKey('raw', base64ToBytes(value), { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']); }
export async function encryptVault(payload: VaultPayload, key: CryptoKey, revision: number): Promise<EncryptedVault> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(payload)));
  return { ciphertext: bytesToBase64(new Uint8Array(encrypted)), iv: bytesToBase64(iv), revision };
}
export async function decryptVault(vault: EncryptedVault, key: CryptoKey): Promise<VaultPayload> {
  const clear = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64ToBytes(vault.iv) }, key, base64ToBytes(vault.ciphertext));
  const value = JSON.parse(new TextDecoder().decode(clear)) as VaultPayload;
  if (value.version !== 1 || !Array.isArray(value.notes) || !value.tombstones) throw new Error('Unsupported vault.');
  return value;
}

const DB_NAME = 'color-notes-secure-vaults';
const DB_VERSION = 2;
const STORE = 'vaults';
const DEVICE_STORE = 'device';
const SESSION_STORE = 'sessions';
const DEVICE_KEY_ID = 'unlock-key';
type StoredSession = { usernameKey: string; ciphertext: string; iv: string; version: 1 };

function openVaultDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'usernameKey' });
      if (!db.objectStoreNames.contains(DEVICE_STORE)) db.createObjectStore(DEVICE_STORE);
      if (!db.objectStoreNames.contains(SESSION_STORE)) db.createObjectStore(SESSION_STORE, { keyPath: 'usernameKey' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function readRequest<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

async function loadDeviceKey(db: IDBDatabase) {
  return readRequest(db.transaction(DEVICE_STORE).objectStore(DEVICE_STORE).get(DEVICE_KEY_ID)) as Promise<CryptoKey | undefined>;
}

async function deviceKey() {
  const db = await openVaultDatabase();
  const existing = await loadDeviceKey(db);
  if (existing) return existing;
  const created = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  try {
    const transaction = db.transaction(DEVICE_STORE, 'readwrite');
    transaction.objectStore(DEVICE_STORE).add(created, DEVICE_KEY_ID);
    await transactionDone(transaction);
    return created;
  } catch {
    const winner = await loadDeviceKey(db);
    if (winner) return winner;
    throw new Error('Could not protect the remembered session.');
  }
}

export async function saveLocalVault(vault: LocalVault) { const db = await openVaultDatabase(); await new Promise<void>((resolve, reject) => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(vault); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); }); }
export async function loadLocalVault(usernameKey: string) { const db = await openVaultDatabase(); return new Promise<LocalVault | undefined>((resolve, reject) => { const request = db.transaction(STORE).objectStore(STORE).get(usernameKey); request.onsuccess = () => resolve(request.result as LocalVault | undefined); request.onerror = () => reject(request.error); }); }

export async function rememberVaultSession(usernameKey: string, key: CryptoKey, verifier: string | null) {
  const wrappingKey = await deviceKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const clear = new TextEncoder().encode(JSON.stringify({ vaultKey: await exportVaultKey(key), verifier }));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, wrappingKey, clear);
  const db = await openVaultDatabase();
  const transaction = db.transaction(SESSION_STORE, 'readwrite');
  transaction.objectStore(SESSION_STORE).put({ usernameKey, ciphertext: bytesToBase64(new Uint8Array(encrypted)), iv: bytesToBase64(iv), version: 1 } satisfies StoredSession);
  await transactionDone(transaction);
}

export async function loadRememberedVaultSession(usernameKey: string): Promise<RememberedVaultSession | null> {
  const db = await openVaultDatabase();
  const stored = await readRequest(db.transaction(SESSION_STORE).objectStore(SESSION_STORE).get(usernameKey)) as StoredSession | undefined;
  if (!stored || stored.version !== 1) return null;
  const wrappingKey = await loadDeviceKey(db);
  if (!wrappingKey) return null;
  const clear = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64ToBytes(stored.iv) }, wrappingKey, base64ToBytes(stored.ciphertext));
  const parsed = JSON.parse(new TextDecoder().decode(clear)) as { vaultKey?: unknown; verifier?: unknown };
  if (typeof parsed.vaultKey !== 'string' || (parsed.verifier !== null && typeof parsed.verifier !== 'string')) throw new Error('Invalid remembered session.');
  return { key: await importVaultKey(parsed.vaultKey), verifier: parsed.verifier ?? null };
}

export async function forgetVaultSession(usernameKey: string) {
  const db = await openVaultDatabase();
  const transaction = db.transaction(SESSION_STORE, 'readwrite');
  transaction.objectStore(SESSION_STORE).delete(usernameKey);
  await transactionDone(transaction);
}

export function mergeVaults(left: VaultPayload, right: VaultPayload): VaultPayload {
  const notes = new Map<string, Note>();
  for (const note of [...left.notes, ...right.notes]) { const current = notes.get(note.id); if (!current || note.updatedAt > current.updatedAt) notes.set(note.id, note); }
  const tombstones = { ...left.tombstones };
  for (const [id, time] of Object.entries(right.tombstones)) if (!tombstones[id] || time > tombstones[id]) tombstones[id] = time;
  for (const [id, time] of Object.entries(tombstones)) { const note = notes.get(id); if (!note || time >= note.updatedAt) notes.delete(id); }
  return { version: 1, notes: [...notes.values()], tombstones };
}
