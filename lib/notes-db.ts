import type { Note } from './note-types';

const DATABASE_NAME = 'color-notes';
const DATABASE_VERSION = 1;
const NOTES_STORE = 'notes';
const META_STORE = 'meta';

let databasePromise: Promise<IDBDatabase> | null = null;

function openDatabase() {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(NOTES_STORE)) {
        const notes = database.createObjectStore(NOTES_STORE, { keyPath: 'id' });
        notes.createIndex('updatedAt', 'updatedAt');
        notes.createIndex('deletedAt', 'deletedAt');
      }
      if (!database.objectStoreNames.contains(META_STORE)) database.createObjectStore(META_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open offline storage.'));
  });
  return databasePromise;
}

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Offline storage request failed.'));
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Offline storage transaction failed.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Offline storage transaction was cancelled.'));
  });
}

export async function loadNotes(): Promise<Note[]> {
  const database = await openDatabase();
  const transaction = database.transaction([NOTES_STORE, META_STORE], 'readwrite');
  const notesStore = transaction.objectStore(NOTES_STORE);
  const metaStore = transaction.objectStore(META_STORE);
  const initialized = await requestResult(metaStore.get('initialized'));

  if (!initialized) {
    for (const note of starterNotes()) notesStore.put(note);
    metaStore.put(true, 'initialized');
  }

  const notes = await requestResult(notesStore.getAll() as IDBRequest<Note[]>);
  await transactionDone(transaction);
  return notes;
}

export async function saveNote(note: Note) {
  const database = await openDatabase();
  const transaction = database.transaction(NOTES_STORE, 'readwrite');
  transaction.objectStore(NOTES_STORE).put(note);
  await transactionDone(transaction);
}

export async function saveNotes(notes: Note[]) {
  const database = await openDatabase();
  const transaction = database.transaction(NOTES_STORE, 'readwrite');
  const store = transaction.objectStore(NOTES_STORE);
  for (const note of notes) store.put(note);
  await transactionDone(transaction);
}

export async function permanentlyDeleteNote(id: string) {
  const database = await openDatabase();
  const transaction = database.transaction(NOTES_STORE, 'readwrite');
  transaction.objectStore(NOTES_STORE).delete(id);
  await transactionDone(transaction);
}

export async function replaceAllNotes(notes: Note[]) {
  const database = await openDatabase();
  const transaction = database.transaction(NOTES_STORE, 'readwrite');
  const store = transaction.objectStore(NOTES_STORE);
  store.clear();
  for (const note of notes) store.put(note);
  await transactionDone(transaction);
}

function starterNotes(): Note[] {
  const now = Date.now();
  return [
    {
      id: crypto.randomUUID(), kind: 'text', title: 'Welcome to your quiet corner',
      body: 'This space belongs to you. Everything saves automatically on this device and keeps working without the internet.', checklist: [], drawing: [], color: 'butter',
      pinned: true, favorite: true, archived: false, deletedAt: null, reminderAt: null,
      createdAt: new Date(now - 120_000).toISOString(), updatedAt: new Date(now - 60_000).toISOString(),
    },
    {
      id: crypto.randomUUID(), kind: 'checklist', title: 'Try these', body: '', color: 'mint', pinned: true, favorite: false, archived: false, deletedAt: null, reminderAt: null,
      checklist: [
        { id: crypto.randomUUID(), text: 'Create a colorful note', done: false },
        { id: crypto.randomUUID(), text: 'Pin something important', done: false },
        { id: crypto.randomUUID(), text: 'Install Color Notes', done: false },
      ], drawing: [],
      createdAt: new Date(now - 90_000).toISOString(), updatedAt: new Date(now - 30_000).toISOString(),
    },
    {
      id: crypto.randomUUID(), kind: 'text', title: 'A thought for later',
      body: 'Small notes compound into a life remembered.', checklist: [], drawing: [], color: 'lilac', pinned: false, favorite: false, archived: false, deletedAt: null, reminderAt: null,
      createdAt: new Date(now - 60_000).toISOString(), updatedAt: new Date(now - 20_000).toISOString(),
    },
  ];
}
