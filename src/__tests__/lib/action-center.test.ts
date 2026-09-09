import { describe, it, expect } from 'vitest';
import { buildActionCenter, tierFor, type ActionCenterInput } from '@/lib/action-center';
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

describe('buildActionCenter — in-season', () => {
    it('groups by action type in order lineup → trade → waiver', () => {
        const ac = buildActionCenter([leagueWithActions()], { seasonMode: 'in-season', week: 3 });
        expect(ac.seasonMode).toBe('in-season');
        expect(ac.isEmpty).toBe(false);
        expect(ac.byType).toBeDefined();
        const kinds = ac.byType!.map(g => g.kind);
        // No trades wired → lineup then waiver, in that relative order.
        expect(kinds).toEqual(['lineup', 'waiver']);
    });

    it('derives a lineup action from a sub-optimal lineup', () => {
        const ac = buildActionCenter([leagueWithActions()], { seasonMode: 'in-season', week: 3 });
        const lineupGrp = ac.byType!.find(g => g.kind === 'lineup')!;
        expect(lineupGrp.items.length).toBeGreaterThan(0);
        expect(lineupGrp.items[0].headline).toMatch(/^Start /);
        expect(lineupGrp.items[0].deepLink).toContain('/league/L1');
        expect(ac.counts.lineup).toBe(lineupGrp.items.length);
    });

    it('derives an actionable waiver ADD→DROP swap (upgrades only)', () => {
        const ac = buildActionCenter([leagueWithActions()], { seasonMode: 'in-season', week: 3 });
        const waiverGrp = ac.byType!.find(g => g.kind === 'waiver')!;
        const item = waiverGrp.items.find(i => i.headline.includes('Upgrade Guy'))!;
        expect(item).toBeDefined();
        // Actionable: names the drop and shows a positive value gain.
        expect(item.headline).toMatch(/drop /);
        expect(item.detail).toMatch(/^\+/);
        // The non-upgrade FA ("Scrub") must NOT surface.
        expect(waiverGrp.items.some(i => i.headline.includes('Scrub'))).toBe(false);
    });

    it('emits Fleaflicker-scoped trade items when pending trades are supplied', () => {
        const input = leagueWithActions();
        input.league = { ...input.league, platform: 'fleaflicker', leagueId: 'FF1' };
        input.pendingTrades = [{ id: 't1', headline: 'You get X ↔ give Y', detail: 'even value' }];
        const ac = buildActionCenter([input], { seasonMode: 'in-season', week: 3 });
        const tradeGrp = ac.byType!.find(g => g.kind === 'trade')!;
        expect(tradeGrp).toBeDefined();
        expect(tradeGrp.items[0].scope).toBe('fleaflicker');
        expect(ac.byType!.map(g => g.kind)).toEqual(['lineup', 'trade', 'waiver']);
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
        expect(ac.counts).toEqual({ lineup: 0, trade: 0, waiver: 0, sell: 0 });
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
