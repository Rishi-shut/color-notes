export type NoteColor = 'butter' | 'mint' | 'lilac' | 'sky' | 'peach' | 'rose' | 'stone';
export type NoteKind = 'text' | 'checklist';
export type NoteSection = 'all' | 'favorites' | 'reminders' | 'archive' | 'trash';
export type NoteSort = 'updated' | 'created' | 'title' | 'color';

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface Note {
  id: string;
  kind: NoteKind;
  title: string;
  body: string;
  checklist: ChecklistItem[];
  color: NoteColor;
  pinned: boolean;
  favorite: boolean;
  archived: boolean;
  deletedAt: string | null;
  reminderAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export const NOTE_COLORS: { value: NoteColor; label: string; hex: string }[] = [
  { value: 'butter', label: 'Butter', hex: '#f5e4a8' },
  { value: 'mint', label: 'Mint', hex: '#dcebd8' },
  { value: 'lilac', label: 'Lilac', hex: '#e8e0ee' },
  { value: 'sky', label: 'Sky', hex: '#dce9ed' },
  { value: 'peach', label: 'Peach', hex: '#f1dfd3' },
  { value: 'rose', label: 'Rose', hex: '#f1dce0' },
  { value: 'stone', label: 'Stone', hex: '#e5e2da' },
];

export function createNote(kind: NoteKind = 'text', color: NoteColor = 'butter'): Note {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    kind,
    title: '',
    body: '',
    checklist: kind === 'checklist' ? [{ id: crypto.randomUUID(), text: '', done: false }] : [],
    color,
    pinned: false,
    favorite: false,
    archived: false,
    deletedAt: null,
    reminderAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function isNoteEmpty(note: Note) {
  return !note.title.trim() && !note.body.trim() && note.checklist.every((item) => !item.text.trim());
}
