'use client';

import { useState, useMemo } from 'react';
import { Settings, ChevronDown, ChevronUp } from 'lucide-react';

interface Player {
    sleeper_id: string;
    full_name: string;
    position: string | null;
    fc_value: number | null;
    redraft_rank_overall?: number | null;
    redraft_auction_value?: number | null;
    rank_sf_tier?: number | null;
    rank_1qb_tier?: number | null;
    years_exp?: number | null;
    zap_category?: string | null;
}

interface KeeperSettings {
    keeperCount: number;
    costType: 'none' | 'draft_pick' | 'auction';
    dynastyWeight: number; // 0-100, how much to weight dynasty vs redraft
}

interface KeeperDecisionToolProps {
    players: Player[];
    scoringFormat: '1qb' | 'sf';
    keeperCount: number;
    leagueId: string;
}

interface KeeperRecommendation {
    player: Player;
    keeperScore: number;
    reasons: string[];
    verdict: 'lock' | 'keep' | 'borderline' | 'cut';
}

export function KeeperDecisionTool({ players, scoringFormat, keeperCount, leagueId }: KeeperDecisionToolProps) {
    const [expanded, setExpanded] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [settings, setSettings] = useState<KeeperSettings>(() => {
        if (typeof window === 'undefined') return { keeperCount, costType: 'none', dynastyWeight: 60 };
        try {
            const saved = localStorage.getItem(`vff_keeper_settings_${leagueId}`);
            if (saved) return JSON.parse(saved);
        } catch {}
        return { keeperCount, costType: 'none', dynastyWeight: 60 };
    });

    const saveSettings = (s: KeeperSettings) => {
        setSettings(s);
        try { localStorage.setItem(`vff_keeper_settings_${leagueId}`, JSON.stringify(s)); } catch {}
    };

    const recommendations = useMemo(() => {
        const sf = scoringFormat === 'sf';
        const rostered = players.filter(p => p.position !== 'PICK');
        const dynWeight = settings.dynastyWeight / 100;
        const rdWeight = 1 - dynWeight;

        // Calculate keeper scores
        const scored: KeeperRecommendation[] = rostered.map(player => {
            const reasons: string[] = [];
            let score = 0;

            // Dynasty value component (normalized to 0-100 scale)
            const dynValue = player.fc_value || 0;
            const dynScore = Math.min(100, (dynValue / 80)); // 8000 value = 100 score
            score += dynScore * dynWeight;

            // Redraft rank component (lower rank = better)
            const rdRank = player.redraft_rank_overall;
            const rdScore = rdRank ? Math.max(0, 100 - (rdRank * 0.4)) : 0; // rank 1 = 99.6, rank 50 = 80, rank 200 = 20
            score += rdScore * rdWeight;

            // Age bonus/penalty
            const yrsExp = player.years_exp;
            if (yrsExp != null) {
                if (yrsExp === 0) { score += 8; reasons.push('Rookie upside'); }
                else if (yrsExp === 1) { score += 5; reasons.push('Year 2 breakout window'); }
                else if (yrsExp >= 8) { score -= 8; reasons.push('Aging (8+ years)'); }
                else if (yrsExp >= 6) { score -= 4; reasons.push('Entering decline window'); }
            }

            // Prospect quality bonus
            if (player.zap_category) {
                const cat = player.zap_category.toLowerCase();
                if (cat.includes('elite') || cat.includes('legendary')) { score += 6; reasons.push('Elite prospect profile'); }
                else if (cat.includes('starter')) { score += 3; reasons.push('Starter-caliber prospect'); }
            }

            // Tier bonus for top-tier players
            const tier = sf ? player.rank_sf_tier : player.rank_1qb_tier;
            if (tier && tier <= 3) { score += 5; reasons.push(`Tier ${tier} dynasty asset`); }

            // Dynasty value context
            if (dynValue >= 6000) reasons.push('Elite dynasty value');
            else if (dynValue >= 4000) reasons.push('Strong dynasty value');
            else if (dynValue < 1500) reasons.push('Low dynasty value');

            // Redraft context
            if (rdRank && rdRank <= 20) reasons.push(`Top-20 redraft (RD#${rdRank})`);
            else if (rdRank && rdRank <= 50) reasons.push(`Solid redraft (RD#${rdRank})`);
            else if (rdRank && rdRank > 150) reasons.push('Minimal redraft value');

            return { player, keeperScore: score, reasons, verdict: 'keep' as const };
        });

        // Sort by keeper score
        scored.sort((a, b) => b.keeperScore - a.keeperScore);

        // Assign verdicts
        const count = settings.keeperCount;
        scored.forEach((rec, i) => {
            if (i < count - 2) rec.verdict = 'lock'; // Top keepers are locks
            else if (i < count) rec.verdict = 'keep'; // Last 2 keeper slots are "keep but close"
            else if (i < count + 2) rec.verdict = 'borderline'; // Just outside
            else rec.verdict = 'cut';
        });

        return scored;
    }, [players, scoringFormat, settings]);

    const keepers = recommendations.filter(r => r.verdict === 'lock' || r.verdict === 'keep');
    const borderline = recommendations.filter(r => r.verdict === 'borderline');

    if (players.filter(p => p.position !== 'PICK').length === 0) return null;

    return (
        <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm ring-1 ring-zinc-900/5 overflow-hidden mb-6">
            <button onClick={() => setExpanded(!expanded)} className="w-full flex items-center justify-between p-4 text-left">
                <div className="flex items-center gap-2">
                    <span className="text-lg">👑</span>
                    <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Keeper Recommendations</h3>
                    <span className="text-[10px] text-zinc-500">Keep {settings.keeperCount} · {settings.dynastyWeight}% dynasty / {100 - settings.dynastyWeight}% redraft</span>
                </div>
                {expanded ? <ChevronUp size={16} className="text-zinc-400" /> : <ChevronDown size={16} className="text-zinc-400" />}
            </button>

            {expanded && (
                <div className="px-4 pb-4">
                    {/* Dynasty/Redraft weight slider (always visible) */}
                    <div className="mb-3 p-2 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg">
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-[9px] font-bold text-purple-500">Dynasty</span>
                            <span className="text-[9px] text-zinc-400">{settings.dynastyWeight}/{100 - settings.dynastyWeight}</span>
                            <span className="text-[9px] font-bold text-amber-500">Redraft</span>
                        </div>
                        <input type="range" min={0} max={100} step={10} value={settings.dynastyWeight}
                            onChange={e => saveSettings({ ...settings, dynastyWeight: Number(e.target.value) })}
                            className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-gradient-to-r from-purple-500 via-zinc-400 to-amber-500 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-indigo-500" />
                    </div>

                    {/* Settings toggle */}
                    <div className="flex items-center justify-between mb-3">
                        <button onClick={() => setShowSettings(!showSettings)} className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300">
                            <Settings size={12} />
                            {showSettings ? 'Hide Settings' : 'More Settings'}
                        </button>
                    </div>

                    {/* Settings panel */}
                    {showSettings && (
                        <div className="mb-4 p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg space-y-3">
                            <div className="flex items-center justify-between">
                                <span className="text-xs text-zinc-600 dark:text-zinc-400">Keepers</span>
                                <input type="number" min={1} max={25} value={settings.keeperCount}
                                    onChange={e => saveSettings({ ...settings, keeperCount: parseInt(e.target.value) || keeperCount })}
                                    className="w-16 px-2 py-1 text-xs border border-zinc-300 dark:border-zinc-600 rounded bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100" />
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-xs text-zinc-600 dark:text-zinc-400">Keeper Cost</span>
                                <select value={settings.costType} onChange={e => saveSettings({ ...settings, costType: e.target.value as any })}
                                    className="text-xs border border-zinc-300 dark:border-zinc-600 rounded bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 px-2 py-1">
                                    <option value="none">Free (no cost)</option>
                                    <option value="draft_pick">Costs a draft pick</option>
                                    <option value="auction">Auction cost</option>
                                </select>
                            </div>
                        </div>
                    )}

                    {/* Keeper List */}
                    <div className="space-y-1">
                        <div className="text-[9px] font-bold text-green-600 uppercase tracking-wider mb-1">Keep ({keepers.length})</div>
                        {keepers.map((rec, i) => (
                            <div key={rec.player.sleeper_id} className={`flex items-center gap-3 px-3 py-2 rounded-lg ${
                                rec.verdict === 'lock' ? 'bg-green-50/50 dark:bg-green-950/10' : 'bg-amber-50/30 dark:bg-amber-950/10'
                            }`}>
                                <span className="text-xs font-mono text-zinc-400 w-4">{i + 1}</span>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{rec.player.full_name}</span>
                                        <span className={`text-[9px] px-1 rounded font-medium ${
                                            rec.player.position === 'QB' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                                            rec.player.position === 'RB' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                                            rec.player.position === 'WR' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                                            'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
                                        }`}>{rec.player.position}</span>
                                        {rec.verdict === 'lock' && <span className="text-[8px] bg-green-600 text-white px-1 rounded">LOCK</span>}
                                    </div>
                                    <div className="text-[10px] text-zinc-500 mt-0.5 truncate">{rec.reasons.slice(0, 2).join(' · ')}</div>
                                </div>
                                <div className="text-right flex-shrink-0">
                                    <div className="text-[9px] text-zinc-400">Keeper Score</div>
                                    <div className="text-xs font-mono font-bold text-zinc-700 dark:text-zinc-300">{rec.keeperScore.toFixed(0)}</div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Borderline */}
                    {borderline.length > 0 && (
                        <div className="mt-3 space-y-1">
                            <div className="text-[9px] font-bold text-amber-600 uppercase tracking-wider mb-1">Borderline (just missed)</div>
                            {borderline.map((rec, i) => (
                                <div key={rec.player.sleeper_id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/30">
                                    <span className="text-xs font-mono text-zinc-400 w-4">{settings.keeperCount + i + 1}</span>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400 truncate">{rec.player.full_name}</span>
                                            <span className="text-[9px] text-zinc-400">{rec.player.position}</span>
                                        </div>
                                        <div className="text-[10px] text-zinc-400 mt-0.5 truncate">{rec.reasons.slice(0, 2).join(' · ')}</div>
                                    </div>
                                    <div className="text-right flex-shrink-0">
                                        <div className="text-xs font-mono text-zinc-500">{rec.keeperScore.toFixed(0)}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Score explanation */}
                    <div className="mt-3 text-[9px] text-zinc-400 border-t border-zinc-100 dark:border-zinc-800 pt-2">
                        Score blends dynasty value ({settings.dynastyWeight}%) + redraft rank ({100 - settings.dynastyWeight}%) + age + prospect quality. Adjust the slider to shift toward win-now or long-term.
                    </div>
                </div>
            )}
        </div>
    );
}
