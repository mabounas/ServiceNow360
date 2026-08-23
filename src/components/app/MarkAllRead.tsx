'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function MarkAllRead() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function markAll() {
    setBusy(true);
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" className="btn btn-secondary" onClick={markAll} disabled={busy}>
      Tout marquer comme lu
    </button>
  );
}
