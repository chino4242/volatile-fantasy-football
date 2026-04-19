import { db } from '@/db';
import { players, playerValues, prospectData, prospectWriteups, leagues } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';
import { getFleaflickerLeague, getFleaflickerRosterSlots } from '@/lib/fleaflicker';
import { getRankingsVintage, formatVintage } from '@/lib/rankings-vintage';

const normalizeName = (name: string) =>
    name.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '').replace(/\s+/g, ' ').trim();

export async function getFleaflickerDraftData(leagueId: string, formatParam?: string, keepersParam?: string) {
    let format = (formatParam === 'sf' || formatParam === '1qb') ? formatParam as '1qb' | 'sf' : undefined;
    let keeperCount = keepersParam ? parseInt(keepersParam) : undefined;
    if (!format || !keeperCount) {
        const ld = await db.select({ keeper_count: leagues.keeper_count, league_type: leagues.league_type, scoring_format: leagues.scoring_format }).from(leagues).where(eq(leagues.league_id, leagueId)).limit(1);
        if (!format && ld[0]?.scoring_format) format = ld[0].scoring_format as '1qb' | 'sf';
        if (!keeperCount && ld[0]?.league_type === 'keeper' && ld[0]?.keeper_count) keeperCount = ld[0].keeper_count;
    }
    if (!format) format = 'sf';
    const sf = format === 'sf';

    const [leagueData, rosterSlots] = await Promise.all([
        getFleaflickerLeague(leagueId),
        getFleaflickerRosterSlots(leagueId),
    ]);

    const rosteredPlayerNames = new Set<string>();
    leagueData.rosters.forEach(r => r.players.forEach(p => { if (p.full_name) rosteredPlayerNames.add(normalizeName(p.full_name)); }));

    const allPlayersData = await db
        .select({ id: players.sleeper_id, full_name: players.full_name, position: players.position, team: players.team, years_exp: players.years_exp, fc_value: sf ? playerValues.fc_value_sf : playerValues.fc_value_1qb, fc_rank_sf: playerValues.fc_rank_sf, fc_rank_1qb: playerValues.fc_rank_1qb, fc_position_rank_sf: playerValues.fc_position_rank_sf, fc_position_rank_1qb: playerValues.fc_position_rank_1qb, fc_combined_value: playerValues.fc_combined_value, fc_trend_30_day: playerValues.fc_trend_30_day, fc_trade_frequency: playerValues.fc_trade_frequency, rank_sf_overall: playerValues.rank_sf_overall, rank_1qb_overall: playerValues.rank_1qb_overall, rank_sf_pos: playerValues.rank_sf_pos, rank_1qb_pos: playerValues.rank_1qb_pos, rank_sf_tier: playerValues.rank_sf_tier, rank_1qb_tier: playerValues.rank_1qb_tier })
        .from(players).leftJoin(playerValues, eq(players.sleeper_id, playerValues.sleeper_id))
        .where(sql`${players.position} IN ('QB', 'RB', 'WR', 'TE')`)
        .orderBy(sf ? playerValues.fc_value_sf : playerValues.fc_value_1qb);

    const currentYear = new Date().getFullYear();
    const prospects = await db.select({ full_name: prospectData.full_name, zap_score: prospectData.zap_score, zap_category: prospectData.zap_category, is_year_2: prospectData.is_year_2, statistical_comparables: prospectData.statistical_comparables, analysis_text: prospectData.analysis_text, rookie_rank: prospectData.rookie_rank, rookie_pos_rank: prospectData.rookie_pos_rank, rookie_tier: prospectData.rookie_tier }).from(prospectData).where(sql`${prospectData.draft_year} >= ${currentYear - 1}`);
    const zapByName = new Map<string, typeof prospects[number]>();
    for (const p of prospects) { const key = normalizeName(p.full_name); const existing = zapByName.get(key); if (!existing || (p.is_year_2 && !existing.is_year_2)) zapByName.set(key, p); }

    const allPlayersWithZap = allPlayersData.map(p => {
        const zap = zapByName.get(normalizeName(p.full_name));
        if (!zap) return { ...p, zap_score: null, zap_category: null, zap_stale: false, zap_comps: null, zap_analysis: null, rookie_rank: null, rookie_pos_rank: null, rookie_tier: null, writeups: null };
        const score = parseFloat(zap.zap_score || '0'); const isRookie = p.years_exp === 0; const stale = !isRookie && !zap.is_year_2;
        return { ...p, zap_score: score, zap_category: zap.zap_category || null, zap_stale: stale, zap_comps: zap.statistical_comparables || null, zap_analysis: zap.analysis_text || null, rookie_rank: zap.rookie_rank, rookie_pos_rank: zap.rookie_pos_rank, rookie_tier: zap.rookie_tier, writeups: null as { source: string; analysis_text: string }[] | null };
    });

    const writeups = await db.select({ full_name: prospectWriteups.full_name, source: prospectWriteups.source, analysis_text: prospectWriteups.analysis_text }).from(prospectWriteups).where(sql`${prospectWriteups.draft_year} >= ${currentYear - 1}`);
    const writeupsByName = new Map<string, { source: string; analysis_text: string }[]>();
    for (const w of writeups) { const key = normalizeName(w.full_name); if (!writeupsByName.has(key)) writeupsByName.set(key, []); writeupsByName.get(key)!.push({ source: w.source, analysis_text: w.analysis_text }); }
    for (const p of allPlayersWithZap) { const w = writeupsByName.get(normalizeName(p.full_name)); if (w) (p as any).writeups = w; }

    const freeAgents = allPlayersWithZap.filter(p => !rosteredPlayerNames.has(normalizeName(p.full_name)));

    const teams = await Promise.all(leagueData.rosters.map(async (roster) => {
        const playersWithValues = roster.players.map(p => allPlayersWithZap.find(dbP => normalizeName(dbP.full_name) === normalizeName(p.full_name))).filter(Boolean) as typeof allPlayersWithZap;
        const positionValues = { QB: 0, RB: 0, WR: 0, TE: 0 };
        playersWithValues.forEach(p => { if (p.position && p.fc_value) positionValues[p.position as keyof typeof positionValues] += p.fc_value; });
        return { id: roster.id, name: roster.name, owner: roster.owners[0]?.display_name || 'Unknown', players: playersWithValues, positionValues, draftPicks: roster.draftPicks };
    }));

    const rankingsVintage = formatVintage(await getRankingsVintage(format as '1qb' | 'sf'));

    return { teams, freeAgents, format, rankingsVintage, rosterSlots, keeperCount };
}

import { getLeagueData, getAllDraftPicks, getDraftTradedPicks, getCurrentSeasonDraft, type SleeperTradedPick } from '@/lib/sleeper';
import { inArray, and, notInArray, not, like, desc } from 'drizzle-orm';

export async function getSleeperDraftData(leagueId: string, formatParam?: string, keepersParam?: string) {
    let format = (formatParam === 'sf' || formatParam === '1qb') ? formatParam as '1qb' | 'sf' : undefined;
    let keeperCount = keepersParam ? parseInt(keepersParam) : undefined;
    if (!format || !keeperCount) {
        const ld = await db.select({ keeper_count: leagues.keeper_count, league_type: leagues.league_type, scoring_format: leagues.scoring_format }).from(leagues).where(eq(leagues.league_id, leagueId)).limit(1);
        if (!format && ld[0]?.scoring_format) format = ld[0].scoring_format as '1qb' | 'sf';
        if (!keeperCount && ld[0]?.league_type === 'keeper' && ld[0]?.keeper_count) keeperCount = ld[0].keeper_count;
    }
    if (!format) format = 'sf';
    const sf = format === 'sf';

    const { users, rosters, tradedPicks } = await getLeagueData(leagueId);
    const draftResult = await getCurrentSeasonDraft(leagueId);
    const draft = draftResult?.draft || null;

    const currentSeasonTradedPicks = draftResult && draftResult.leagueId !== leagueId
        ? await (await fetch(`https://api.sleeper.app/v1/league/${draftResult.leagueId}/traded_picks`)).json() as SleeperTradedPick[]
        : tradedPicks;
    const allPicks = getAllDraftPicks(rosters, currentSeasonTradedPicks);

    let slotToRoster: Record<number, number> = {};
    if (draft?.slot_to_roster_id) {
        for (const [slot, rosterId] of Object.entries(draft.slot_to_roster_id)) slotToRoster[Number(slot)] = rosterId;
    } else if (draft?.draft_order) {
        for (const [userId, slot] of Object.entries(draft.draft_order as Record<string, number>)) { const r = rosters.find(r => r.owner_id === userId); if (r) slotToRoster[slot] = r.roster_id; }
    } else {
        rosters.forEach((r, i) => { slotToRoster[i + 1] = r.roster_id; });
    }
    const rosterToSlot: Record<number, number> = {};
    for (const [slot, rosterId] of Object.entries(slotToRoster)) rosterToSlot[rosterId] = Number(slot);

    const draftTradedPicks = draft ? await getDraftTradedPicks(draft.draft_id) : [];
    const numTeams = Object.keys(slotToRoster).length || rosters.length;
    const rounds = draft?.settings?.rounds || 5;
    const isSnake = draft?.type === 'snake';

    type MockPick = { season: number; round: number; slot: number; overall: number; originalOwner: number; currentOwner: number };
    const draftBoard: MockPick[] = [];
    for (let round = 1; round <= rounds; round++) {
        for (let slot = 1; slot <= numTeams; slot++) {
            const effectiveSlot = (isSnake && round % 2 === 0) ? (numTeams - slot + 1) : slot;
            const originalRosterId = slotToRoster[effectiveSlot];
            if (!originalRosterId) continue;
            draftBoard.push({ season: Number(draft?.season || new Date().getFullYear()), round, slot, overall: (round - 1) * numTeams + slot, originalOwner: originalRosterId, currentOwner: originalRosterId });
        }
    }
    for (const tp of draftTradedPicks) { const pick = draftBoard.find(p => p.round === tp.round && p.originalOwner === tp.roster_id); if (pick) pick.currentOwner = tp.owner_id; }

    const allRosteredIds = rosters.flatMap(r => r.players || []);
    const valueCol = sf ? playerValues.fc_value_sf : playerValues.fc_value_1qb;
    const playerSelect = { id: players.sleeper_id, full_name: players.full_name, position: players.position, team: players.team, years_exp: players.years_exp, fc_value: valueCol, fc_rank_sf: playerValues.fc_rank_sf, fc_rank_1qb: playerValues.fc_rank_1qb, fc_position_rank_sf: playerValues.fc_position_rank_sf, fc_position_rank_1qb: playerValues.fc_position_rank_1qb, fc_combined_value: playerValues.fc_combined_value, fc_trend_30_day: playerValues.fc_trend_30_day, fc_trade_frequency: playerValues.fc_trade_frequency, rank_sf_overall: playerValues.rank_sf_overall, rank_1qb_overall: playerValues.rank_1qb_overall, rank_sf_pos: playerValues.rank_sf_pos, rank_1qb_pos: playerValues.rank_1qb_pos, rank_sf_tier: playerValues.rank_sf_tier, rank_1qb_tier: playerValues.rank_1qb_tier };

    const rosteredPlayers = allRosteredIds.length > 0 ? await db.select(playerSelect).from(players).leftJoin(playerValues, eq(players.sleeper_id, playerValues.sleeper_id)).where(inArray(players.sleeper_id, allRosteredIds)) : [];

    const currentYear = new Date().getFullYear();
    const prospects = await db.select({ full_name: prospectData.full_name, zap_score: prospectData.zap_score, zap_category: prospectData.zap_category, is_year_2: prospectData.is_year_2, statistical_comparables: prospectData.statistical_comparables, analysis_text: prospectData.analysis_text, rookie_rank: prospectData.rookie_rank, rookie_pos_rank: prospectData.rookie_pos_rank, rookie_tier: prospectData.rookie_tier }).from(prospectData).where(sql`${prospectData.draft_year} >= ${currentYear - 1}`);
    const zapByName = new Map<string, typeof prospects[number]>();
    for (const p of prospects) { const key = normalizeName(p.full_name); const existing = zapByName.get(key); if (!existing || (p.is_year_2 && !existing.is_year_2)) zapByName.set(key, p); }
    const writeups = await db.select({ full_name: prospectWriteups.full_name, source: prospectWriteups.source, analysis_text: prospectWriteups.analysis_text }).from(prospectWriteups).where(sql`${prospectWriteups.draft_year} >= ${currentYear - 1}`);
    const writeupsByName = new Map<string, { source: string; analysis_text: string }[]>();
    for (const w of writeups) { const key = normalizeName(w.full_name); if (!writeupsByName.has(key)) writeupsByName.set(key, []); writeupsByName.get(key)!.push({ source: w.source, analysis_text: w.analysis_text }); }

    const addZap = <T extends { full_name: string; years_exp?: number | null }>(p: T) => {
        const zap = zapByName.get(normalizeName(p.full_name)); const w = writeupsByName.get(normalizeName(p.full_name)) || null;
        if (!zap) return { ...p, zap_score: null, zap_category: null, zap_stale: false, zap_comps: null, zap_analysis: null, rookie_rank: null, rookie_pos_rank: null, rookie_tier: null, writeups: w };
        const score = parseFloat(zap.zap_score || '0'); const isRookie = p.years_exp === 0; const stale = !isRookie && !zap.is_year_2;
        return { ...p, zap_score: score, zap_category: zap.zap_category || null, zap_stale: stale, zap_comps: zap.statistical_comparables || null, zap_analysis: zap.analysis_text || null, rookie_rank: zap.rookie_rank, rookie_pos_rank: zap.rookie_pos_rank, rookie_tier: zap.rookie_tier, writeups: w };
    };

    const rosteredPlayersWithZap = rosteredPlayers.map(addZap);
    const playerMap = new Map(rosteredPlayersWithZap.map(p => [p.id, p]));
    const excludeIds = allRosteredIds.length > 0 ? allRosteredIds : ['dummy'];
    const freeAgents = await db.select(playerSelect).from(players).leftJoin(playerValues, eq(players.sleeper_id, playerValues.sleeper_id)).where(and(notInArray(players.sleeper_id, excludeIds), not(like(players.sleeper_id, '%pick%')), inArray(players.position, ['QB', 'RB', 'WR', 'TE']))).orderBy(desc(valueCol)).limit(300);
    const freeAgentsWithZap = freeAgents.map(addZap);

    const teams = rosters.map(roster => {
        const owner = users.find(u => u.user_id === roster.owner_id);
        const rosterPlayers = (roster.players || []).map(pid => playerMap.get(pid)).filter(Boolean) as typeof rosteredPlayersWithZap;
        const positionValues = { QB: 0, RB: 0, WR: 0, TE: 0 };
        rosterPlayers.forEach(p => { if (p.position && p.fc_value) positionValues[p.position as keyof typeof positionValues] += p.fc_value; });
        const currentYearPicks = draftBoard.filter(p => p.currentOwner === roster.roster_id);
        const futurePicks = allPicks.filter(p => p.currentOwner === roster.roster_id && Number(p.season) > Number(draft?.season || new Date().getFullYear())).map(p => ({ season: Number(p.season), round: p.round, slot: rosterToSlot[p.originalOwner] || 0, overall: 0, originalOwner: p.originalOwner, currentOwner: p.currentOwner }));
        return { id: roster.roster_id, name: owner?.display_name || `Team ${roster.roster_id}`, owner: owner?.display_name || 'Unknown', players: rosterPlayers, positionValues, draftPicks: [...currentYearPicks, ...futurePicks] };
    });

    const rankingsVintage = formatVintage(await getRankingsVintage(format as '1qb' | 'sf'));

    return { teams, freeAgents: freeAgentsWithZap, format, rankingsVintage, keeperCount };
}
