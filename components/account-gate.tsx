'use client';

import * as React from 'react';
import { AlertTriangle, CloudOff, Eye, EyeOff, LockKeyhole, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NotesApp, type SyncStatus } from '@/components/notes-app';
import { loadNotes, replaceAllNotes } from '@/lib/notes-db';
import { createEncryptionSalt, decryptVault, deriveVaultCredentials, encryptVault, forgetVaultSession, importVaultKey, loadLocalVault, loadRememberedVaultSession, mergeVaults, rememberVaultSession, saveLocalVault, type EncryptedVault, type VaultPayload } from '@/lib/secure-vault';

type Account = { username: string; usernameKey: string; encryptionSalt: string; notes: VaultPayload['notes']; tombstones: VaultPayload['tombstones']; refresh: number };
type AuthReply = { username: string; usernameKey: string; encryptionSalt: string; error?: string };

export function AccountGate() {
  const [account, setAccount] = React.useState<Account | null>(null);
  const [booting, setBooting] = React.useState(true);
  const [syncStatus, setSyncStatus] = React.useState<SyncStatus>(() => typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'saved');
  const keyRef = React.useRef<CryptoKey | null>(null);
  const verifierRef = React.useRef<string | null>(null);
  const payloadRef = React.useRef<VaultPayload>({ version: 1, notes: [], tombstones: {} });
  const accountRef = React.useRef<Account | null>(null);
  const revisionRef = React.useRef(0);
  const syncTimer = React.useRef<number | undefined>(undefined);

  React.useEffect(() => { accountRef.current = account; }, [account]);
  const fetchWithSession = React.useCallback(async (input: RequestInfo | URL, init?: RequestInit) => {
    let response = await fetch(input, init);
    const current = accountRef.current;
    const verifier = verifierRef.current;
    if (response.status !== 401 || !current || !verifier || !navigator.onLine) return response;
    const login = await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'login', username: current.username, verifier }) });
    if (login.ok) response = await fetch(input, init);
    return response;
  }, []);
  React.useEffect(() => {
    document.documentElement.dataset.theme = localStorage.getItem('color-notes-app-theme') || 'butter';
    if ('serviceWorker' in navigator) navigator.serviceWorker.register(new URL('sw.js', document.baseURI).pathname, { updateViaCache: 'none' }).catch(() => undefined);
  }, []);
  const syncNow = React.useCallback(async () => {
    const current = accountRef.current;
    const key = keyRef.current;
    if (!current || !key) return;
    const encrypted = await encryptVault(payloadRef.current, key, revisionRef.current);
    await saveLocalVault({ ...encrypted, username: current.username, usernameKey: current.usernameKey, encryptionSalt: current.encryptionSalt });
    if (!navigator.onLine) { setSyncStatus('offline'); return; }
    setSyncStatus('saving');
    try {
      let response = await fetchWithSession('/api/vault', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ciphertext: encrypted.ciphertext, iv: encrypted.iv, baseRevision: revisionRef.current }) });
      if (response.status === 409) {
        const conflict = await response.json() as { vault: EncryptedVault & { revision: number | string } };
        const remote = { ...conflict.vault, revision: Number(conflict.vault.revision) };
        const merged = mergeVaults(payloadRef.current, await decryptVault(remote, key));
        payloadRef.current = merged; revisionRef.current = remote.revision;
        const retry = await encryptVault(merged, key, remote.revision);
        response = await fetchWithSession('/api/vault', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ciphertext: retry.ciphertext, iv: retry.iv, baseRevision: remote.revision }) });
        if (response.ok) setAccount((value) => value ? { ...value, notes: merged.notes, tombstones: merged.tombstones, refresh: value.refresh + 1 } : value);
      }
      if (!response.ok) throw new Error();
      const saved = await response.json() as { revision: number };
      revisionRef.current = Number(saved.revision);
      const cached = await encryptVault(payloadRef.current, key, revisionRef.current);
      await saveLocalVault({ ...cached, username: current.username, usernameKey: current.usernameKey, encryptionSalt: current.encryptionSalt });
      setSyncStatus('saved');
    } catch { setSyncStatus(navigator.onLine ? 'error' : 'offline'); }
  }, [fetchWithSession]);

  const pullFromCloud = React.useCallback(async (forceMerge = false) => {
    const current = accountRef.current;
    const key = keyRef.current;
    if (!current || !key || !navigator.onLine) return;
    try {
      const response = await fetchWithSession('/api/vault', { cache: 'no-store', headers: forceMerge ? undefined : { 'If-None-Match': `"${revisionRef.current}"` } });
      if (response.status === 304) { setSyncStatus('saved'); return; }
      if (!response.ok) throw new Error();
      const data = await response.json() as { vault: ({ ciphertext: string; iv: string; revision: number | string } | null) };
      const remote = data.vault;
      if (!remote) { revisionRef.current = 0; await syncNow(); return; }
      const remoteVault = { ciphertext: remote.ciphertext, iv: remote.iv, revision: Number(remote.revision) };
      if (!forceMerge && remoteVault.revision <= revisionRef.current) { setSyncStatus('saved'); return; }
      const remotePayload = await decryptVault(remoteVault, key);
      const merged = mergeVaults(payloadRef.current, remotePayload);
      const needsPush = JSON.stringify(merged) !== JSON.stringify(remotePayload);
      payloadRef.current = merged; revisionRef.current = remoteVault.revision;
      const encrypted = await encryptVault(merged, key, remoteVault.revision);
      await saveLocalVault({ ...encrypted, username: current.username, usernameKey: current.usernameKey, encryptionSalt: current.encryptionSalt });
      setAccount((value) => value ? { ...value, notes: merged.notes, tombstones: merged.tombstones, refresh: value.refresh + 1 } : value);
      if (needsPush) await syncNow(); else setSyncStatus('saved');
    } catch { setSyncStatus(navigator.onLine ? 'error' : 'offline'); }
  }, [fetchWithSession, syncNow]);

  React.useEffect(() => {
    const restore = async () => {
      try {
        const usernameKey = localStorage.getItem('color-notes-unlocked-user') ?? sessionStorage.getItem('color-notes-unlocked-user');
        if (!usernameKey) return;
        const local = await loadLocalVault(usernameKey);
        if (!local) return;
        const remembered = await loadRememberedVaultSession(usernameKey);
        const legacyKey = sessionStorage.getItem('color-notes-unlocked-key');
        if (!remembered && !legacyKey) return;
        const key = remembered?.key ?? await importVaultKey(legacyKey!);
        const payload = await decryptVault(local, key);
        keyRef.current = key; verifierRef.current = remembered?.verifier ?? null; payloadRef.current = payload; revisionRef.current = local.revision;
        localStorage.setItem('color-notes-unlocked-user', usernameKey);
        if (!remembered) await rememberVaultSession(usernameKey, key, null);
        sessionStorage.removeItem('color-notes-unlocked-user'); sessionStorage.removeItem('color-notes-unlocked-key');
        const restored = { username: local.username, usernameKey, encryptionSalt: local.encryptionSalt, notes: payload.notes, tombstones: payload.tombstones, refresh: 0 };
        accountRef.current = restored; setAccount(restored);
        if (navigator.onLine) void pullFromCloud(true);
      } catch {
        const usernameKey = localStorage.getItem('color-notes-unlocked-user');
        if (usernameKey) void forgetVaultSession(usernameKey);
        localStorage.removeItem('color-notes-unlocked-user');
        sessionStorage.removeItem('color-notes-unlocked-user'); sessionStorage.removeItem('color-notes-unlocked-key');
      }
    };
    void restore().finally(() => setBooting(false));
  }, [pullFromCloud]);

  const notesChanged = React.useCallback((notes: VaultPayload['notes']) => {
    payloadRef.current = { ...payloadRef.current, notes };
    setSyncStatus(navigator.onLine ? 'saving' : 'offline');
    window.clearTimeout(syncTimer.current);
    syncTimer.current = window.setTimeout(() => void syncNow(), 700);
  }, [syncNow]);
  const deletedForever = React.useCallback((id: string) => { payloadRef.current.tombstones[id] = new Date().toISOString(); }, []);

  const unlock = async (reply: AuthReply, credentials: Awaited<ReturnType<typeof deriveVaultCredentials>>, isNew: boolean) => {
    const key = credentials.key;
    let payload: VaultPayload = { version: 1, notes: [], tombstones: {} };
    let revision = 0;
    if (isNew) { payload.notes = await loadNotes(); await replaceAllNotes([]); }
    else {
      const response = await fetchWithSession('/api/vault');
      const data = response.ok ? await response.json() as { vault: EncryptedVault | null } : { vault: null };
      const local = await loadLocalVault(reply.usernameKey);
      const localPayload = local ? await decryptVault(local, key) : null;
      const remotePayload = data.vault ? await decryptVault({ ...data.vault, revision: Number(data.vault.revision) }, key) : null;
      payload = localPayload && remotePayload ? mergeVaults(localPayload, remotePayload) : localPayload ?? remotePayload ?? payload;
      revision = data.vault ? Number(data.vault.revision) : 0;
    }
    keyRef.current = key; verifierRef.current = credentials.verifier; payloadRef.current = payload; revisionRef.current = revision;
    localStorage.setItem('color-notes-unlocked-user', reply.usernameKey);
    localStorage.setItem('color-notes-last-user', reply.username);
    await rememberVaultSession(reply.usernameKey, key, credentials.verifier);
    const encrypted = await encryptVault(payload, key, revision);
    await saveLocalVault({ ...encrypted, username: reply.username, usernameKey: reply.usernameKey, encryptionSalt: reply.encryptionSalt });
    const next = { username: reply.username, usernameKey: reply.usernameKey, encryptionSalt: reply.encryptionSalt, notes: payload.notes, tombstones: payload.tombstones, refresh: 0 };
    setAccount(next); accountRef.current = next; await syncNow();
  };

  const offlineUnlock = async (username: string, password: string) => {
    const usernameKey = username.trim().toLowerCase();
    const local = await loadLocalVault(usernameKey);
    if (!local) throw new Error('This account has not been unlocked on this device yet. Connect once to sign in.');
    const credentials = await deriveVaultCredentials(password, local.encryptionSalt);
    const key = credentials.key;
    let payload: VaultPayload;
    try { payload = await decryptVault(local, key); } catch { throw new Error('Username or password is incorrect.'); }
    keyRef.current = key; verifierRef.current = credentials.verifier; payloadRef.current = payload; revisionRef.current = local.revision;
    localStorage.setItem('color-notes-unlocked-user', usernameKey);
    await rememberVaultSession(usernameKey, key, credentials.verifier);
    const next = { username: local.username, usernameKey, encryptionSalt: local.encryptionSalt, notes: payload.notes, tombstones: payload.tombstones, refresh: 0 };
    accountRef.current = next; setAccount(next); setSyncStatus('offline');
  };

  const signOut = React.useCallback(() => {
    window.clearTimeout(syncTimer.current);
    const usernameKey = accountRef.current?.usernameKey;
    void syncNow().finally(() => fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'logout' }) }).catch(() => undefined));
    if (usernameKey) void forgetVaultSession(usernameKey);
    localStorage.removeItem('color-notes-unlocked-user');
    sessionStorage.removeItem('color-notes-unlocked-user'); sessionStorage.removeItem('color-notes-unlocked-key');
    keyRef.current = null; verifierRef.current = null; accountRef.current = null; setAccount(null);
  }, [syncNow]);

  React.useEffect(() => {
    const online = () => void pullFromCloud(true);
    const offline = () => setSyncStatus('offline');
    const visible = () => { if (document.visibilityState === 'visible') void pullFromCloud(); };
    const focused = () => void pullFromCloud();
    const interval = window.setInterval(() => { if (document.visibilityState === 'visible') void pullFromCloud(); }, 4_000);
    window.addEventListener('online', online); window.addEventListener('offline', offline);
    window.addEventListener('focus', focused); document.addEventListener('visibilitychange', visible);
    return () => { window.clearInterval(interval); window.removeEventListener('online', online); window.removeEventListener('offline', offline); window.removeEventListener('focus', focused); document.removeEventListener('visibilitychange', visible); };
  }, [pullFromCloud]);

  if (booting) return <div className="auth-shell"><div className="auth-loading"><span className="brand-mark"><i /><i /><i /></span><p>Opening your private vault…</p></div></div>;
  if (!account) return <AuthScreen onAuthenticated={unlock} onOfflineUnlock={offlineUnlock} />;
  return <NotesApp initialNotes={account.notes} tombstones={account.tombstones} username={account.username} syncStatus={syncStatus} onNotesChange={notesChanged} onDeleteForever={deletedForever} onSignOut={signOut} />;
}

function AuthScreen({ onAuthenticated, onOfflineUnlock }: { onAuthenticated: (reply: AuthReply, credentials: Awaited<ReturnType<typeof deriveVaultCredentials>>, isNew: boolean) => Promise<void>; onOfflineUnlock: (username: string, password: string) => Promise<void> }) {
  const [mode, setMode] = React.useState<'login' | 'signup'>('login');
  const [username, setUsername] = React.useState(() => localStorage.getItem('color-notes-last-user') ?? '');
  const [password, setPassword] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [show, setShow] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const submit = async (event: React.SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault(); setError('');
    if (mode === 'signup' && password !== confirm) return setError('The passwords do not match.');
    setBusy(true);
    try {
      if (!navigator.onLine) { if (mode === 'signup') throw new Error('Connect once to create an account.'); await onOfflineUnlock(username, password); return; }
      let encryptionSalt: string;
      if (mode === 'signup') encryptionSalt = createEncryptionSalt();
      else {
        const challengeResponse = await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'challenge', username }) });
        const challenge = await challengeResponse.json() as { encryptionSalt?: string; error?: string };
        if (!challengeResponse.ok || !challenge.encryptionSalt) throw new Error(challenge.error || 'Username or password is incorrect.');
        encryptionSalt = challenge.encryptionSalt;
      }
      const credentials = await deriveVaultCredentials(password, encryptionSalt);
      const response = await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: mode, username, verifier: credentials.verifier, encryptionSalt: mode === 'signup' ? encryptionSalt : undefined }) });
      const data = await response.json() as AuthReply;
      if (!response.ok) throw new Error(data.error || 'Could not sign in.');
      await onAuthenticated(data, credentials, mode === 'signup');
    } catch (reason) {
      if (mode === 'login') {
        try { await onOfflineUnlock(username, password); return; } catch { /* show the original online error */ }
      }
      setError(reason instanceof Error ? reason.message : 'Could not open your vault.');
    }
    finally { setBusy(false); }
  };
  const offline = typeof navigator !== 'undefined' && !navigator.onLine;
  return <main className="auth-shell"><section className="auth-card"><div className="auth-brand"><span className="brand-mark"><i /><i /><i /></span><div><strong>Color Notes</strong><small>Your quiet corner, everywhere.</small></div></div><div className="auth-copy"><span className="auth-icon"><LockKeyhole /></span><p className="auth-kicker">PRIVATE BY DESIGN</p><h1>{mode === 'login' ? 'Open your notes' : 'Create your private vault'}</h1><p>Your notes are encrypted on this device before they sync. Use the same username and password on any device.</p></div><div className="auth-tabs"><button className={mode === 'login' ? 'is-active' : ''} onClick={() => { setMode('login'); setError(''); }}>Sign in</button><button className={mode === 'signup' ? 'is-active' : ''} onClick={() => { setMode('signup'); setError(''); }}>Create account</button></div><form onSubmit={submit}><label htmlFor="auth-username">Username<Input id="auth-username" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="3–24 letters, numbers, or _" required /></label><label htmlFor="auth-password">Password<div className="password-field"><Input id="auth-password" type={show ? 'text' : 'password'} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} maxLength={128} placeholder="At least 8 characters" required /><button type="button" onClick={() => setShow((value) => !value)} aria-label={show ? 'Hide password' : 'Show password'}>{show ? <EyeOff /> : <Eye />}</button></div></label>{mode === 'signup' && <label htmlFor="auth-confirm">Confirm password<Input id="auth-confirm" type={show ? 'text' : 'password'} autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} minLength={8} required /></label>}{mode === 'signup' && <div className="password-warning"><AlertTriangle /><p><strong>There is no password reset.</strong> If you forget your password, nobody—not even us—can recover your notes. Save it somewhere safe.</p></div>}{error && <p className="auth-error" role="alert">{error}</p>}<Button type="submit" size="lg" disabled={busy}>{busy ? 'Opening vault…' : mode === 'login' ? 'Open my notes' : 'Create my vault'}</Button></form><div className="auth-trust"><ShieldCheck /><span><strong>Stay signed in on this device</strong><small>Your password is never stored. Sign out whenever you want to lock it.</small></span></div>{offline && <div className="offline-auth"><CloudOff />You are offline. Sign in to an account previously opened on this device.</div>}</section></main>;
}
