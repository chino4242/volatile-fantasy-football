import { getFleaflickerLeague, getFleaflickerRosterSlots } from '@/lib/fleaflicker';
import { db } from '@/db';
import { players, playerValues, prospectData, prospectWriteups, leagues } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';
import MockDraftClient from '@/app/fleaflicker/[leagueId]/mock-draft/MockDraftClient';
import { getRankingsVintage, formatVintage } from '@/lib/rankings-vintage';

export default async function FleaflickerLiveDraftPage({
    params,
    searchParams
}: {
    params: Promise<{ leagueId: string }>;
    searchParams: Promise<{ format?: string; keepers?: string }>;
}) {
    const { leagueId } = await params;
    const { format: formatParam, keepers: keepersParam } = await searchParams;
    let format = (formatParam === 'sf' || formatParam === '1qb') ? formatParam as '1qb' | 'sf' : undefined;
    let keeperCount = keepersParam ? parseInt(keepersParam) : undefined;
    if (!format || !keeperCount) {
        const leagueData = await db.select({ keeper_count: leagues.keeper_count, league_type: leagues.league_type, scoring_format: leagues.scoring_format }).from(leagues).where(eq(leagues.league_id, leagueId)).limit(1);
        if (!format && leagueData[0]?.scoring_format) format = leagueData[0].scoring_format as '1qb' | 'sf';
        if (!keeperCount && leagueData[0]?.league_type === 'keeper' && leagueData[0]?.keeper_count) keeperCount = leagueData[0].keeper_count;
    }
    if (!format) format = 'sf';
    const sf = format === 'sf';

    const [leagueData, rosterSlots] = await Promise.all([
        getFleaflickerLeague(leagueId),
        getFleaflickerRosterSlots(leagueId),
    ]);

    const normalizeName = (name: string) =>
        name.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '').replace(/\s+/g, ' ').trim();

    const rosteredPlayerNames = new Set<string>();
    leagueData.rosters.forEach(roster => { roster.players.forEach(p => { if (p.full_name) rosteredPlayerNames.add(normalizeName(p.full_name)); }); });

    const allPlayersData = await db
        .select({ id: players.sleeper_id, full_name: players.full_name, position: players.position, team: players.team, years_exp: players.years_exp, fc_value: sf ? playerValues.fc_value_sf : playerValues.fc_value_1qb, fc_rank_sf: playerValues.fc_rank_sf, fc_rank_1qb: playerValues.fc_rank_1qb, fc_position_rank_sf: playerValues.fc_position_rank_sf, fc_position_rank_1qb: playerValues.fc_position_rank_1qb, fc_combined_value: playerValues.fc_combined_value, fc_trend_30_day: playerValues.fc_trend_30_day, fc_trade_frequency: playerValues.fc_trade_frequency, rank_sf_overall: playerValues.rank_sf_overall, rank_1qb_overall: playerValues.rank_1qb_overall, rank_sf_pos: playerValues.rank_sf_pos, rank_1qb_pos: playerValues.rank_1qb_pos, rank_sf_tier: playerValues.rank_sf_tier, rank_1qb_tier: playerValues.rank_1qb_tier })
        .from(players).leftJoin(playerValues, eq(players.sleeper_id, playerValues.sleeper_id))
        .where(sql`${players.position} IN ('QB', 'RB', 'WR', 'TE')`)
        .orderBy(sf ? playerValues.fc_value_sf : playerValues.fc_value_1qb);

    const currentYear = new Date().getFullYear();
    const prospects = await db.select({ full_name: prospectData.full_name, zap_score: prospectData.zap_score, zap_category: prospectData.zap_category, is_year_2: prospectData.is_year_2, statistical_comparables: prospectData.statistical_comparables, analysis_text: prospectData.analysis_text, rookie_rank: prospectData.rookie_rank, rookie_pos_rank: prospectData.rookie_pos_rank, rookie_tier: prospectData.rookie_tier })
        .from(prospectData).where(sql`${prospectData.draft_year} >= ${currentYear - 1}`);
    const zapByName = new Map<string, typeof prospects[number]>();
    for (const p of prospects) { const key = normalizeName(p.full_name); const existing = zapByName.get(key); if (!existing || (p.is_year_2 && !existing.is_year_2)) zapByName.set(key, p); }

    const allPlayersWithZap = allPlayersData.map(p => {
        const zap = zapByName.get(normalizeName(p.full_name));
        if (!zap) return { ...p, zap_score: null, zap_category: null, zap_stale: false, zap_comps: null, zap_analysis: null, rookie_rank: null, rookie_pos_rank: null, rookie_tier: null, writeups: null };
        const score = parseFloat(zap.zap_score || '0'); const isRookie = p.years_exp === 0; const stale = !isRookie && !zap.is_year_2;
        return { ...p, zap_score: score, zap_category: zap.zap_category || null, zap_stale: stale, zap_comps: zap.statistical_comparables || null, zap_analysis: zap.analysis_text || null, rookie_rank: zap.rookie_rank, rookie_pos_rank: zap.rookie_pos_rank, rookie_tier: zap.rookie_tier, writeups: null as { source: string; analysis_text: string }[] | null };
    });

    const writeups = await db.select({ full_name: prospectWriteups.full_name, source: prospectWriteups.source, analysis_text: prospectWriteups.analysis_text })
        .from(prospectWriteups).where(sql`${prospectWriteups.draft_year} >= ${currentYear - 1}`);
    const writeupsByName = new Map<string, { source: string; analysis_text: string }[]>();
    for (const w of writeups) { const key = normalizeName(w.full_name); if (!writeupsByName.has(key)) writeupsByName.set(key, []); writeupsByName.get(key)!.push({ source: w.source, analysis_text: w.analysis_text }); }
    for (const p of allPlayersWithZap) { const w = writeupsByName.get(normalizeName(p.full_name)); if (w) (p as any).writeups = w; }

    const freeAgents = allPlayersWithZap.filter(p => !rosteredPlayerNames.has(normalizeName(p.full_name)));

    const teams = await Promise.all(leagueData.rosters.map(async (roster) => {
        const playersWithValues = roster.players.map(p => allPlayersWithZap.find(dbPlayer => normalizeName(dbPlayer.full_name) === normalizeName(p.full_name))).filter(Boolean) as typeof allPlayersWithZap;
        const positionValues = { QB: 0, RB: 0, WR: 0, TE: 0 };
        playersWithValues.forEach(p => { if (p.position && p.fc_value) positionValues[p.position as keyof typeof positionValues] += p.fc_value; });
        return { id: roster.id, name: roster.name, owner: roster.owners[0]?.display_name || 'Unknown', players: playersWithValues, positionValues, draftPicks: roster.draftPicks };
    }));

    const rankingsVintage = formatVintage(await getRankingsVintage(format as '1qb' | 'sf'));

    return (
        <MockDraftClient
            leagueId={leagueId}
            teams={teams}
            freeAgents={freeAgents}
            format={format}
            rankingsVintage={rankingsVintage}
            rosterSlots={rosterSlots}
            keeperCount={keeperCount}
            mode="live"
        />
    );
}
