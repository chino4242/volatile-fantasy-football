import { describe, it, expect } from 'vitest';
import { buildActionCenter, buildLeagueActions, tierFor, type ActionCenterInput } from '@/lib/action-center';
import type { PortfolioLeague, PortfolioTeam, PortfolioPlayer } from '@/lib/portfolio';

// ── Fixtures ────────────────────────────────────────────────────────────────

let pid = 0;
const P = (over: Partial<PortfolioPlayer> = {}): PortfolioPlayer => ({
    sleeper_id: over.sleeper_id ?? `p${pid++}`,
    full_name: over.full_name ?? 'Player',
    position: over.position ?? 'WR',
    team: over.team ?? 'BUF',
    age: over.age ?? 25,
    myRank: over.myRank ?? null,
    myPosRank: over.myPosRank ?? null,
    marketRank: over.marketRank ?? null,
    marketValue: over.marketValue ?? 1000,
    is_starter: over.is_starter ?? false,
    tag: over.tag ?? null,
    txnAction: over.txnAction ?? null,
    txnNote: over.txnNote ?? null,
    weeklyRank: over.weeklyRank ?? null,
    weeklyTotal: over.weeklyTotal ?? null,
    weeklyPosMatchup: over.weeklyPosMatchup ?? null,
});

function team(rosterId: string, ownerName: string, players: PortfolioPlayer[]): PortfolioTeam {
    return { rosterId, ownerName, players };
}

function league(over: Partial<PortfolioLeague> & { teams: PortfolioTeam[] }): PortfolioLeague {
    return {
        platform: over.platform ?? 'sleeper',
        leagueId: over.leagueId ?? 'L1',
        name: over.name ?? 'Test League',
        format: over.format ?? '1qb',
        leagueType: over.leagueType ?? 'dynasty',
        teams: over.teams,
        freeAgents: over.freeAgents ?? [],
        rosterPositions: over.rosterPositions ?? null,
        weeklyWeek: over.weeklyWeek ?? null,
    };
}

// A league where MY team has a sub-optimal lineup (a better bench player exists)
// and the FA pool contains upgrades over my worst bench body (full roster).
function leagueWithActions(): ActionCenterInput {
    const starters = [
        P({ sleeper_id: 'qb1', position: 'QB', is_starter: true, weeklyRank: 5, marketValue: 3000 }),
        P({ sleeper_id: 'wr1', position: 'WR', is_starter: true, weeklyRank: 40, marketValue: 800 }), // weak starter
        P({ sleeper_id: 'rb1', position: 'RB', is_starter: true, weeklyRank: 12, marketValue: 4000 }),
    ];
    const bench = [
        P({ sleeper_id: 'wr2', position: 'WR', is_starter: false, weeklyRank: 8, marketValue: 2500 }), // should start over wr1
        P({ sleeper_id: 'wr3', position: 'WR', is_starter: false, marketValue: 300 }),                 // cheap drop candidate
    ];
    const my = team('1', 'Chino', [...starters, ...bench]);
    const opp = team('2', 'Rival', [P({ marketValue: 2000 }), P({ marketValue: 1800 })]);
    const fas = [
        P({ sleeper_id: 'fa1', full_name: 'Upgrade Guy', position: 'WR', marketValue: 2600 }), // clear upgrade over wr3 (300)
        P({ sleeper_id: 'fa2', full_name: 'Scrub', position: 'WR', marketValue: 100 }),         // not an upgrade
    ];
    const lg = league({
        teams: [my, opp],
        freeAgents: fas,
        // 1QB/RB/WR/FLEX + 1 bench = coreCapacity 5; roster has 5 → full → swaps.
        rosterPositions: ['QB', 'RB', 'WR', 'FLEX', 'BN'],
        weeklyWeek: 3,
    });
    return { league: lg, myRosterId: '1' };
}

describe('tierFor', () => {
    it('maps dynasty states to bands with dynasty labels', () => {
        expect(tierFor('contender', 'dynasty')).toEqual({ band: 'top', label: 'Contender' });
        expect(tierFor('middle', 'dynasty')).toEqual({ band: 'middle', label: 'Middle' });
        expect(tierFor('rebuild', 'dynasty')).toEqual({ band: 'lower', label: 'Rebuild' });
    });
    it('uses format-honest labels for redraft', () => {
        expect(tierFor('contender', 'redraft')).toEqual({ band: 'top', label: 'Contender' });
        expect(tierFor('middle', 'redraft')).toEqual({ band: 'middle', label: 'In the mix' });
        expect(tierFor('rebuild', 'redraft')).toEqual({ band: 'lower', label: 'Falling behind' });
    });
});

describe('buildActionCenter — in-season (urgent-only: lineup + trade)', () => {
    it('cross-league Action Center contains ONLY lineup + trade (no waiver/stream)', () => {
        const ac = buildActionCenter([leagueWithActions()], { seasonMode: 'in-season', week: 3 });
        expect(ac.seasonMode).toBe('in-season');
        expect(ac.byType).toBeDefined();
        const kinds = ac.byType!.map(g => g.kind);
        // Only lineup here (no trades wired); waiver moved to per-league cards.
        expect(kinds).toEqual(['lineup']);
        expect(kinds).not.toContain('waiver');
        expect(kinds).not.toContain('stream');
    });

    it('derives a lineup action from a sub-optimal lineup', () => {
        const ac = buildActionCenter([leagueWithActions()], { seasonMode: 'in-season', week: 3 });
        const lineupGrp = ac.byType!.find(g => g.kind === 'lineup')!;
        expect(lineupGrp.items.length).toBeGreaterThan(0);
        expect(lineupGrp.items[0].headline).toMatch(/^Start /);
        expect(lineupGrp.items[0].deepLink).toBe('https://sleeper.com/leagues/L1/team');
        expect(ac.counts.lineup).toBe(lineupGrp.items.length);
    });

    it('urgent strip is empty (quiet) when only waiver/stream exist', () => {
        // A team with no lineup issue + no trades, but an available upgrade FA.
        const my = team('1', 'Chino', [
            P({ sleeper_id: 'qb1', position: 'QB', is_starter: true, weeklyRank: 5 }),
            P({ sleeper_id: 'wr1', position: 'WR', is_starter: true, weeklyRank: 5 }),
            P({ sleeper_id: 'wr3', position: 'WR', is_starter: false, marketValue: 300 }),
        ]);
        const lg = league({ teams: [my, team('2', 'R', [])], freeAgents: [P({ full_name: 'FA', position: 'WR', marketValue: 3000 })], rosterPositions: ['QB', 'WR', 'BN'] });
        const ac = buildActionCenter([{ league: lg, myRosterId: '1' }], { seasonMode: 'in-season', week: 3, waiverPerLeague: 3 });
        expect(ac.isEmpty).toBe(true); // urgent-only strip is quiet
    });

    it('emits Fleaflicker-scoped trade items in the urgent strip', () => {
        const input = leagueWithActions();
        input.league = { ...input.league, platform: 'fleaflicker', leagueId: 'FF1' };
        input.pendingTrades = [{ id: 't1', headline: 'You get X ↔ give Y', detail: 'even value' }];
        const ac = buildActionCenter([input], { seasonMode: 'in-season', week: 3 });
        const tradeGrp = ac.byType!.find(g => g.kind === 'trade')!;
        expect(tradeGrp).toBeDefined();
        expect(tradeGrp.items[0].scope).toBe('fleaflicker');
        expect(ac.byType!.map(g => g.kind)).toEqual(['lineup', 'trade']);
    });
});

describe('buildLeagueActions — per-league waiver + stream (rendered in the card)', () => {
    it('produces an actionable waiver ADD→DROP swap (upgrades only)', () => {
        const items = buildLeagueActions(leagueWithActions());
        const item = items.find(i => i.headline.includes('Upgrade Guy'))!;
        expect(item).toBeDefined();
        expect(item.kind).toBe('waiver');
        expect(item.headline).toMatch(/drop /);
        expect(item.detail).toMatch(/^\+/);
        expect(items.some(i => i.headline.includes('Scrub'))).toBe(false);
    });

    it('returns nothing when my-team is unknown', () => {
        const input = leagueWithActions();
        input.myRosterId = null;
        expect(buildLeagueActions(input)).toEqual([]);
    });
});

describe('buildActionCenter — DEF streaming (gated on a DEF slot, any league type)', () => {
    // My team has a bad DEF (rank 25); a top DEF (rank 1) is available. Roster
    // has a DST slot so streaming applies. leagueType defaults to dynasty to
    // prove it's NOT redraft-gated anymore.
    function withDef(myDefRank: number | null, opts: { availTopRank?: number; rosterPositions?: string[] } = {}): ActionCenterInput {
        const myDef = myDefRank != null ? [P({ sleeper_id: 'DEF_NYG', position: 'DEF', is_starter: true })] : [];
        const my = team('1', 'Chino', [P({ sleeper_id: 'qb1', position: 'QB', is_starter: true }), ...myDef]);
        const opp = team('2', 'Rival', [P({ sleeper_id: 'DEF_DAL', position: 'DEF' })]); // Dallas rostered → unavailable
        const lg = league({ teams: [my, opp], leagueType: 'dynasty', rosterPositions: opts.rosterPositions ?? ['QB', 'DST', 'BN'] });
        const dstRankings = [
            { sleeper_id: 'DEF_LAC', rank: opts.availTopRank ?? 1, tier: 1, spread: -10, opponent: 'ARI', name: 'Los Angeles Chargers' },
            { sleeper_id: 'DEF_SEA', rank: 2, tier: 1, spread: -7, opponent: 'WAS', name: 'Seattle Seahawks' },
            { sleeper_id: 'DEF_DAL', rank: 12, tier: 3, spread: -3, opponent: 'NYG', name: 'Dallas Cowboys' },
            { sleeper_id: 'DEF_NYG', rank: myDefRank ?? 99, tier: 5, spread: 3, opponent: 'DAL', name: 'New York Giants' },
        ];
        return { league: lg, myRosterId: '1', dstRankings };
    }

    // DEF streaming now surfaces in the cross-league Action Center (urgent),
    // not the per-league card. Pull the stream group from byType.
    function streamItemsOf(input: ActionCenterInput) {
        const ac = buildActionCenter([input], { seasonMode: 'in-season', week: 3 });
        return ac.byType?.find(g => g.kind === 'stream')?.items ?? [];
    }

    it('surfaces DEF streaming in the top-level Action Center (urgent)', () => {
        const ac = buildActionCenter([withDef(25)], { seasonMode: 'in-season', week: 3 });
        expect(ac.byType!.map(g => g.kind)).toContain('stream');
        expect(ac.counts.stream).toBe(1);
    });

    it('recommends the best available defense when it beats my starter', () => {
        const stream = streamItemsOf(withDef(25))[0];
        expect(stream).toBeDefined();
        expect(stream.headline).toMatch(/Stream Los Angeles Chargers.*drop/);
        expect(stream.detail).toMatch(/vs ARI/);
    });

    it('recommends when I have no defense at all', () => {
        const stream = streamItemsOf(withDef(null))[0];
        expect(stream.headline).toMatch(/^Stream Los Angeles Chargers \(DEF\)/);
    });

    it('does NOT recommend when my defense is already good', () => {
        // My DEF rank 2; best available rank 1 → not a >=3-spot upgrade.
        expect(streamItemsOf(withDef(2))).toHaveLength(0);
    });

    it('recommends in a dynasty league (no longer redraft-only)', () => {
        const input = withDef(25);
        input.league = { ...input.league, leagueType: 'dynasty' };
        expect(streamItemsOf(input).length).toBeGreaterThan(0);
    });

    it('does NOT recommend when the league has no DEF slot', () => {
        // Superflex-style roster with no DST slot → streaming gated off.
        expect(streamItemsOf(withDef(25, { rosterPositions: ['QB', 'SUPER_FLEX', 'BN'] }))).toHaveLength(0);
    });

    // Game-time gating: a defense whose NFL game already kicked off can't help
    // this week, and swapping out a defense that already played is a no-op.
    function streamWithStarted(input: ActionCenterInput, started: string[]) {
        input.startedTeams = new Set(started);
        return streamItemsOf(input);
    }

    it('excludes an available defense whose game already started', () => {
        // LAC (rank 1) already played → next-best available SEA (rank 2) is the pick.
        const items = streamWithStarted(withDef(25), ['LAC']);
        expect(items[0]).toBeDefined();
        expect(items[0].headline).toMatch(/Seattle Seahawks/);
        expect(items[0].headline).not.toMatch(/Chargers/);
    });

    it('does NOT surface a started defense among the alternatives', () => {
        const items = streamWithStarted(withDef(25), ['LAC']);
        const alts = items[0].meta?.alternatives as Array<{ name: string }>;
        expect(alts.some(a => a.name.includes('Chargers'))).toBe(false);
    });

    it('suppresses the whole suggestion when MY defense already played', () => {
        // My DEF is New York Giants (DEF_NYG); if NYG already kicked off, dropping
        // it is pointless → no suggestion at all.
        expect(streamWithStarted(withDef(25), ['NYG'])).toHaveLength(0);
    });

    it('still recommends when a started team is neither mine nor the best pickup', () => {
        // DAL already played but DAL is rostered anyway; best available (LAC) is
        // unaffected → normal recommendation stands.
        const items = streamWithStarted(withDef(25), ['DAL']);
        expect(items[0].headline).toMatch(/Los Angeles Chargers/);
    });

    it('surfaces the top alternatives (excluding the headline pickup) in subDetail', () => {
        const stream = streamItemsOf(withDef(25))[0];
        // Seattle (rank 2) is the next-best available after LAC (rank 1).
        expect(stream.meta?.subDetail as string).toMatch(/Also available: Seattle Seahawks \(#2\)/);
        const alts = stream.meta?.alternatives as Array<{ name: string; rank: number }>;
        expect(alts[0].name).toBe('Los Angeles Chargers');
        expect(alts.length).toBeGreaterThanOrEqual(2);
    });

    it('never recommends a defense already rostered in the league', () => {
        const input = withDef(25);
        input.dstRankings = [
            { sleeper_id: 'DEF_DAL', rank: 1, tier: 1, spread: -10, opponent: 'NYG', name: 'Dallas Cowboys' },
            { sleeper_id: 'DEF_LAC', rank: 2, tier: 1, spread: -9, opponent: 'ARI', name: 'Los Angeles Chargers' },
        ];
        const stream = streamItemsOf(input)[0];
        expect(stream.headline).toMatch(/Los Angeles Chargers/); // not Dallas
    });
});

describe('buildActionCenter — off-season', () => {
    it('groups by team with tier + weakness + moves', () => {
        const ac = buildActionCenter([leagueWithActions()], { seasonMode: 'off-season', week: 3 });
        expect(ac.seasonMode).toBe('off-season');
        expect(ac.byTeam).toBeDefined();
        const tg = ac.byTeam![0];
        expect(tg.teamName).toBe('Chino');
        expect(['top', 'middle', 'lower']).toContain(tg.tier);
        expect(tg.items.length).toBeGreaterThan(0); // at least the waiver swap
    });

    it('includes Fleaflicker pending trades among a team\'s off-season moves', () => {
        const input = leagueWithActions();
        input.league = { ...input.league, platform: 'fleaflicker', leagueId: 'FF1' };
        input.pendingTrades = [{ id: 't1', headline: 'You get X ↔ give Y', detail: 'even' }];
        const ac = buildActionCenter([input], { seasonMode: 'off-season', week: 3 });
        const tg = ac.byTeam!.find(g => g.leagueId === 'FF1')!;
        expect(tg.items.some(i => i.kind === 'trade' && i.scope === 'fleaflicker')).toBe(true);
    });
});

describe('buildActionCenter — edge cases', () => {
    it('returns a quiet result when nothing is actionable', () => {
        const my = team('1', 'Chino', [P({ position: 'QB', is_starter: true })]);
        const lg = league({ teams: [my], freeAgents: [], rosterPositions: ['QB', 'BN'] });
        const ac = buildActionCenter([{ league: lg, myRosterId: '1' }], { seasonMode: 'in-season', week: 3 });
        expect(ac.isEmpty).toBe(true);
        expect(ac.counts).toEqual({ lineup: 0, trade: 0, waiver: 0, waiverUpgrade: 0, stream: 0, sell: 0 });
    });

    it('does not throw and yields no personalized actions when my-team is unknown', () => {
        const input = leagueWithActions();
        input.myRosterId = null;
        const ac = buildActionCenter([input], { seasonMode: 'in-season', week: 3 });
        // No my-team → no lineup AND no waiver swaps (both are roster-specific) → quiet.
        expect(ac.isEmpty).toBe(true);
        expect(ac.byType?.find(g => g.kind === 'lineup')).toBeUndefined();
        expect(ac.byType?.find(g => g.kind === 'waiver')).toBeUndefined();
    });

    it('every action item exposes a stable id and a deepLink', () => {
        const ac = buildActionCenter([leagueWithActions()], { seasonMode: 'in-season', week: 3 });
        const all = ac.byType!.flatMap(g => g.items);
        for (const it of all) {
            expect(it.id).toBeTruthy();
            expect(it.deepLink).toBeTruthy();
        }
        const ids = all.map(i => i.id);
        expect(new Set(ids).size).toBe(ids.length); // unique
    });
});
