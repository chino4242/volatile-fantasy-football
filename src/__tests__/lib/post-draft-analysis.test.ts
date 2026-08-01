import { describe, it, expect } from 'vitest';
import { analyzeLeaguePostDraft, type PlayerForAnalysis } from '@/lib/post-draft-analysis';

let nextId = 1;
function makePlayer(overrides: Partial<PlayerForAnalysis> & { id?: string }): PlayerForAnalysis {
    return {
        id: overrides.id || `player-${nextId++}`,
        full_name: 'Test Player',
        position: 'WR',
        fc_value: 5000,
        years_exp: 3,
        lr_rank: null,
        lr_tier: null,
        lr_market_score: null,
        lr_signal: null,
        zap_score: null,
        zap_category: null,
        ...overrides,
    };
}

/**
 * Build a customRankingsMap entry for a player with a given tier.
 */
function makeRankingsMap(players: Array<{ id: string; tier: number | null; signal?: string | null }>) {
    const map: Record<string, { rank: number | null; signal: string | null; notes: string | null; source: string; marketScore: number | null; tier: number | null }[]> = {};
    for (const p of players) {
        map[p.id] = [{ rank: p.tier ? p.tier * 3 : null, signal: p.signal ?? null, notes: null, source: 'Late Round 2025', marketScore: 60, tier: p.tier }];
    }
    return map;
}

function makeEliteTeam(teamId: number, name: string) {
    const players = [
        makePlayer({ id: 'elite-qb', full_name: 'Josh Allen', position: 'QB', fc_value: 9000 }),
        makePlayer({ id: 'elite-rb1', full_name: 'Saquon Barkley', position: 'RB', fc_value: 9500 }),
        makePlayer({ id: 'elite-rb2', full_name: 'Bijan Robinson', position: 'RB', fc_value: 9200 }),
        makePlayer({ id: 'elite-rb3', full_name: 'Breece Hall', position: 'RB', fc_value: 7000 }),
        makePlayer({ id: 'elite-wr1', full_name: 'CeeDee Lamb', position: 'WR', fc_value: 9800 }),
        makePlayer({ id: 'elite-wr2', full_name: "Ja'Marr Chase", position: 'WR', fc_value: 9600 }),
        makePlayer({ id: 'elite-wr3', full_name: 'Amon-Ra St. Brown', position: 'WR', fc_value: 8800 }),
        makePlayer({ id: 'elite-wr4', full_name: 'Drake London', position: 'WR', fc_value: 7500 }),
        makePlayer({ id: 'elite-te', full_name: 'Sam LaPorta', position: 'TE', fc_value: 7000 }),
    ];
    const rankingsMap = makeRankingsMap([
        { id: 'elite-qb', tier: 2 },
        { id: 'elite-rb1', tier: 1 },
        { id: 'elite-rb2', tier: 2 },
        { id: 'elite-rb3', tier: 5 },
        { id: 'elite-wr1', tier: 1 },
        { id: 'elite-wr2', tier: 2 },
        { id: 'elite-wr3', tier: 3 },
        { id: 'elite-wr4', tier: 7 },
        { id: 'elite-te', tier: 3 },
    ]);
    return { team: { id: teamId, name, players }, rankingsMap };
}

function makeWeakTeam(teamId: number, name: string) {
    const players = [
        makePlayer({ id: 'weak-qb', full_name: 'Derek Carr', position: 'QB', fc_value: 2000 }),
        makePlayer({ id: 'weak-rb1', full_name: "D'Onta Foreman", position: 'RB', fc_value: 800 }),
        makePlayer({ id: 'weak-rb2', full_name: 'Samaje Perine', position: 'RB', fc_value: 500 }),
        makePlayer({ id: 'weak-wr1', full_name: 'Jahan Dotson', position: 'WR', fc_value: 1200 }),
        makePlayer({ id: 'weak-wr2', full_name: 'Darnell Mooney', position: 'WR', fc_value: 1500 }),
        makePlayer({ id: 'weak-wr3', full_name: 'Rashod Bateman', position: 'WR', fc_value: 1000 }),
        makePlayer({ id: 'weak-te', full_name: 'Hayden Hurst', position: 'TE', fc_value: 900 }),
    ];
    const rankingsMap = makeRankingsMap([
        { id: 'weak-qb', tier: 22 },
        { id: 'weak-rb1', tier: 28 },
        { id: 'weak-rb2', tier: 30 },
        { id: 'weak-wr1', tier: 24 },
        { id: 'weak-wr2', tier: 22 },
        { id: 'weak-wr3', tier: 26 },
        { id: 'weak-te', tier: 20 },
    ]);
    return { team: { id: teamId, name, players }, rankingsMap };
}

function mergeRankingsMaps(...maps: Record<string, any>[]) {
    return Object.assign({}, ...maps);
}

describe('analyzeLeaguePostDraft', () => {
    it('gives an elite team a high grade (A or A+)', () => {
        const { team, rankingsMap } = makeEliteTeam(1, 'Team Alpha');
        const results = analyzeLeaguePostDraft([team], rankingsMap);
        expect(results).toHaveLength(1);
        expect(['A+', 'A', 'A-']).toContain(results[0].overallGrade);
        expect(results[0].overallScore).toBeGreaterThan(50);
    });

    it('gives a weak team low position grades', () => {
        const { team, rankingsMap } = makeWeakTeam(1, 'Team Weak');
        const results = analyzeLeaguePostDraft([team], rankingsMap);
        expect(results).toHaveLength(1);
        const posGrades = results[0].positionGrades;
        const rbGrade = posGrades.find(pg => pg.position === 'RB');
        expect(rbGrade).toBeDefined();
        // RB group with tier 28+ players should score poorly
        expect(rbGrade!.score).toBeLessThan(30);
    });

    it('reflects position group strength in position grades', () => {
        const players = [
            makePlayer({ id: 'pos-qb', full_name: 'Josh Allen', position: 'QB' }),
            makePlayer({ id: 'pos-rb1', full_name: 'Weak RB1', position: 'RB' }),
            makePlayer({ id: 'pos-rb2', full_name: 'Weak RB2', position: 'RB' }),
            makePlayer({ id: 'pos-wr1', full_name: 'CeeDee Lamb', position: 'WR' }),
            makePlayer({ id: 'pos-wr2', full_name: "Ja'Marr Chase", position: 'WR' }),
            makePlayer({ id: 'pos-wr3', full_name: 'Amon-Ra', position: 'WR' }),
            makePlayer({ id: 'pos-wr4', full_name: 'DK Metcalf', position: 'WR' }),
            makePlayer({ id: 'pos-te', full_name: 'Good TE', position: 'TE' }),
        ];
        const rankingsMap = makeRankingsMap([
            { id: 'pos-qb', tier: 5 },
            { id: 'pos-rb1', tier: 25 },
            { id: 'pos-rb2', tier: 28 },
            { id: 'pos-wr1', tier: 1 },
            { id: 'pos-wr2', tier: 2 },
            { id: 'pos-wr3', tier: 4 },
            { id: 'pos-wr4', tier: 7 },
            { id: 'pos-te', tier: 8 },
        ]);
        const team = { id: 1, name: 'WR-Heavy Team', players };
        const results = analyzeLeaguePostDraft([team], rankingsMap);
        const wrGrade = results[0].positionGrades.find(pg => pg.position === 'WR');
        const rbGrade = results[0].positionGrades.find(pg => pg.position === 'RB');
        expect(wrGrade!.score).toBeGreaterThan(rbGrade!.score);
    });

    it('handles empty team without crashing', () => {
        const team = { id: 1, name: 'Empty Team', players: [] as PlayerForAnalysis[] };
        const results = analyzeLeaguePostDraft([team]);
        expect(results).toHaveLength(1);
        expect(results[0].overallScore).toBe(0);
        expect(results[0].positionGrades).toHaveLength(4);
    });

    it('ranks two teams correctly (higher score = lower rank number)', () => {
        const elite = makeEliteTeam(1, 'Best Team');
        const weak = makeWeakTeam(2, 'Worst Team');
        const combinedMap = mergeRankingsMaps(elite.rankingsMap, weak.rankingsMap);
        const results = analyzeLeaguePostDraft([elite.team, weak.team], combinedMap);
        const bestTeam = results.find(r => r.teamName === 'Best Team')!;
        const worstTeam = results.find(r => r.teamName === 'Worst Team')!;
        expect(bestTeam.powerRank).toBe(1);
        expect(worstTeam.powerRank).toBe(2);
        expect(bestTeam.overallScore).toBeGreaterThan(worstTeam.overallScore);
    });

    it('assigns power ranks to multiple teams in descending score order', () => {
        const midPlayers = [
            makePlayer({ id: 'mid-qb', full_name: 'Mid QB', position: 'QB' }),
            makePlayer({ id: 'mid-rb1', full_name: 'Mid RB1', position: 'RB' }),
            makePlayer({ id: 'mid-rb2', full_name: 'Mid RB2', position: 'RB' }),
            makePlayer({ id: 'mid-wr1', full_name: 'Mid WR1', position: 'WR' }),
            makePlayer({ id: 'mid-wr2', full_name: 'Mid WR2', position: 'WR' }),
            makePlayer({ id: 'mid-wr3', full_name: 'Mid WR3', position: 'WR' }),
            makePlayer({ id: 'mid-te', full_name: 'Mid TE', position: 'TE' }),
        ];
        const midRankings = makeRankingsMap([
            { id: 'mid-qb', tier: 12 },
            { id: 'mid-rb1', tier: 10 },
            { id: 'mid-rb2', tier: 14 },
            { id: 'mid-wr1', tier: 11 },
            { id: 'mid-wr2', tier: 13 },
            { id: 'mid-wr3', tier: 15 },
            { id: 'mid-te', tier: 12 },
        ]);
        const midTeam = { id: 3, name: 'Mid Team', players: midPlayers };

        const elite = makeEliteTeam(1, 'Best');
        const weak = makeWeakTeam(2, 'Worst');
        const combinedMap = mergeRankingsMaps(elite.rankingsMap, weak.rankingsMap, midRankings);

        const results = analyzeLeaguePostDraft([weak.team, midTeam, elite.team], combinedMap);

        // Verify sorted by rank
        expect(results[0].powerRank).toBe(1);
        expect(results[1].powerRank).toBe(2);
        expect(results[2].powerRank).toBe(3);

        // Best should be first, Worst should be last
        expect(results[0].teamName).toBe('Best');
        expect(results[2].teamName).toBe('Worst');
    });
});
