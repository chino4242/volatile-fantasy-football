import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { getFleaflickerLeague } from '../src/lib/fleaflicker';
import { db } from '../src/db';
import { players, playerValues, customRankings, rankingSources } from '../src/db/schema';
import { eq, sql } from 'drizzle-orm';

async function main() {
    const league = await getFleaflickerLeague('197269');
    const currentYear = new Date().getFullYear();

    const allPlayersData = await db.select({
        sleeper_id: players.sleeper_id, full_name: players.full_name,
        position: players.position, team: players.team,
        fc_value_1qb: playerValues.fc_value_1qb, fc_rank_1qb: playerValues.fc_rank_1qb
    }).from(players).leftJoin(playerValues, eq(players.sleeper_id, playerValues.sleeper_id))
        .where(sql`${players.position} IN ('QB', 'RB', 'WR', 'TE')`);

    const lrSource = await db.select().from(rankingSources)
        .where(eq(rankingSources.name, 'late_round_2026')).limit(1);
    const lrMap = new Map<string, { rank: number | null; signal: string | null; tier: number | null; ms: number | null }>();
    if (lrSource.length > 0) {
        const lrRankings = await db.select({ sleeper_id: customRankings.sleeper_id, rank: customRankings.rank, signal: customRankings.signal, notes: customRankings.notes })
            .from(customRankings).where(eq(customRankings.source_id, lrSource[0].id));
        for (const r of lrRankings) {
            if (r.sleeper_id) {
                const t = r.notes?.match(/Tier\s+(\d+)/);
                const m = r.notes?.match(/Market Score:\s*([\d.]+)/);
                lrMap.set(r.sleeper_id, { rank: r.rank, signal: r.signal, tier: t ? parseInt(t[1]) : null, ms: m ? parseFloat(m[1]) : null });
            }
        }
    }

    const norm = (n: string) => n.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '').replace(/\s+/g, ' ').trim();
    const playerMap = new Map(allPlayersData.map(p => [norm(p.full_name), p]));

    const enrich = (p: any) => {
        const dbP = playerMap.get(norm(p.full_name));
        const lr = dbP ? lrMap.get(dbP.sleeper_id) : null;
        return { name: p.full_name, position: dbP?.position || '?', team: dbP?.team || '?', fc_value: dbP?.fc_value_1qb || 0, lr_rank: lr?.rank, lr_tier: lr?.tier, lr_ms: lr?.ms, lr_signal: lr?.signal };
    };

    for (const ownerName of ['TBoire2113', 'NateVieira']) {
        const roster = league.rosters.find(r => r.owners[0]?.display_name === ownerName)!;
        const all = roster.players.map(enrich).sort((a, b) => b.fc_value - a.fc_value);
        const keepers = all.slice(0, 10);
        const cuts = all.slice(10);
        const posCount: Record<string, number> = {};
        keepers.forEach(p => { posCount[p.position] = (posCount[p.position] || 0) + 1; });
        const thisPicks = roster.draftPicks.filter(p => p.season === currentYear).sort((a, b) => a.round - b.round || a.slot - b.slot);
        const futurePicks = roster.draftPicks.filter(p => p.season > currentYear && p.round <= 5).sort((a, b) => a.season - b.season || a.round - b.round);

        console.log(`\n${'='.repeat(60)}`);
        console.log(`=== ${ownerName} (${roster.name}) ===`);
        console.log(`Total picks: ${roster.draftPicks.length} | Positions: QB:${posCount.QB||0} RB:${posCount.RB||0} WR:${posCount.WR||0} TE:${posCount.TE||0}`);

        console.log('\nKEEPERS:');
        keepers.forEach((p, i) => {
            const lr = p.lr_rank ? `LR#${p.lr_rank} T${p.lr_tier}${p.lr_ms ? ' MS' + p.lr_ms.toFixed(0) : ''}${p.lr_signal ? ' ' + p.lr_signal : ''}` : 'No LR data';
            console.log(`  ${i + 1}. ${p.name.padEnd(25)} ${p.position.padEnd(3)} ${p.team.padEnd(4)} Val:${String(p.fc_value).padStart(5)}  ${lr}`);
        });

        console.log('\nCUTS:');
        cuts.filter(p => p.fc_value > 0).forEach((p, i) => {
            const lr = p.lr_rank ? `LR#${p.lr_rank} T${p.lr_tier}` : '';
            console.log(`  ${i + 1}. ${p.name.padEnd(25)} ${p.position.padEnd(3)} ${p.team.padEnd(4)} Val:${String(p.fc_value).padStart(5)}  ${lr}`);
        });

        console.log('\nTHIS YEAR PICKS (rounds 1-6):');
        thisPicks.filter(p => p.round <= 6).forEach(p => {
            const orig = p.originalOwner !== roster.id ? ` (from ${league.rosters.find(r => r.id === p.originalOwner)?.owners[0]?.display_name || '?'})` : '';
            console.log(`    ${p.round}.${String(p.slot).padStart(2, '0')} (Overall ${p.overall})${orig}`);
        });

        console.log('\nFUTURE PICKS (R1-5):');
        futurePicks.forEach(p => {
            const orig = p.originalOwner !== roster.id ? ` (from ${league.rosters.find(r => r.id === p.originalOwner)?.owners[0]?.display_name || '?'})` : '';
            console.log(`    ${p.season} R${p.round}${orig}`);
        });
    }

    process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
