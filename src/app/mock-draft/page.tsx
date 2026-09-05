import { db } from '@/db';
import { players, playerValues, prospectData, prospectWriteups } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';
import { getRankingsVintage, formatVintage } from '@/lib/rankings-vintage';
import GenericMockDraftSetup from './GenericMockDraftSetup';

export const dynamic = 'force-dynamic';

export default async function GenericMockDraftPage({ searchParams }: { searchParams: Promise<{ format?: string }> }) {
    const { format: formatParam } = await searchParams;
    const format = (formatParam === '1qb' ? '1qb' : 'sf') as '1qb' | 'sf';
    const sf = format === 'sf';

    // Fetch all players with values (rookies for rookie draft)
    const allPlayers = await db
        .select({
            id: players.sleeper_id,
            full_name: players.full_name,
            position: players.position,
            team: players.team,
            years_exp: players.years_exp,
            fc_value: sf ? playerValues.fc_value_sf : playerValues.fc_value_1qb,
            fc_rank_sf: playerValues.fc_rank_sf,
            fc_rank_1qb: playerValues.fc_rank_1qb,
            fc_position_rank_sf: playerValues.fc_position_rank_sf,
            fc_position_rank_1qb: playerValues.fc_position_rank_1qb,
            fc_combined_value: playerValues.fc_combined_value,
            fc_trend_30_day: playerValues.fc_trend_30_day,
            fc_trade_frequency: playerValues.fc_trade_frequency,
            rank_sf_overall: playerValues.rank_sf_overall,
            rank_1qb_overall: playerValues.rank_1qb_overall,
            rank_sf_pos: playerValues.rank_sf_pos,
            rank_1qb_pos: playerValues.rank_1qb_pos,
            rank_sf_tier: playerValues.rank_sf_tier,
            rank_1qb_tier: playerValues.rank_1qb_tier,
            redraft_rank_overall: playerValues.redraft_rank_overall,
            redraft_rank_pos: playerValues.redraft_rank_pos,
            redraft_rank_tier: playerValues.redraft_rank_tier,
            redraft_auction_value: playerValues.redraft_auction_value,
        })
        .from(players)
        .leftJoin(playerValues, eq(players.sleeper_id, playerValues.sleeper_id))
        .where(sql`${players.position} IN ('QB', 'RB', 'WR', 'TE') AND ${sf ? playerValues.fc_value_sf : playerValues.fc_value_1qb} IS NOT NULL`)
        .orderBy(sf ? playerValues.fc_value_sf : playerValues.fc_value_1qb);

    // Prospect data
    const currentYear = new Date().getFullYear();
    const prospects = await db.select({
        full_name: prospectData.full_name,
        nfl_team: prospectData.nfl_team,
        zap_score: prospectData.zap_score,
        zap_category: prospectData.zap_category,
        is_year_2: prospectData.is_year_2,
        statistical_comparables: prospectData.statistical_comparables,
        analysis_text: prospectData.analysis_text,
        rookie_rank: prospectData.rookie_rank,
        rookie_pos_rank: prospectData.rookie_pos_rank,
        rookie_tier: prospectData.rookie_tier,
        ai_confidence: prospectData.ai_confidence,
        ai_summary: prospectData.ai_summary,
        ai_bull_case: prospectData.ai_bull_case,
        ai_bear_case: prospectData.ai_bear_case,
        ai_comps: prospectData.ai_comps,
    }).from(prospectData).where(sql`${prospectData.draft_year} >= ${currentYear - 1}`);

    const writeups = await db.select({
        full_name: prospectWriteups.full_name,
        source: prospectWriteups.source,
        analysis_text: prospectWriteups.analysis_text,
        ai_confidence: prospectWriteups.ai_confidence,
        ai_summary: prospectWriteups.ai_summary,
        ai_bull_case: prospectWriteups.ai_bull_case,
        ai_bear_case: prospectWriteups.ai_bear_case,
        ai_comps: prospectWriteups.ai_comps,
    }).from(prospectWriteups).where(sql`${prospectWriteups.draft_year} >= ${currentYear - 1}`);

    // Merge prospect data
    const normName = (n: string) => n.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
    const zapMap = new Map(prospects.map(p => [normName(p.full_name), p]));
    const writeupMap = new Map<string, typeof writeups>();
    writeups.forEach(w => {
        const key = normName(w.full_name);
        if (!writeupMap.has(key)) writeupMap.set(key, []);
        writeupMap.get(key)!.push(w);
    });

    const enrichedPlayers = allPlayers.map(p => {
        const zap = zapMap.get(normName(p.full_name));
        const w = writeupMap.get(normName(p.full_name)) || null;
        return {
            ...p,
            zap_score: zap ? parseFloat(zap.zap_score || '0') : null,
            zap_category: zap?.zap_category || null,
            zap_stale: false,
            zap_comps: zap?.statistical_comparables || null,
            zap_analysis: zap?.analysis_text || null,
            zap_nfl_team: zap?.nfl_team || null,
            zap_ai: zap?.ai_summary ? { confidence: zap.ai_confidence, summary: zap.ai_summary, bull_case: zap.ai_bull_case, bear_case: zap.ai_bear_case, comps: zap.ai_comps } : null,
            rookie_rank: zap?.rookie_rank || null,
            rookie_pos_rank: zap?.rookie_pos_rank || null,
            rookie_tier: zap?.rookie_tier || null,
            writeups: w,
        };
    });

    const [rankingsVintage, redraftVintage] = await Promise.all([
        getRankingsVintage(format).then(formatVintage),
        getRankingsVintage('redraft').then(formatVintage),
    ]);

    const rookiePlayers = enrichedPlayers.filter(p => p.years_exp === 0);

    return <GenericMockDraftSetup players={rookiePlayers} allPlayers={enrichedPlayers} format={format} rankingsVintage={rankingsVintage} redraftVintage={redraftVintage} />;
}
