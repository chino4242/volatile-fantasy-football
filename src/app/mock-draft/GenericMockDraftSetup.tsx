'use client';

import { useState } from 'react';
import DraftClient from '@/app/fleaflicker/[leagueId]/mock-draft/DraftClient';

interface Props {
    players: any[];
    format: string;
    rankingsVintage: string | null;
    redraftVintage: string | null;
}

const LEAGUE_SIZES = [8, 10, 12, 14];
const ROUND_OPTIONS = [1, 2, 3, 4, 5];

export default function GenericMockDraftSetup({ players, format: initialFormat, rankingsVintage, redraftVintage }: Props) {
    const [started, setStarted] = useState(false);
    const [format, setFormat] = useState(initialFormat);
    const [leagueSize, setLeagueSize] = useState(12);
    const [draftType, setDraftType] = useState<'snake' | 'linear'>('snake');
    const [rounds, setRounds] = useState(5);
    const [draftSlot, setDraftSlot] = useState(1);
    const [rosterSlots, setRosterSlots] = useState({ QB: 1, RB: 2, WR: 3, TE: 1, FLEX: 2 });
    const [benchSize, setBenchSize] = useState(10);

    if (started) {
        // Generate teams
        const teams = Array.from({ length: leagueSize }, (_, i) => ({
            id: i + 1,
            name: i + 1 === draftSlot ? 'My Team' : `Team ${i + 1}`,
            owner: i + 1 === draftSlot ? 'You' : `CPU ${i + 1}`,
            players: [] as any[],
            positionValues: { QB: 0, RB: 0, WR: 0, TE: 0 },
            draftPicks: generateDraftPicks(i + 1, leagueSize, rounds, draftType),
        }));

        return (
            <div className="min-h-screen bg-gray-50 dark:bg-zinc-950 p-2 sm:p-4">
                <DraftClient
                    leagueId="generic-mock"
                    teams={teams}
                    freeAgents={players}
                    format={format}
                    rankingsVintage={rankingsVintage}
                    redraftVintage={redraftVintage}
                    platform="sleeper"
                    rosterSlots={rosterSlots}
                    mode="mock"
                    defaultUserTeamId={draftSlot}
                />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-zinc-950 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl ring-1 ring-zinc-900/5 p-6 sm:p-8 w-full max-w-md space-y-6">
                <div className="text-center">
                    <h1 className="text-2xl font-black text-zinc-900 dark:text-zinc-100 tracking-tight">Rookie Mock Draft</h1>
                    <p className="text-sm text-zinc-500 mt-1">{players.length} rookies available</p>
                </div>

                {/* Scoring Format */}
                <div>
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider block mb-2">Scoring Format</label>
                    <div className="grid grid-cols-2 gap-2">
                        {['1qb', 'sf'].map(f => (
                            <button key={f} onClick={() => setFormat(f)}
                                className={`py-2.5 rounded-lg text-sm font-bold transition ${format === f ? 'bg-indigo-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'}`}>
                                {f === '1qb' ? '1QB' : 'Superflex'}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Draft Format */}
                <div>
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider block mb-2">Draft Format</label>
                    <div className="grid grid-cols-2 gap-2">
                        {(['snake', 'linear'] as const).map(t => (
                            <button key={t} onClick={() => setDraftType(t)}
                                className={`py-2.5 rounded-lg text-sm font-bold capitalize transition ${draftType === t ? 'bg-indigo-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'}`}>
                                {t}
                            </button>
                        ))}
                    </div>
                </div>

                {/* League Size */}
                <div>
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider block mb-2">League Size</label>
                    <div className="grid grid-cols-4 gap-2">
                        {LEAGUE_SIZES.map(s => (
                            <button key={s} onClick={() => { setLeagueSize(s); if (draftSlot > s) setDraftSlot(s); }}
                                className={`py-2.5 rounded-lg text-sm font-bold transition ${leagueSize === s ? 'bg-indigo-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'}`}>
                                {s}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Rounds */}
                <div>
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider block mb-2">Rounds</label>
                    <div className="grid grid-cols-5 gap-2">
                        {ROUND_OPTIONS.map(r => (
                            <button key={r} onClick={() => setRounds(r)}
                                className={`py-2.5 rounded-lg text-sm font-bold transition ${rounds === r ? 'bg-indigo-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'}`}>
                                {r}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Roster Slots */}
                <div>
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider block mb-2">Starting Lineup</label>
                    <div className="grid grid-cols-5 gap-2">
                        {Object.entries(rosterSlots).map(([pos, count]) => (
                            <div key={pos} className="text-center">
                                <div className="text-[10px] font-bold text-zinc-400 mb-1">{pos}</div>
                                <div className="flex items-center justify-center gap-1">
                                    <button onClick={() => setRosterSlots(prev => ({ ...prev, [pos]: Math.max(0, prev[pos as keyof typeof prev] - 1) }))}
                                        className="w-6 h-6 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500 text-xs font-bold">-</button>
                                    <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100 w-4 text-center">{count}</span>
                                    <button onClick={() => setRosterSlots(prev => ({ ...prev, [pos]: prev[pos as keyof typeof prev] + 1 }))}
                                        className="w-6 h-6 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500 text-xs font-bold">+</button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Draft Position */}
                <div>
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider block mb-2">Your Draft Position</label>
                    <div className="grid grid-cols-6 gap-1.5">
                        {Array.from({ length: leagueSize }, (_, i) => i + 1).map(slot => (
                            <button key={slot} onClick={() => setDraftSlot(slot)}
                                className={`py-2 rounded-lg text-xs font-bold transition ${draftSlot === slot ? 'bg-indigo-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'}`}>
                                {slot}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Start */}
                <button onClick={() => setStarted(true)}
                    className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-sm uppercase tracking-wider transition active:scale-[0.98]">
                    Start Mock Draft
                </button>
            </div>
        </div>
    );
}

function generateDraftPicks(teamSlot: number, numTeams: number, rounds: number, type: 'snake' | 'linear') {
    const picks = [];
    for (let round = 1; round <= rounds; round++) {
        const slot = (type === 'snake' && round % 2 === 0) ? (numTeams - teamSlot + 1) : teamSlot;
        picks.push({
            season: new Date().getFullYear(),
            round,
            slot,
            overall: (round - 1) * numTeams + slot,
            originalOwner: teamSlot,
            currentOwner: teamSlot,
        });
    }
    return picks;
}
