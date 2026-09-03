'use client';

import * as React from 'react';
import { AlertTriangle, CloudOff, Eye, EyeOff, LockKeyhole, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NotesApp, type SyncStatus } from '@/components/notes-app';
import { loadNotes, replaceAllNotes } from '@/lib/notes-db';
import { createEncryptionSalt, decryptVault, deriveVaultCredentials, deriveVaultKey, encryptVault, exportVaultKey, importVaultKey, loadLocalVault, mergeVaults, saveLocalVault, type EncryptedVault, type VaultPayload } from '@/lib/secure-vault';

type Account = { username: string; usernameKey: string; encryptionSalt: string; notes: VaultPayload['notes']; refresh: number };
type AuthReply = { username: string; usernameKey: string; encryptionSalt: string; error?: string };

export function AccountGate() {
  const [account, setAccount] = React.useState<Account | null>(null);
  const [booting, setBooting] = React.useState(true);
  const [syncStatus, setSyncStatus] = React.useState<SyncStatus>(() => typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'saved');
  const keyRef = React.useRef<CryptoKey | null>(null);
  const payloadRef = React.useRef<VaultPayload>({ version: 1, notes: [], tombstones: {} });
  const accountRef = React.useRef<Account | null>(null);
  const revisionRef = React.useRef(0);
  const syncTimer = React.useRef<number | undefined>(undefined);

  React.useEffect(() => { accountRef.current = account; }, [account]);
  React.useEffect(() => {
    document.documentElement.dataset.theme = localStorage.getItem('color-notes-app-theme') || 'butter';
    if ('serviceWorker' in navigator) navigator.serviceWorker.register(new URL('sw.js', document.baseURI).pathname, { updateViaCache: 'none' }).catch(() => undefined);
  }, []);
  React.useEffect(() => {
    const restore = async () => {
      try {
        const usernameKey = sessionStorage.getItem('color-notes-unlocked-user');
        const rawKey = sessionStorage.getItem('color-notes-unlocked-key');
        if (!usernameKey || !rawKey) return;
        const local = await loadLocalVault(usernameKey);
        if (!local) return;
        const key = await importVaultKey(rawKey);
        const payload = await decryptVault(local, key);
        keyRef.current = key; payloadRef.current = payload; revisionRef.current = local.revision;
        const restored = { username: local.username, usernameKey, encryptionSalt: local.encryptionSalt, notes: payload.notes, refresh: 0 };
        accountRef.current = restored; setAccount(restored);
        if (navigator.onLine) void refreshFromCloud(key, local.username, usernameKey, local.encryptionSalt, payload, local.revision);
      } catch { sessionStorage.removeItem('color-notes-unlocked-user'); sessionStorage.removeItem('color-notes-unlocked-key'); }
    };
    void restore().finally(() => setBooting(false));
  }, []);

  const refreshFromCloud = async (key: CryptoKey, username: string, usernameKey: string, encryptionSalt: string, localPayload: VaultPayload, localRevision: number) => {
    try {
      const response = await fetch('/api/vault');
      if (!response.ok) return;
      const data = await response.json() as { vault: ({ ciphertext: string; iv: string; revision: number | string } | null) };
      const remote = data.vault;
      if (!remote) { payloadRef.current = localPayload; revisionRef.current = 0; await syncNow(); return; }
      const remoteVault = { ciphertext: remote.ciphertext, iv: remote.iv, revision: Number(remote.revision) };
      const remotePayload = await decryptVault(remoteVault, key);
      const merged = mergeVaults(localPayload, remotePayload);
      payloadRef.current = merged; revisionRef.current = remoteVault.revision;
      const encrypted = await encryptVault(merged, key, remoteVault.revision);
      await saveLocalVault({ ...encrypted, username, usernameKey, encryptionSalt });
      setAccount((current) => current ? { ...current, notes: merged.notes, refresh: current.refresh + 1 } : current);
      if (JSON.stringify(merged) !== JSON.stringify(remotePayload)) await syncNow(); else setSyncStatus('saved');
    } catch { setSyncStatus(navigator.onLine ? 'error' : 'offline'); }
  };

  const syncNow = React.useCallback(async () => {
    const current = accountRef.current;
    const key = keyRef.current;
    if (!current || !key) return;
    const encrypted = await encryptVault(payloadRef.current, key, revisionRef.current);
    await saveLocalVault({ ...encrypted, username: current.username, usernameKey: current.usernameKey, encryptionSalt: current.encryptionSalt });
    if (!navigator.onLine) { setSyncStatus('offline'); return; }
    setSyncStatus('saving');
    try {
      let response = await fetch('/api/vault', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ciphertext: encrypted.ciphertext, iv: encrypted.iv, baseRevision: revisionRef.current }) });
      if (response.status === 409) {
        const conflict = await response.json() as { vault: EncryptedVault & { revision: number | string } };
        const remote = { ...conflict.vault, revision: Number(conflict.vault.revision) };
        const merged = mergeVaults(payloadRef.current, await decryptVault(remote, key));
        payloadRef.current = merged; revisionRef.current = remote.revision;
        const retry = await encryptVault(merged, key, remote.revision);
        response = await fetch('/api/vault', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ciphertext: retry.ciphertext, iv: retry.iv, baseRevision: remote.revision }) });
        if (response.ok) setAccount((value) => value ? { ...value, notes: merged.notes, refresh: value.refresh + 1 } : value);
      }
      if (!response.ok) throw new Error();
      const saved = await response.json() as { revision: number };
      revisionRef.current = Number(saved.revision);
      const cached = await encryptVault(payloadRef.current, key, revisionRef.current);
      await saveLocalVault({ ...cached, username: current.username, usernameKey: current.usernameKey, encryptionSalt: current.encryptionSalt });
      setSyncStatus('saved');
    } catch { setSyncStatus(navigator.onLine ? 'error' : 'offline'); }
  }, []);

  const notesChanged = React.useCallback((notes: VaultPayload['notes']) => {
    payloadRef.current = { ...payloadRef.current, notes };
    setSyncStatus(navigator.onLine ? 'saving' : 'offline');
    window.clearTimeout(syncTimer.current);
    syncTimer.current = window.setTimeout(() => void syncNow(), 700);
  }, [syncNow]);
  const deletedForever = React.useCallback((id: string) => { payloadRef.current.tombstones[id] = new Date().toISOString(); }, []);

  const unlock = async (reply: AuthReply, password: string, isNew: boolean) => {
    const key = await deriveVaultKey(password, reply.encryptionSalt);
    let payload: VaultPayload = { version: 1, notes: [], tombstones: {} };
    let revision = 0;
    if (isNew) { payload.notes = await loadNotes(); await replaceAllNotes([]); }
    else {
      const response = await fetch('/api/vault');
      const data = response.ok ? await response.json() as { vault: EncryptedVault | null } : { vault: null };
      const local = await loadLocalVault(reply.usernameKey);
      const localPayload = local ? await decryptVault(local, key) : null;
      const remotePayload = data.vault ? await decryptVault({ ...data.vault, revision: Number(data.vault.revision) }, key) : null;
      payload = localPayload && remotePayload ? mergeVaults(localPayload, remotePayload) : localPayload ?? remotePayload ?? payload;
      revision = data.vault ? Number(data.vault.revision) : 0;
    }
    keyRef.current = key; payloadRef.current = payload; revisionRef.current = revision;
    sessionStorage.setItem('color-notes-unlocked-user', reply.usernameKey);
    sessionStorage.setItem('color-notes-unlocked-key', await exportVaultKey(key));
    localStorage.setItem('color-notes-last-user', reply.username);
    const encrypted = await encryptVault(payload, key, revision);
    await saveLocalVault({ ...encrypted, username: reply.username, usernameKey: reply.usernameKey, encryptionSalt: reply.encryptionSalt });
    const next = { username: reply.username, usernameKey: reply.usernameKey, encryptionSalt: reply.encryptionSalt, notes: payload.notes, refresh: 0 };
    setAccount(next); accountRef.current = next; await syncNow();
  };

  const offlineUnlock = async (username: string, password: string) => {
    const usernameKey = username.trim().toLowerCase();
    const local = await loadLocalVault(usernameKey);
    if (!local) throw new Error('This account has not been unlocked on this device yet. Connect once to sign in.');
    const key = await deriveVaultKey(password, local.encryptionSalt);
    let payload: VaultPayload;
    try { payload = await decryptVault(local, key); } catch { throw new Error('Username or password is incorrect.'); }
    keyRef.current = key; payloadRef.current = payload; revisionRef.current = local.revision;
    sessionStorage.setItem('color-notes-unlocked-user', usernameKey); sessionStorage.setItem('color-notes-unlocked-key', await exportVaultKey(key));
    const next = { username: local.username, usernameKey, encryptionSalt: local.encryptionSalt, notes: payload.notes, refresh: 0 };
    accountRef.current = next; setAccount(next); setSyncStatus('offline');
  };

  const signOut = React.useCallback(() => {
    window.clearTimeout(syncTimer.current); void syncNow();
    sessionStorage.removeItem('color-notes-unlocked-user'); sessionStorage.removeItem('color-notes-unlocked-key');
    keyRef.current = null; accountRef.current = null; setAccount(null);
    void fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'logout' }) }).catch(() => undefined);
  }, [syncNow]);

  React.useEffect(() => {
    const online = () => void syncNow();
    const offline = () => setSyncStatus('offline');
    window.addEventListener('online', online); window.addEventListener('offline', offline);
    return () => { window.removeEventListener('online', online); window.removeEventListener('offline', offline); };
  }, [syncNow]);

  if (booting) return <div className="auth-shell"><div className="auth-loading"><span className="brand-mark"><i /><i /><i /></span><p>Opening your private vault…</p></div></div>;
  if (!account) return <AuthScreen onAuthenticated={unlock} onOfflineUnlock={offlineUnlock} />;
  return <NotesApp initialNotes={account.notes} username={account.username} syncStatus={syncStatus} onNotesChange={notesChanged} onDeleteForever={deletedForever} onSignOut={signOut} />;
}

function AuthScreen({ onAuthenticated, onOfflineUnlock }: { onAuthenticated: (reply: AuthReply, password: string, isNew: boolean) => Promise<void>; onOfflineUnlock: (username: string, password: string) => Promise<void> }) {
  const [mode, setMode] = React.useState<'login' | 'signup'>('login');
  const [username, setUsername] = React.useState(() => localStorage.getItem('color-notes-last-user') ?? '');
  const [password, setPassword] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [show, setShow] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const submit = async (event: React.FormEvent) => {
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
      await onAuthenticated(data, password, mode === 'signup');
    } catch (reason) {
      if (mode === 'login') {
        try { await onOfflineUnlock(username, password); return; } catch { /* show the original online error */ }
      }
      setError(reason instanceof Error ? reason.message : 'Could not open your vault.');
    }
    finally { setBusy(false); }
  };
  const offline = typeof navigator !== 'undefined' && !navigator.onLine;
  return <main className="auth-shell"><section className="auth-card"><div className="auth-brand"><span className="brand-mark"><i /><i /><i /></span><div><strong>Color Notes</strong><small>Your quiet corner, everywhere.</small></div></div><div className="auth-copy"><span className="auth-icon"><LockKeyhole /></span><p className="auth-kicker">PRIVATE BY DESIGN</p><h1>{mode === 'login' ? 'Open your notes' : 'Create your private vault'}</h1><p>Your notes are encrypted on this device before they sync. Use the same username and password on any device.</p></div><div className="auth-tabs"><button className={mode === 'login' ? 'is-active' : ''} onClick={() => { setMode('login'); setError(''); }}>Sign in</button><button className={mode === 'signup' ? 'is-active' : ''} onClick={() => { setMode('signup'); setError(''); }}>Create account</button></div><form onSubmit={submit}><label>Username<Input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="3–24 letters, numbers, or _" required /></label><label>Password<div className="password-field"><Input type={show ? 'text' : 'password'} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} maxLength={128} placeholder="At least 8 characters" required /><button type="button" onClick={() => setShow((value) => !value)} aria-label={show ? 'Hide password' : 'Show password'}>{show ? <EyeOff /> : <Eye />}</button></div></label>{mode === 'signup' && <label>Confirm password<Input type={show ? 'text' : 'password'} autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} minLength={8} required /></label>}{mode === 'signup' && <div className="password-warning"><AlertTriangle /><p><strong>There is no password reset.</strong> If you forget your password, nobody—not even us—can recover your notes. Save it somewhere safe.</p></div>}{error && <p className="auth-error" role="alert">{error}</p>}<Button type="submit" size="lg" disabled={busy}>{busy ? 'Opening vault…' : mode === 'login' ? 'Open my notes' : 'Create my vault'}</Button></form><div className="auth-trust"><ShieldCheck /><span><strong>Zero-knowledge notes</strong><small>The server stores only encrypted text.</small></span></div>{offline && <div className="offline-auth"><CloudOff />You are offline. Sign in to an account previously opened on this device.</div>}</section></main>;
}
