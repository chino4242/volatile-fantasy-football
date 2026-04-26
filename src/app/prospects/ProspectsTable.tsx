'use client';

import { useState, useMemo } from 'react';

interface Prospect {
    id: string;
    full_name: string;
    position: string;
    college: string | null;
    nfl_team: string | null;
    zap_score: string | null;
    zap_category: string | null;
    breakout_score: string | null;
    draft_capital_delta: string | null;
    height: string | null;
    weight: number | null;
    statistical_comparables: string | null;
    analysis_text: string | null;
    is_year_2: boolean | null;
}

interface Props {
    rookies: Prospect[];
    year2: Prospect[];
}

const CATEGORY_COLORS: Record<string, string> = {
    'LEGENDARY PERFORMER': 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
    'ELITE PRODUCER': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    'WEEKLY STARTER': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    'FLEX PLAY': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    'BENCHWARMER': 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
    'WAIVER WIRE ADD': 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300',
    'DART THROW': 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
};

const DELTA_COLORS: Record<string, string> = {
    'Low Risk': 'text-green-600 dark:text-green-400',
    'Neutral': 'text-zinc-500',
    'High Risk': 'text-red-600 dark:text-red-400',
};

type SortKey = 'zap_score' | 'full_name' | 'position' | 'college' | 'zap_category' | 'breakout_score';

export default function ProspectsTable({ rookies, year2 }: Props) {
    const [tab, setTab] = useState<'rookies' | 'year2'>('rookies');
    const [posFilter, setPosFilter] = useState<string>('ALL');
    const [sortKey, setSortKey] = useState<SortKey>('zap_score');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
    const [expandedId, setExpandedId] = useState<string | null>(null);

    const data = tab === 'rookies' ? rookies : year2;

    const filtered = useMemo(() => {
        let list = posFilter === 'ALL' ? data : data.filter(p => p.position === posFilter);
        return list.sort((a, b) => {
            let av: string | number = '', bv: string | number = '';
            if (sortKey === 'zap_score' || sortKey === 'breakout_score') {
                av = parseFloat((a[sortKey] as string) || '0');
                bv = parseFloat((b[sortKey] as string) || '0');
            } else {
                av = (a[sortKey] || '').toString().toLowerCase();
                bv = (b[sortKey] || '').toString().toLowerCase();
            }
            if (av < bv) return sortDir === 'asc' ? -1 : 1;
            if (av > bv) return sortDir === 'asc' ? 1 : -1;
            return 0;
        });
    }, [data, posFilter, sortKey, sortDir]);

    const toggleSort = (key: SortKey) => {
        if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortKey(key); setSortDir(key === 'zap_score' || key === 'breakout_score' ? 'desc' : 'asc'); }
    };

    const positions = ['ALL', ...Array.from(new Set(data.map(p => p.position))).sort()];

    const SortHeader = ({ label, k, className }: { label: string; k: SortKey; className?: string }) => (
        <th className={`px-3 py-2 text-left text-xs font-medium text-zinc-500 uppercase cursor-pointer hover:text-zinc-700 dark:hover:text-zinc-300 ${className || ''}`}
            onClick={() => toggleSort(k)}>
            {label} {sortKey === k ? (sortDir === 'desc' ? '↓' : '↑') : ''}
        </th>
    );

    return (
        <div>
            {/* Tabs */}
            <div className="flex gap-2 mb-4">
                <button onClick={() => setTab('rookies')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === 'rookies' ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900' : 'bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'}`}>
                    Rookies ({rookies.length})
                </button>
                <button onClick={() => setTab('year2')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === 'year2' ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900' : 'bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'}`}>
                    Year 2 ({year2.length})
                </button>
            </div>

            {/* Position filters */}
            <div className="flex gap-2 mb-4 overflow-x-auto">
                {positions.map(pos => (
                    <button key={pos} onClick={() => setPosFilter(pos)}
                        className={`px-3 py-1 rounded text-xs font-medium whitespace-nowrap ${posFilter === pos ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900' : 'bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'}`}>
                        {pos}
                    </button>
                ))}
            </div>

            {/* Table */}
            <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="border-b border-zinc-200 dark:border-zinc-800">
                        <tr>
                            <th className="px-3 py-2 text-left text-xs font-medium text-zinc-500 w-8">#</th>
                            <SortHeader label="Player" k="full_name" />
                            <SortHeader label="Pos" k="position" className="hidden sm:table-cell" />
                            <SortHeader label="College" k="college" className="hidden md:table-cell" />
                            <th className="px-3 py-2 text-left text-xs font-medium text-zinc-500 hidden sm:table-cell">NFL Team</th>
                            <SortHeader label="ZAP" k="zap_score" />
                            <SortHeader label="Category" k="zap_category" className="hidden sm:table-cell" />
                            <SortHeader label="Breakout" k="breakout_score" className="hidden lg:table-cell" />
                            <th className="px-3 py-2 text-left text-xs font-medium text-zinc-500 hidden md:table-cell">Risk</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-zinc-500 hidden lg:table-cell">Comps</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.map((p, i) => (
                            <tr key={p.id} className="border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer"
                                onClick={() => setExpandedId(expandedId === p.id ? null : p.id)}>
                                <td className="px-3 py-2 text-zinc-400">{i + 1}</td>
                                <td className="px-3 py-2 font-medium text-zinc-900 dark:text-zinc-100">
                                    <div>{p.full_name}</div>
                                    <div className="text-xs text-zinc-400 sm:hidden">
                                        {p.position} {p.college && `· ${p.college}`}
                                    </div>
                                    {p.height && p.weight && (
                                        <div className="text-xs text-zinc-400">{p.height} / {p.weight} lbs</div>
                                    )}
                                </td>
                                <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400 hidden sm:table-cell">{p.position}</td>
                                <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400 hidden md:table-cell">{p.college}</td>
                                <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400 hidden sm:table-cell font-medium">{p.nfl_team || '—'}</td>
                                <td className="px-3 py-2 font-bold text-zinc-900 dark:text-zinc-100">
                                    {p.zap_score ? parseFloat(p.zap_score).toFixed(1) : '—'}
                                </td>
                                <td className="px-3 py-2 hidden sm:table-cell">
                                    {p.zap_category && (
                                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${CATEGORY_COLORS[p.zap_category] || ''}`}>
                                            {p.zap_category}
                                        </span>
                                    )}
                                </td>
                                <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400 hidden lg:table-cell">
                                    {p.breakout_score ? parseFloat(p.breakout_score).toFixed(1) : '—'}
                                </td>
                                <td className={`px-3 py-2 text-xs font-medium hidden md:table-cell ${DELTA_COLORS[p.draft_capital_delta || ''] || ''}`}>
                                    {p.draft_capital_delta || '—'}
                                </td>
                                <td className="px-3 py-2 text-xs text-zinc-500 hidden lg:table-cell max-w-xs truncate">
                                    {p.statistical_comparables || '—'}
                                </td>
                            </tr>
                        ))}
                        {filtered.length === 0 && (
                            <tr><td colSpan={9} className="px-3 py-8 text-center text-zinc-400">No prospects found</td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Expanded analysis panel */}
            {expandedId && (() => {
                const p = filtered.find(x => x.id === expandedId);
                if (!p) return null;
                return (
                    <div className="mt-4 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">{p.full_name}</h2>
                                <p className="text-sm text-zinc-500">
                                    {p.position} · {p.college} · ZAP: {p.zap_score}
                                    {p.zap_category && ` · ${p.zap_category}`}
                                </p>
                            </div>
                            <button onClick={(e) => { e.stopPropagation(); setExpandedId(null); }}
                                className="text-zinc-400 hover:text-zinc-600 text-lg">✕</button>
                        </div>
                        {p.statistical_comparables && (
                            <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-3">
                                <span className="font-medium">Comps:</span> {p.statistical_comparables}
                            </p>
                        )}
                        {p.analysis_text && (
                            <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-line leading-relaxed">
                                {p.analysis_text}
                            </p>
                        )}
                    </div>
                );
            })()}
        </div>
    );
}
