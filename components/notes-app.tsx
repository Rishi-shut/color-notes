'use client';

import * as React from 'react';
import { Archive, Bell, Check, CheckSquare2, ChevronDown, Cloud, CloudOff, Download, FileText, Heart, Import, Laptop, ListFilter, Menu, Moon, MoreHorizontal, Pin, Plus, Redo2, Search, Settings, Star, Sun, Trash2, WifiOff, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { loadNotes, permanentlyDeleteNote, replaceAllNotes, saveNote } from '@/lib/notes-db';
import { createNote, isNoteEmpty, NOTE_COLORS, type Note, type NoteColor, type NoteKind, type NoteSection, type NoteSort } from '@/lib/note-types';

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };
type ToolDefinition = { name: string; title?: string; description: string; inputSchema: object; annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean }; execute: (input: unknown) => unknown | Promise<unknown> };
declare global { interface Document { modelContext?: { registerTool: (tool: ToolDefinition, options?: { signal?: AbortSignal }) => void | Promise<void> } } }

const publicAsset = (name: string) => new URL(name.replace(/^\//, ''), document.baseURI).pathname;

const navItems: { section: NoteSection; label: string; icon: React.ReactNode }[] = [
  { section: 'all', label: 'All notes', icon: <FileText /> }, { section: 'favorites', label: 'Favorites', icon: <Star /> },
  { section: 'reminders', label: 'Reminders', icon: <Bell /> }, { section: 'archive', label: 'Archive', icon: <Archive /> },
  { section: 'trash', label: 'Trash', icon: <Trash2 /> },
];

export function NotesApp() {
  const [notes, setNotes] = React.useState<Note[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [section, setSection] = React.useState<NoteSection>('all');
  const [sort, setSort] = React.useState<NoteSort>('updated');
  const [search, setSearch] = React.useState('');
  const [colorFilter, setColorFilter] = React.useState<NoteColor | null>(null);
  const [editing, setEditing] = React.useState<Note | null>(null);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [dark, setDark] = React.useState(false);
  const [online, setOnline] = React.useState(true);
  const [notice, setNotice] = React.useState('');
  const [installPrompt, setInstallPrompt] = React.useState<InstallPromptEvent | null>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const notesRef = React.useRef(notes);
  notesRef.current = notes;

  const announce = React.useCallback((message: string) => { setNotice(message); window.setTimeout(() => setNotice(''), 2600); }, []);

  React.useEffect(() => {
    const savedTheme = localStorage.getItem('color-notes-theme');
    setDark(savedTheme === 'dark' || (!savedTheme && matchMedia('(prefers-color-scheme: dark)').matches));
    setSort((localStorage.getItem('color-notes-sort') as NoteSort) || 'updated');
    setOnline(navigator.onLine);
    loadNotes().then(setNotes).catch(() => announce('Offline storage could not be opened.')).finally(() => setLoading(false));
    if ('serviceWorker' in navigator) navigator.serviceWorker.register(publicAsset('sw.js')).catch(() => undefined);
  }, [announce]);

  React.useEffect(() => { document.documentElement.classList.toggle('dark', dark); localStorage.setItem('color-notes-theme', dark ? 'dark' : 'light'); }, [dark]);
  React.useEffect(() => { localStorage.setItem('color-notes-sort', sort); }, [sort]);
  React.useEffect(() => {
    const onOnline = () => setOnline(true), onOffline = () => setOnline(false);
    const onInstall = (event: Event) => { event.preventDefault(); setInstallPrompt(event as InstallPromptEvent); };
    window.addEventListener('online', onOnline); window.addEventListener('offline', onOffline); window.addEventListener('beforeinstallprompt', onInstall);
    return () => { window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); window.removeEventListener('beforeinstallprompt', onInstall); };
  }, []);

  const storeNote = React.useCallback(async (note: Note, message?: string) => {
    setNotes((current) => current.some((item) => item.id === note.id) ? current.map((item) => item.id === note.id ? note : item) : [note, ...current]);
    await saveNote(note); if (message) announce(message);
  }, [announce]);

  React.useEffect(() => {
    if (!editing || isNoteEmpty(editing)) return;
    const timeout = window.setTimeout(() => void storeNote({ ...editing, updatedAt: new Date().toISOString() }), 450);
    return () => window.clearTimeout(timeout);
  }, [editing, storeNote]);

  const createNew = React.useCallback((kind: NoteKind = 'text') => { setEditing(createNote(kind)); setMobileOpen(false); }, []);
  const closeEditor = React.useCallback(async () => {
    if (!editing) return;
    if (isNoteEmpty(editing)) {
      if (notesRef.current.some((note) => note.id === editing.id)) { setNotes((current) => current.filter((note) => note.id !== editing.id)); await permanentlyDeleteNote(editing.id); }
    } else await storeNote({ ...editing, updatedAt: new Date().toISOString() });
    setEditing(null);
  }, [editing, storeNote]);
  const patchNote = React.useCallback(async (note: Note, patch: Partial<Note>, message?: string) => storeNote({ ...note, ...patch, updatedAt: new Date().toISOString() }, message), [storeNote]);
  const deleteForever = React.useCallback(async (note: Note) => {
    if (!window.confirm(`Delete “${note.title || 'Untitled note'}” forever? This cannot be undone.`)) return;
    setNotes((current) => current.filter((item) => item.id !== note.id)); await permanentlyDeleteNote(note.id); announce('Note deleted forever.');
  }, [announce]);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); searchRef.current?.focus(); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'n') { event.preventDefault(); createNew(event.shiftKey ? 'checklist' : 'text'); }
    };
    window.addEventListener('keydown', onKeyDown); return () => window.removeEventListener('keydown', onKeyDown);
  }, [createNew]);

  React.useEffect(() => {
    const check = () => notesRef.current.filter((note) => note.reminderAt && new Date(note.reminderAt) <= new Date() && !note.deletedAt).forEach((note) => {
      const key = `reminded-${note.id}-${note.reminderAt}`; if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, '1');
      if (Notification.permission === 'granted') new Notification(note.title || 'Color Notes reminder', { body: note.body.slice(0, 120), icon: publicAsset('icon-192.svg') });
      announce(`Reminder: ${note.title || 'Untitled note'}`);
    });
    check(); const interval = window.setInterval(check, 30_000); return () => window.clearInterval(interval);
  }, [announce]);

  React.useEffect(() => {
    const context = document.modelContext; if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    void Promise.all([
      context.registerTool({ name: 'create_note', title: 'Create a Color Note', description: 'Create and save a text note or checklist in the visible Color Notes workspace.', inputSchema: { type: 'object', properties: { title: { type: 'string' }, body: { type: 'string' }, kind: { enum: ['text', 'checklist'] }, color: { enum: NOTE_COLORS.map((color) => color.value) } }, required: ['title'], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, async execute(input) {
        if (!input || typeof input !== 'object') throw new Error('A note object is required.'); const value = input as Record<string, unknown>;
        if (typeof value.title !== 'string' || !value.title.trim()) throw new Error('title must be a non-empty string.');
        const kind: NoteKind = value.kind === 'checklist' ? 'checklist' : 'text'; const color = NOTE_COLORS.some((item) => item.value === value.color) ? value.color as NoteColor : 'butter'; const note = createNote(kind, color);
        note.title = value.title.trim(); note.body = typeof value.body === 'string' ? value.body : '';
        if (kind === 'checklist' && note.body) note.checklist = note.body.split('\n').filter(Boolean).map((text) => ({ id: crypto.randomUUID(), text, done: false }));
        await storeNote(note); return { id: note.id, title: note.title, saved: true };
      } }, { signal: lifecycle.signal }),
      context.registerTool({ name: 'search_notes', title: 'Search Color Notes', description: 'Search saved notes on this device and return matching titles and ids.', inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'], additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: true }, execute(input) {
        const query = typeof input === 'object' && input && typeof (input as { query?: unknown }).query === 'string' ? (input as { query: string }).query.trim().toLowerCase() : '';
        if (!query) throw new Error('query must be a non-empty string.'); return notesRef.current.filter((note) => searchableText(note).includes(query) && !note.deletedAt).slice(0, 20).map((note) => ({ id: note.id, title: note.title || 'Untitled note', kind: note.kind }));
      } }, { signal: lifecycle.signal }),
    ]).catch(() => undefined);
    return () => lifecycle.abort();
  }, [storeNote]);

  const filtered = React.useMemo(() => notes.filter((note) => {
    if (section === 'all' && (note.archived || note.deletedAt)) return false;
    if (section === 'favorites' && (!note.favorite || note.archived || note.deletedAt)) return false;
    if (section === 'reminders' && (!note.reminderAt || note.archived || note.deletedAt)) return false;
    if (section === 'archive' && (!note.archived || note.deletedAt)) return false;
    if (section === 'trash' && !note.deletedAt) return false;
    if (colorFilter && note.color !== colorFilter) return false;
    return !search.trim() || searchableText(note).includes(search.trim().toLowerCase());
  }).sort((a, b) => {
    if (a.pinned !== b.pinned && section !== 'trash') return a.pinned ? -1 : 1;
    if (sort === 'title') return (a.title || 'Untitled').localeCompare(b.title || 'Untitled');
    if (sort === 'created') return b.createdAt.localeCompare(a.createdAt);
    if (sort === 'color') return a.color.localeCompare(b.color);
    return b.updatedAt.localeCompare(a.updatedAt);
  }), [notes, section, search, colorFilter, sort]);

  const counts = React.useMemo(() => ({ all: notes.filter((n) => !n.archived && !n.deletedAt).length, favorites: notes.filter((n) => n.favorite && !n.archived && !n.deletedAt).length, reminders: notes.filter((n) => n.reminderAt && !n.archived && !n.deletedAt).length, archive: notes.filter((n) => n.archived && !n.deletedAt).length, trash: notes.filter((n) => n.deletedAt).length }), [notes]);
  const selectSection = (next: NoteSection) => { setSection(next); setColorFilter(null); setMobileOpen(false); };
  const exportNotes = () => { const blob = new Blob([JSON.stringify({ format: 'color-notes', version: 1, exportedAt: new Date().toISOString(), notes }, null, 2)], { type: 'application/json' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `color-notes-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(link.href); announce('Backup exported.'); };
  const importNotes = async (file: File) => { try { const parsed = JSON.parse(await file.text()) as { format?: string; version?: number; notes?: Note[] }; if (parsed.format !== 'color-notes' || parsed.version !== 1 || !Array.isArray(parsed.notes)) throw new Error(); const valid = parsed.notes.filter(isValidNote); const merged = new Map(notes.map((note) => [note.id, note])); for (const note of valid) { const current = merged.get(note.id); if (!current || note.updatedAt > current.updatedAt) merged.set(note.id, note); } const next = [...merged.values()]; await replaceAllNotes(next); setNotes(next); announce(`${valid.length} notes imported.`); } catch { announce('That backup file is not valid.'); } };
  const installApp = async () => { if (!installPrompt) { announce('Use your browser menu and choose “Install app”.'); return; } await installPrompt.prompt(); const result = await installPrompt.userChoice; if (result.outcome === 'accepted') setInstallPrompt(null); };

  return <main className="app-shell">
    <Sidebar section={section} counts={counts} colorFilter={colorFilter} online={online} onSection={selectSection} onColor={setColorFilter} onSettings={() => setSettingsOpen(true)} />
    <section className="workspace"><header className="workspace-header"><div className="mobile-brand"><button onClick={() => setMobileOpen(true)} aria-label="Open menu"><Menu /></button><BrandMark /><span>Color Notes</span></div><label className="search-box"><Search /><input ref={searchRef} value={search} onChange={(e) => setSearch(e.target.value)} type="search" placeholder="Search anything…" aria-label="Search notes" /><kbd>Ctrl K</kbd></label><div className="header-actions"><Button variant="ghost" size="icon" onClick={() => setDark((v) => !v)} aria-label={dark ? 'Use light theme' : 'Use dark theme'}>{dark ? <Sun /> : <Moon />}</Button><NewNoteMenu onCreate={createNew} /></div></header>
      <div className="content-wrap"><div className="intro-row"><div><p className="eyebrow"><span>{online ? <Cloud /> : <CloudOff />}</span>{online ? 'SAVED LOCALLY · ONLINE' : 'SAVED LOCALLY · OFFLINE'}</p><h1>{sectionTitle(section)}</h1><p>{sectionSubtitle(section, filtered.length)}</p></div><SortMenu value={sort} onChange={setSort} /></div>{colorFilter && <button className="active-filter" onClick={() => setColorFilter(null)}><span className={`dot dot-${colorFilter}`} />{NOTE_COLORS.find((item) => item.value === colorFilter)?.label}<X /></button>}{loading ? <LoadingGrid /> : filtered.length ? <NotesGrid notes={filtered} section={section} onOpen={(note) => setEditing({ ...note, checklist: note.checklist.map((item) => ({ ...item })) })} onPatch={patchNote} onDelete={deleteForever} /> : <EmptyState section={section} search={search} onCreate={() => createNew('text')} />}</div>
      <button className="floating-compose" onClick={() => createNew('text')} aria-label="Create a new note"><Plus /></button>
    </section>
    <Sheet open={mobileOpen} onOpenChange={setMobileOpen}><SheetContent side="left" className="mobile-sheet"><SheetHeader><SheetTitle>Color Notes</SheetTitle><SheetDescription>Your quiet corner, online or off.</SheetDescription></SheetHeader><SidebarContent section={section} counts={counts} colorFilter={colorFilter} online={online} onSection={selectSection} onColor={setColorFilter} onSettings={() => { setMobileOpen(false); setSettingsOpen(true); }} /></SheetContent></Sheet>
    <Editor note={editing} onChange={setEditing} onClose={() => void closeEditor()} />
    <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} dark={dark} onTheme={setDark} online={online} installAvailable={Boolean(installPrompt)} onInstall={() => void installApp()} onExport={exportNotes} onImport={() => fileRef.current?.click()} />
    <input ref={fileRef} className="sr-only" type="file" accept="application/json,.json" onChange={(e) => { const file = e.target.files?.[0]; if (file) void importNotes(file); e.target.value = ''; }} /><output className={`app-notice ${notice ? 'is-visible' : ''}`} aria-live="polite">{notice}</output>
  </main>;
}

function BrandMark() { return <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>; }
type SidebarProps = { section: NoteSection; counts: Record<NoteSection, number>; colorFilter: NoteColor | null; online: boolean; onSection: (section: NoteSection) => void; onColor: (color: NoteColor | null) => void; onSettings: () => void };
function Sidebar(props: SidebarProps) { return <aside className="sidebar"><div className="brand-row"><BrandMark /><div><p className="brand-name">Color Notes</p><p className="brand-caption">Your quiet corner</p></div></div><SidebarContent {...props} /></aside>; }
function SidebarContent({ section, counts, colorFilter, online, onSection, onColor, onSettings }: SidebarProps) { return <><nav className="primary-nav" aria-label="Notes">{navItems.map((item) => <button key={item.section} className={`nav-item ${section === item.section ? 'is-active' : ''}`} onClick={() => onSection(item.section)}>{item.icon}<span>{item.label}</span><small>{counts[item.section]}</small></button>)}</nav><p className="sidebar-label">COLORS</p><div className="color-list">{NOTE_COLORS.slice(0, 5).map((color) => <button key={color.value} className={colorFilter === color.value ? 'is-active' : ''} onClick={() => onColor(colorFilter === color.value ? null : color.value)}><i className={`dot dot-${color.value}`} />{color.label}</button>)}</div><div className="offline-card"><span className="offline-icon">{online ? <Laptop /> : <WifiOff />}</span><div><strong>Works offline</strong><p>{online ? 'Ready for any connection' : 'All features available'}</p></div><i className="status-dot" /></div><button className="settings-link" onClick={onSettings}><Settings /> Settings</button></>; }
function NewNoteMenu({ onCreate }: { onCreate: (kind: NoteKind) => void }) { return <DropdownMenu><DropdownMenuTrigger render={<Button className="new-note-button" size="lg" />}><Plus />New note<ChevronDown /></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-44"><DropdownMenuItem onClick={() => onCreate('text')}><FileText />Text note</DropdownMenuItem><DropdownMenuItem onClick={() => onCreate('checklist')}><CheckSquare2 />Checklist</DropdownMenuItem></DropdownMenuContent></DropdownMenu>; }
function SortMenu({ value, onChange }: { value: NoteSort; onChange: (sort: NoteSort) => void }) { return <DropdownMenu><DropdownMenuTrigger render={<Button variant="outline" className="sort-button" />}><ListFilter />Sort<ChevronDown /></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuLabel>Sort notes by</DropdownMenuLabel><DropdownMenuRadioGroup value={value} onValueChange={(next) => onChange(next as NoteSort)}><DropdownMenuRadioItem value="updated">Recently edited</DropdownMenuRadioItem><DropdownMenuRadioItem value="created">Recently created</DropdownMenuRadioItem><DropdownMenuRadioItem value="title">Title A–Z</DropdownMenuRadioItem><DropdownMenuRadioItem value="color">Note color</DropdownMenuRadioItem></DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu>; }

function NotesGrid({ notes, section, onOpen, onPatch, onDelete }: { notes: Note[]; section: NoteSection; onOpen: (note: Note) => void; onPatch: (note: Note, patch: Partial<Note>, message?: string) => void; onDelete: (note: Note) => void }) { const pinned = section !== 'trash' ? notes.filter((note) => note.pinned) : []; const rest = section !== 'trash' ? notes.filter((note) => !note.pinned) : notes; return <>{pinned.length > 0 && <><SectionHeading icon={<Pin />} title="Pinned" count={`${pinned.length} ${pinned.length === 1 ? 'note' : 'notes'}`} /><div className="notes-grid pinned-grid">{pinned.map((note) => <NoteCard key={note.id} note={note} section={section} onOpen={onOpen} onPatch={onPatch} onDelete={onDelete} />)}</div></>}{rest.length > 0 && <><div className={pinned.length ? 'all-heading' : ''}><SectionHeading icon={<FileText />} title={pinned.length ? 'All notes' : sectionTitle(section)} count={`${rest.length} ${rest.length === 1 ? 'note' : 'notes'}`} /></div><div className="notes-grid">{rest.map((note) => <NoteCard key={note.id} note={note} section={section} onOpen={onOpen} onPatch={onPatch} onDelete={onDelete} />)}</div></>}</>; }
function SectionHeading({ icon, title, count }: { icon: React.ReactNode; title: string; count: string }) { return <div className="section-heading"><div>{icon}<h2>{title}</h2></div><span>{count}</span></div>; }
function NoteCard({ note, section, onOpen, onPatch, onDelete }: { note: Note; section: NoteSection; onOpen: (note: Note) => void; onPatch: (note: Note, patch: Partial<Note>, message?: string) => void; onDelete: (note: Note) => void }) { return <article className={`note-card note-${note.color}`} onClick={() => section !== 'trash' && onOpen(note)} tabIndex={section === 'trash' ? -1 : 0} onKeyDown={(e) => { if (e.key === 'Enter' && section !== 'trash') onOpen(note); }}><div className="note-topline"><span className="note-type">{note.kind === 'checklist' ? <CheckSquare2 /> : <FileText />}</span><DropdownMenu><DropdownMenuTrigger onClick={(e) => e.stopPropagation()} render={<button className="note-menu" aria-label={`More options for ${note.title || 'Untitled note'}`} />}><MoreHorizontal /></DropdownMenuTrigger><DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>{section === 'trash' ? <><DropdownMenuItem onClick={() => void onPatch(note, { deletedAt: null }, 'Note restored.')}><Redo2 />Restore</DropdownMenuItem><DropdownMenuItem variant="destructive" onClick={() => onDelete(note)}><Trash2 />Delete forever</DropdownMenuItem></> : <><DropdownMenuItem onClick={() => void onPatch(note, { pinned: !note.pinned }, note.pinned ? 'Unpinned.' : 'Pinned.')}><Pin />{note.pinned ? 'Unpin' : 'Pin'}</DropdownMenuItem><DropdownMenuItem onClick={() => void onPatch(note, { favorite: !note.favorite })}><Heart />{note.favorite ? 'Remove favorite' : 'Favorite'}</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem onClick={() => void onPatch(note, { archived: !note.archived }, note.archived ? 'Moved to notes.' : 'Archived.')}><Archive />{note.archived ? 'Move to notes' : 'Archive'}</DropdownMenuItem><DropdownMenuItem variant="destructive" onClick={() => void onPatch(note, { deletedAt: new Date().toISOString(), archived: false }, 'Moved to trash.')}><Trash2 />Move to trash</DropdownMenuItem></>}</DropdownMenuContent></DropdownMenu></div><h3>{note.title || 'Untitled note'}</h3>{note.kind === 'text' ? <p className="note-body">{note.body || 'Empty note'}</p> : <ul>{note.checklist.slice(0, 5).map((item) => <li key={item.id} className={item.done ? 'is-done' : ''}><span>{item.done ? '✓' : ''}</span>{item.text || 'New item'}</li>)}</ul>}<footer><small>{formatTime(note.updatedAt)}</small><span className="card-flags">{note.reminderAt && <Bell />}{note.favorite && <Heart className="heart" />}{note.pinned && <Pin />}</span></footer></article>; }

function Editor({ note, onChange, onClose }: { note: Note | null; onChange: (note: Note | null) => void; onClose: () => void }) {
  if (!note) return <Dialog open={false} />; const patch = (change: Partial<Note>) => onChange({ ...note, ...change });
  const changeKind = (kind: NoteKind) => patch({ kind, checklist: kind === 'checklist' && note.checklist.length === 0 ? [{ id: crypto.randomUUID(), text: '', done: false }] : note.checklist });
  const setReminder = (value: string) => { patch({ reminderAt: value ? new Date(value).toISOString() : null }); if (value && Notification.permission === 'default') void Notification.requestPermission(); };
  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}><DialogContent className={`editor-dialog note-${note.color}`} showCloseButton={false}><DialogHeader className="editor-header"><div className="editor-type-toggle"><button className={note.kind === 'text' ? 'is-active' : ''} onClick={() => changeKind('text')}><FileText />Note</button><button className={note.kind === 'checklist' ? 'is-active' : ''} onClick={() => changeKind('checklist')}><CheckSquare2 />Checklist</button></div><div className="editor-actions"><Button variant="ghost" size="icon-sm" onClick={() => patch({ favorite: !note.favorite })} aria-label="Favorite"><Heart className={note.favorite ? 'is-filled' : ''} /></Button><Button variant="ghost" size="icon-sm" onClick={() => patch({ pinned: !note.pinned })} aria-label="Pin"><Pin className={note.pinned ? 'is-filled' : ''} /></Button><Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close"><X /></Button></div><DialogTitle className="sr-only">Edit note</DialogTitle><DialogDescription className="sr-only">Changes save automatically.</DialogDescription></DialogHeader><div className="editor-body"><input autoFocus className="editor-title" value={note.title} onChange={(e) => patch({ title: e.target.value })} placeholder="Note title" aria-label="Note title" />{note.kind === 'text' ? <Textarea className="editor-textarea" value={note.body} onChange={(e) => patch({ body: e.target.value })} placeholder="Start writing…" aria-label="Note body" /> : <div className="checklist-editor">{note.checklist.map((item) => <div key={item.id} className="checklist-row"><Checkbox checked={item.done} onCheckedChange={(done) => patch({ checklist: note.checklist.map((entry) => entry.id === item.id ? { ...entry, done: Boolean(done) } : entry) })} /><Input value={item.text} onChange={(e) => patch({ checklist: note.checklist.map((entry) => entry.id === item.id ? { ...entry, text: e.target.value } : entry) })} placeholder="List item" /><Button variant="ghost" size="icon-sm" onClick={() => patch({ checklist: note.checklist.filter((entry) => entry.id !== item.id) })} aria-label="Remove item"><X /></Button></div>)}<button className="add-check-item" onClick={() => patch({ checklist: [...note.checklist, { id: crypto.randomUUID(), text: '', done: false }] })}><Plus />Add item</button></div>}</div><div className="editor-footer"><div className="color-picker">{NOTE_COLORS.map((color) => <button key={color.value} className={note.color === color.value ? 'is-active' : ''} style={{ background: color.hex }} onClick={() => patch({ color: color.value })} aria-label={color.label} />)}</div><label className="reminder-field"><Bell /><input type="datetime-local" value={note.reminderAt ? toLocalInput(note.reminderAt) : ''} min={toLocalInput(new Date().toISOString())} onChange={(e) => setReminder(e.target.value)} aria-label="Reminder time" /></label><span className="saved-label"><Check />Saved locally</span><Button onClick={onClose}>Done</Button></div></DialogContent></Dialog>;
}

function SettingsDialog({ open, onOpenChange, dark, onTheme, online, installAvailable, onInstall, onExport, onImport }: { open: boolean; onOpenChange: (open: boolean) => void; dark: boolean; onTheme: (dark: boolean) => void; online: boolean; installAvailable: boolean; onInstall: () => void; onExport: () => void; onImport: () => void }) { return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="settings-dialog"><DialogHeader><DialogTitle>Settings</DialogTitle><DialogDescription>Make Color Notes feel at home on this device.</DialogDescription></DialogHeader><div className="settings-list"><Setting icon={dark ? <Moon /> : <Sun />} title="Appearance" copy="Use a calm light or dark workspace."><Button variant="outline" onClick={() => onTheme(!dark)}>{dark ? 'Use light' : 'Use dark'}</Button></Setting><Setting icon={<Download />} title="Install app" copy="Open from your home screen and work offline."><Button variant="outline" onClick={onInstall}>{installAvailable ? 'Install' : 'How to'}</Button></Setting><Setting icon={<CloudOff />} title="Offline status" copy={online ? 'Online now. Everything is also saved locally.' : 'Offline now. All note tools still work.'}><span className="ready-pill">Ready</span></Setting><Setting icon={<Download />} title="Backup" copy="Move your notes safely between devices."><div className="setting-buttons"><Button variant="outline" size="sm" onClick={onExport}>Export</Button><Button variant="outline" size="sm" onClick={onImport}><Import />Import</Button></div></Setting></div></DialogContent></Dialog>; }
function Setting({ icon, title, copy, children }: { icon: React.ReactNode; title: string; copy: string; children: React.ReactNode }) { return <div className="setting-row"><span className="setting-icon">{icon}</span><div><strong>{title}</strong><p>{copy}</p></div>{children}</div>; }
function EmptyState({ section, search, onCreate }: { section: NoteSection; search: string; onCreate: () => void }) { return <div className="empty-state"><span>{search ? <Search /> : section === 'trash' ? <Trash2 /> : <FileText />}</span><h2>{search ? 'No notes found' : section === 'trash' ? 'Trash is empty' : 'A clear page'}</h2><p>{search ? 'Try another word or clear your color filter.' : section === 'trash' ? 'Deleted notes will wait here until you remove them forever.' : 'Capture one small thought and let it grow from there.'}</p>{!search && section !== 'trash' && <Button onClick={onCreate}><Plus />Create a note</Button>}</div>; }
function LoadingGrid() { return <div className="notes-grid" aria-label="Loading notes">{[1,2,3,4,5].map((item) => <div key={item} className="note-skeleton"><i /><i /><i /></div>)}</div>; }
function searchableText(note: Note) { return `${note.title} ${note.body} ${note.checklist.map((item) => item.text).join(' ')}`.toLowerCase(); }
function isValidNote(value: unknown): value is Note { if (!value || typeof value !== 'object') return false; const note = value as Partial<Note>; return typeof note.id === 'string' && (note.kind === 'text' || note.kind === 'checklist') && typeof note.title === 'string' && typeof note.body === 'string' && Array.isArray(note.checklist) && typeof note.updatedAt === 'string'; }
function sectionTitle(section: NoteSection) { return ({ all: 'All notes', favorites: 'Favorites', reminders: 'Reminders', archive: 'Archive', trash: 'Trash' })[section]; }
function sectionSubtitle(section: NoteSection, count: number) { if (section === 'all') return `${count} ${count === 1 ? 'thought' : 'thoughts'}, right where you left them.`; if (section === 'trash') return 'Restore what you need, remove what you do not.'; return `${count} ${count === 1 ? 'note' : 'notes'} in this space.`; }
function formatTime(value: string) { const date = new Date(value), diff = Date.now() - date.getTime(); if (diff < 60_000) return 'Just now'; if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`; if (date.toDateString() === new Date().toDateString()) return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); return date.toLocaleDateString([], { month: 'short', day: 'numeric' }); }
function toLocalInput(value: string) { const date = new Date(value), local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000); return local.toISOString().slice(0, 16); }
