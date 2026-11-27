import { describe, it, expect } from 'vitest';
import { normalizeSleeperStarterId } from '@/lib/sleeper';
import { resolveDefenseId } from '@/lib/nameUtils';
import {
    computeSlotGaps, defenseCandidates, kickerCandidates,
} from '@/lib/slot-gaps';
import { buildActionCenter, buildLeagueActions, type ActionCenterInput } from '@/lib/action-center';
import type { PortfolioLeague, PortfolioPlayer, PortfolioTeam } from '@/lib/portfolio';

// A tiny uploaded DST list: ids are always DEF_{ABBR}.
const DST = [
    { sleeper_id: 'DEF_LAC', rank: 1, name: 'Los Angeles Chargers', team: null as string | null },
    { sleeper_id: 'DEF_SEA', rank: 2, name: 'Seattle Seahawks', team: null as string | null },
    { sleeper_id: 'DEF_DAL', rank: 12, name: 'Dallas Cowboys', team: null as string | null },
    { sleeper_id: 'DEF_NYG', rank: 25, name: 'New York Giants', team: null as string | null },
];
const ids = (list: { sleeper_id: string }[]) => list.map(d => d.sleeper_id);

describe('defense identity per platform (a rostered defense must never look available)', () => {
    it('Sleeper: bare team abbreviations normalize to DEF_{ABBR}; player ids are untouched', () => {
        expect(normalizeSleeperStarterId('SEA')).toBe('DEF_SEA');
        expect(normalizeSleeperStarterId('GB')).toBe('DEF_GB');
        expect(normalizeSleeperStarterId('4881')).toBe('4881');
        expect(normalizeSleeperStarterId('DEF_SEA')).toBe('DEF_SEA'); // already normalized
    });

    it('Sleeper: a roster that holds bare "SEA" excludes Seattle from candidates', () => {
        const rostered = new Set(['SEA', '4881']);   // raw Sleeper ids, as the team page used to hold them
        expect(ids(defenseCandidates(DST, rostered))).not.toContain('DEF_SEA');
        expect(ids(defenseCandidates(DST, rostered))).toContain('DEF_LAC');
    });

    it('Fleaflicker: rostered team NAMES resolve to DEF ids', () => {
        expect(resolveDefenseId('Seattle Seahawks')).toBe('DEF_SEA');
        expect(resolveDefenseId('Los Angeles Chargers')).toBe('DEF_LAC');
        const rostered = new Set([resolveDefenseId('Seattle Seahawks')!]);
        expect(ids(defenseCandidates(DST, rostered))).not.toContain('DEF_SEA');
    });

    it('Yahoo / MyFFPC: ids are already DEF_{ABBR} and exclude the same way', () => {
        const rostered = new Set(['DEF_DAL', 'DEF_NYG']);
        expect(ids(defenseCandidates(DST, rostered)).sort()).toEqual(['DEF_LAC', 'DEF_SEA']);
    });

    it('candidates carry position DEF, a name, and the NFL team derived from the id', () => {
        const c = defenseCandidates(DST, new Set());
        const lac = c.find(d => d.sleeper_id === 'DEF_LAC')!;
        expect(lac.position).toBe('DEF');
        expect(lac.team).toBe('LAC');
        expect(lac.full_name).toBe('Los Angeles Chargers');
        expect(lac.fc_value).toBeNull();
    });

    it('rows that did not resolve to a defense id are ignored', () => {
        expect(defenseCandidates([{ sleeper_id: '', rank: 3, name: 'x', team: null }], new Set())).toEqual([]);
    });

    it('kickerCandidates excludes rostered kickers and keeps position K + team', () => {
        const c = kickerCandidates(
            [{ sleeper_id: 'k1', rank: 1, name: 'A', team: 'KC' }, { sleeper_id: 'k2', rank: 2, name: 'B', team: 'BUF' }],
            new Set(['k1']),
        );
        expect(c).toHaveLength(1);
        expect(c[0]).toMatchObject({ sleeper_id: 'k2', position: 'K', team: 'BUF' });
    });
});

// ── Agreement with the Action Center's streaming items ──────────────────────

describe('Roster Gaps agrees with the Action Center DEF / K streaming picks', () => {
    let pid = 0;
    const P = (o: Partial<PortfolioPlayer> & { sleeper_id: string; position: string }): PortfolioPlayer => ({
        sleeper_id: o.sleeper_id, full_name: o.full_name ?? o.sleeper_id, position: o.position, team: o.team ?? 'XXX',
        age: null, myRank: null, myPosRank: null, marketRank: null, marketValue: 0, is_starter: o.is_starter ?? false,
        weeklyRank: o.weeklyRank ?? null, weeklyTotal: null, weeklyPosMatchup: null,
    });
    const team = (rosterId: string, players: PortfolioPlayer[]): PortfolioTeam => ({ rosterId, ownerName: rosterId, players });
    void pid;

    it('DEF: same best available defense and the same ranks', () => {
        const started = new Set(['LAC']); // Chargers already played → both must skip them
        const my = team('1', [P({ sleeper_id: 'qb1', position: 'QB', is_starter: true }), P({ sleeper_id: 'DEF_NYG', position: 'DEF', team: 'NYG', is_starter: true })]);
        const opp = team('2', [P({ sleeper_id: 'DEF_SEA', position: 'DEF', team: 'SEA' })]); // Seattle rostered
        const positions = ['QB', 'DST', 'BN'];
        const lg: PortfolioLeague = {
            platform: 'sleeper', leagueId: 'L1', name: 'T', format: '1qb', leagueType: 'dynasty',
            teams: [my, opp], freeAgents: [], rosterPositions: positions, weeklyWeek: 12,
        };
        const dstInput = DST.map(d => ({ sleeper_id: d.sleeper_id, rank: d.rank, tier: 1, spread: -3, opponent: 'ZZZ', name: d.name }));
        const input: ActionCenterInput = { league: lg, myRosterId: '1', dstRankings: dstInput, startedTeams: started };
        const ac = buildActionCenter([input], { seasonMode: 'in-season', week: 12 });
        const stream = ac.byType?.find(g => g.kind === 'stream')?.items[0];
        expect(stream).toBeDefined();

        // Gap path: stamp ranks from the same list, build candidates the way the server helper does.
        const rankOf = new Map(DST.map(d => [d.sleeper_id, d.rank]));
        const rostered = new Set(lg.teams.flatMap(t => t.players.map(p => p.sleeper_id)));
        const fas = defenseCandidates(DST, rostered).map(c => P({ ...c, weeklyRank: rankOf.get(c.sleeper_id) ?? null }) as PortfolioPlayer);
        const roster = my.players.map(p => ({ ...p, weeklyRank: p.position === 'DEF' ? rankOf.get(p.sleeper_id) ?? null : p.weeklyRank }));
        const gaps = computeSlotGaps({ roster, freeAgents: fas, rosterPositions: positions, startedTeams: started });
        const def = gaps.find(g => g.slot === 'DST')!;

        expect(def.weekly.pool).toBe('dst');
        expect(def.weekly.best?.player.sleeper_id).toBe((stream!.meta as any).defId);
        expect(def.weekly.best?.rank).toBe((stream!.meta as any).rank);
        expect(def.weekly.myRank).toBe((stream!.meta as any).myRank);
        expect(def.weekly.best?.player.sleeper_id).not.toBe('DEF_LAC'); // started → excluded in both
    });

    it('K: same best available kicker and the same ranks', () => {
        const KR = [
            { sleeper_id: 'k_best', rank: 2, name: 'Best K', team: 'BUF', tier: 1, score: null, opponent: 'AAA' },
            { sleeper_id: 'k_mine', rank: 20, name: 'My K', team: 'NYG', tier: 3, score: null, opponent: 'BBB' },
            { sleeper_id: 'k_rost', rank: 1, name: 'Rostered K', team: 'KC', tier: 1, score: null, opponent: 'CCC' },
        ];
        const my = team('1', [P({ sleeper_id: 'qb1', position: 'QB', is_starter: true }), P({ sleeper_id: 'k_mine', position: 'K', team: 'NYG', is_starter: true })]);
        const opp = team('2', [P({ sleeper_id: 'k_rost', position: 'K', team: 'KC' })]);
        const positions = ['QB', 'K', 'BN'];
        const lg: PortfolioLeague = {
            platform: 'sleeper', leagueId: 'L1', name: 'T', format: '1qb', leagueType: 'dynasty',
            teams: [my, opp], freeAgents: [], rosterPositions: positions, weeklyWeek: 12,
        };
        // Kicker streams are per-league actions (not in the cross-league Action Center).
        const stream = buildLeagueActions({
            league: lg, myRosterId: '1',
            kickerRankings: KR.map(k => ({ sleeper_id: k.sleeper_id, rank: k.rank, score: null, opponent: k.opponent, name: k.name, team: k.team })),
        }).find(i => i.kind === 'stream-k');
        expect(stream).toBeDefined();

        const rankOf = new Map(KR.map(k => [k.sleeper_id, k.rank]));
        const rostered = new Set(lg.teams.flatMap(t => t.players.map(p => p.sleeper_id)));
        const fas = kickerCandidates(KR, rostered).map(c => P({ ...c, weeklyRank: rankOf.get(c.sleeper_id) ?? null }) as PortfolioPlayer);
        const roster = my.players.map(p => ({ ...p, weeklyRank: p.position === 'K' ? rankOf.get(p.sleeper_id) ?? null : null }));
        const gaps = computeSlotGaps({ roster, freeAgents: fas, rosterPositions: positions });
        const k = gaps.find(g => g.slot === 'K')!;

        expect(k.weekly.best?.player.sleeper_id).toBe((stream!.meta as any).kickerId);
        expect(k.weekly.best?.rank).toBe((stream!.meta as any).rank);
        expect(k.weekly.myRank).toBe((stream!.meta as any).myRank);
    });
});
