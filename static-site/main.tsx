import React from 'react';
import { createRoot } from 'react-dom/client';
import { AccountGate } from '@/components/account-gate';
import '@/app/globals.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AccountGate />
  </React.StrictMode>,
);
