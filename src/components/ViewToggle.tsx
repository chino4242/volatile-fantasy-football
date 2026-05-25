'use client';

import { useState, useEffect } from 'react';
import { LayoutGrid, Table } from 'lucide-react';

interface ViewToggleProps {
  storageKey: string;
  onChange: (view: 'table' | 'card') => void;
}

export default function ViewToggle({ storageKey, onChange }: ViewToggleProps) {
  const [view, setView] = useState<'table' | 'card'>('table');

  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved === 'card') { setView('card'); onChange('card'); }
  }, []);

  const toggle = (v: 'table' | 'card') => {
    setView(v);
    localStorage.setItem(storageKey, v);
    onChange(v);
  };

  return (
    <div className="flex bg-zinc-800 rounded-lg p-0.5 border border-zinc-700">
      <button onClick={() => toggle('table')}
        className={`p-1.5 rounded transition ${view === 'table' ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
        title="Table view">
        <Table size={14} />
      </button>
      <button onClick={() => toggle('card')}
        className={`p-1.5 rounded transition ${view === 'card' ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
        title="Card view">
        <LayoutGrid size={14} />
      </button>
    </div>
  );
}
