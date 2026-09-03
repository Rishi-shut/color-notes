export type NoteColor = 'butter' | 'mint' | 'lilac' | 'sky' | 'peach' | 'rose' | 'stone';
export type NoteKind = 'text' | 'checklist' | 'notebook' | 'drawing';
export type NoteSection = 'all' | 'favorites' | 'reminders' | 'trash';
export type NoteSort = 'updated' | 'created' | 'title';
export type AppTheme = 'butter' | 'mint' | 'lilac' | 'sky' | 'peach' | 'rose' | 'stone' | 'midnight';

export interface DrawingPoint { x: number; y: number }
export interface DrawingStroke { id: string; color: string; size: number; erase?: boolean; points: DrawingPoint[] }

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
  drawing: DrawingStroke[];
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
    drawing: [],
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
  return !note.title.trim() && !note.body.trim() && note.checklist.every((item) => !item.text.trim()) && note.drawing.length === 0;
}

export const APP_THEMES: { value: AppTheme; label: string; hex: string; ink: string }[] = [
  { value: 'butter', label: 'Butter', hex: '#f3cf68', ink: '#342d1f' },
  { value: 'mint', label: 'Mint', hex: '#8fbea0', ink: '#1f3328' },
  { value: 'lilac', label: 'Lilac', hex: '#aa9bc7', ink: '#2d2539' },
  { value: 'sky', label: 'Sky', hex: '#82b8cb', ink: '#17313b' },
  { value: 'peach', label: 'Peach', hex: '#dfa482', ink: '#3d251b' },
  { value: 'rose', label: 'Rose', hex: '#ca8f9d', ink: '#3b2027' },
  { value: 'stone', label: 'Stone', hex: '#aaa59b', ink: '#292824' },
  { value: 'midnight', label: 'Midnight', hex: '#34483f', ink: '#f5f2e9' },
];
