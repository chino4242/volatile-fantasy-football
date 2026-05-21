'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

type Step = 'paste' | 'review' | 'signals';

interface ExtractedPlayer { name: string; rank: number; position: string; tier?: number; notes?: string; }
interface Signal { sleeper_id: string; signal: string; delta: number; owner_name: string | null; name?: string; position?: string; }

export default function MyRankingsPage() {
  const [step, setStep] = useState<Step>('paste');
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [extracted, setExtracted] = useState<ExtractedPlayer[]>([]);
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [unmatched, setUnmatched] = useState<string[]>([]);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [stats, setStats] = useState<{ buys: number; sells: number; holds: number } | null>(null);
  const [leagues, setLeagues] = useState<any[]>([]);
  const [selectedLeague, setSelectedLeague] = useState<string>('');
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      if (data.user) loadLeagues();
    });
  }, []);

  const loadLeagues = async () => {
    const res = await fetch('/api/leagues/list');
    if (res.ok) { const data = await res.json(); setLeagues(data.leagues || []); }
  };

  const handleExtract = async () => {
    setLoading(true);
    const res = await fetch('/api/rankings/extract', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    const data = await res.json();
    if (data.extracted?.length) {
      setExtracted(data.extracted);
      setSourceId(data.source_id);
      setStep('review');
    }
    setLoading(false);
  };

  const handleSave = async () => {
    setLoading(true);
    const res = await fetch('/api/rankings/save', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source_id: sourceId, rankings: extracted }),
    });
    const data = await res.json();
    setUnmatched(data.unmatched || []);

    // Generate signals
    const sigRes = await fetch('/api/signals/generate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ league_id: selectedLeague || null }),
    });
    const sigData = await sigRes.json();
    setStats({ buys: sigData.buys, sells: sigData.sells, holds: sigData.holds });

    // Fetch signals for display
    const listRes = await fetch('/api/signals/list');
    if (listRes.ok) { const list = await listRes.json(); setSignals(list.signals || []); }

    setStep('signals');
    setLoading(false);
  };

  if (!user) {
    return (
      <div className="max-w-2xl mx-auto p-6 text-center">
        <h1 className="text-xl font-bold mb-2">My Rankings</h1>
        <p className="text-zinc-500 mb-4">Sign in to upload your rankings and see trade signals.</p>
        <a href="/login" className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium">Sign In</a>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-xl font-bold mb-1">My Rankings</h1>
      <p className="text-sm text-zinc-500 mb-6">Paste your rankings → see BUY/SELL signals for your league</p>

      {/* Step 1: Paste */}
      {step === 'paste' && (
        <div className="space-y-4">
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={"Paste your rankings here...\n\nExamples:\n1. Ja'Marr Chase - WR\n2. CeeDee Lamb - WR\n3. Bijan Robinson - RB\n\nOr tier lists:\nTier 1: Chase, Lamb, Robinson\nTier 2: Breece Hall, Amon-Ra St. Brown"}
            rows={12}
            className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4 text-sm font-mono resize-y focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          {leagues.length > 0 && (
            <div>
              <label className="text-xs font-medium text-zinc-500 block mb-1">League (for trade targets)</label>
              <select value={selectedLeague} onChange={e => setSelectedLeague(e.target.value)}
                className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-sm">
                <option value="">No league (signals only)</option>
                {leagues.map((l: any) => <option key={l.id} value={l.id}>{l.league_name}</option>)}
              </select>
            </div>
          )}
          <button onClick={handleExtract} disabled={loading || !text.trim()}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg text-sm transition disabled:opacity-50">
            {loading ? 'Analyzing...' : 'Extract Rankings'}
          </button>
        </div>
      )}

      {/* Step 2: Review */}
      {step === 'review' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-zinc-500">Found {extracted.length} players. Confirm and save:</p>
            <button onClick={() => setStep('paste')} className="text-xs text-indigo-500">← Edit</button>
          </div>
          <div className="max-h-80 overflow-y-auto border border-zinc-200 dark:border-zinc-800 rounded-lg divide-y divide-zinc-100 dark:divide-zinc-800">
            {extracted.map((p, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-2 text-sm">
                <div>
                  <span className="font-medium">{p.name}</span>
                  <span className="text-zinc-500 ml-2">{p.position}</span>
                </div>
                <div className="text-xs text-zinc-500">
                  #{p.rank} {p.tier ? `· T${p.tier}` : ''}
                </div>
              </div>
            ))}
          </div>
          <button onClick={handleSave} disabled={loading}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg text-sm transition disabled:opacity-50">
            {loading ? 'Saving & generating signals...' : `Save ${extracted.length} Rankings → Generate Signals`}
          </button>
        </div>
      )}

      {/* Step 3: Signals */}
      {step === 'signals' && (
        <div className="space-y-4">
          {stats && (
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-lg p-3">
                <div className="text-2xl font-bold text-emerald-600">{stats.buys}</div>
                <div className="text-xs text-emerald-600 font-medium">BUY</div>
              </div>
              <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-3">
                <div className="text-2xl font-bold text-red-600">{stats.sells}</div>
                <div className="text-xs text-red-600 font-medium">SELL</div>
              </div>
              <div className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-3">
                <div className="text-2xl font-bold text-zinc-500">{stats.holds}</div>
                <div className="text-xs text-zinc-500 font-medium">HOLD</div>
              </div>
            </div>
          )}

          {unmatched.length > 0 && (
            <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
              <p className="text-xs font-medium text-amber-700 dark:text-amber-400">Couldn't match: {unmatched.join(', ')}</p>
            </div>
          )}

          <div className="space-y-1">
            {signals.filter(s => s.signal === 'BUY').slice(0, 15).map((s, i) => (
              <div key={i} className="flex items-center justify-between bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900 rounded-lg px-4 py-2">
                <div>
                  <span className="text-sm font-medium">{s.name || s.sleeper_id}</span>
                  <span className="text-xs text-zinc-500 ml-2">{s.position}</span>
                </div>
                <div className="text-right">
                  <span className="text-xs font-bold text-emerald-600">BUY ({Math.abs(s.delta)} spots)</span>
                  {s.owner_name && <div className="text-[10px] text-zinc-500">Owned by {s.owner_name}</div>}
                </div>
              </div>
            ))}
            {signals.filter(s => s.signal === 'SELL').slice(0, 10).map((s, i) => (
              <div key={i} className="flex items-center justify-between bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900 rounded-lg px-4 py-2">
                <div>
                  <span className="text-sm font-medium">{s.name || s.sleeper_id}</span>
                  <span className="text-xs text-zinc-500 ml-2">{s.position}</span>
                </div>
                <div className="text-right">
                  <span className="text-xs font-bold text-red-600">SELL ({Math.abs(s.delta)} spots)</span>
                  {s.owner_name && <div className="text-[10px] text-zinc-500">Owned by {s.owner_name}</div>}
                </div>
              </div>
            ))}
          </div>

          <button onClick={() => { setStep('paste'); setText(''); setExtracted([]); setSignals([]); }}
            className="w-full py-2 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-lg text-sm font-medium">
            Upload New Rankings
          </button>
        </div>
      )}
    </div>
  );
}
