import React from 'react';
import { createRoot } from 'react-dom/client';
import { NotesApp } from '@/components/notes-app';
import '@/app/globals.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <NotesApp />
  </React.StrictMode>,
);
