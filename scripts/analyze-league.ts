import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { getFleaflickerLeague } from '../src/lib/fleaflicker';
import { db } from '../src/db';
import { players, playerValues, customRankings, rankingSources } from '../src/db/schema';
import { eq, sql } from 'drizzle-orm';

async function main() {
    const leagueId = '197269';
    const myTeamId = 1323356;

    const league = await getFleaflickerLeague(leagueId);
    
    // Fetch player values from DB
    const allPlayersData = await db
        .select({ 
            sleeper_id: players.sleeper_id, 
            full_name: players.full_name, 
            position: players.position,
            team: players.team,
            fc_value_1qb: playerValues.fc_value_1qb,
            fc_rank_1qb: playerValues.fc_rank_1qb,
        })
        .from(players)
        .leftJoin(playerValues, eq(players.sleeper_id, playerValues.sleeper_id))
        .where(sql`${players.position} IN ('QB', 'RB', 'WR', 'TE')`);

    // Get Late Round rankings
    const lrSource = await db.select().from(rankingSources).where(eq(rankingSources.name, 'late_round_2026')).limit(1);
    let lrMap = new Map<string, { rank: number | null; signal: string | null; tier: number | null; ms: number | null }>();
    if (lrSource.length > 0) {
        const lrRankings = await db.select({ sleeper_id: customRankings.sleeper_id, rank: customRankings.rank, signal: customRankings.signal, notes: customRankings.notes })
            .from(customRankings).where(eq(customRankings.source_id, lrSource[0].id));
        for (const r of lrRankings) {
            if (r.sleeper_id) {
                const tierMatch = r.notes?.match(/Tier\s+(\d+)/);
                const msMatch = r.notes?.match(/Market Score:\s*([\d.]+)/);
                lrMap.set(r.sleeper_id, { rank: r.rank, signal: r.signal, tier: tierMatch ? parseInt(tierMatch[1]) : null, ms: msMatch ? parseFloat(msMatch[1]) : null });
            }
        }
    }

    const normalizeName = (name: string) => name.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '').replace(/\s+/g, ' ').trim();
    const playerMap = new Map(allPlayersData.map(p => [normalizeName(p.full_name), p]));

    // Analyze each team
    const teamAnalyses = league.rosters.map(roster => {
        const teamPlayers = roster.players.map(p => {
            const norm = normalizeName(p.full_name);
            const dbPlayer = playerMap.get(norm);
            const lr = dbPlayer ? lrMap.get(dbPlayer.sleeper_id) : null;
            return {
                name: p.full_name,
                position: dbPlayer?.position || '?',
                team: dbPlayer?.team || '?',
                fc_value: dbPlayer?.fc_value_1qb || 0,
                fc_rank: dbPlayer?.fc_rank_1qb || 999,
                lr_rank: lr?.rank || null,
                lr_tier: lr?.tier || null,
                lr_ms: lr?.ms || null,
                lr_signal: lr?.signal || null,
            };
        }).sort((a, b) => b.fc_value - a.fc_value);

        const keepers = teamPlayers.slice(0, 10);
        const cuts = teamPlayers.slice(10);
        const totalValue = keepers.reduce((s, p) => s + p.fc_value, 0);
        const valueDropped = cuts.reduce((s, p) => s + p.fc_value, 0);

        return {
            id: roster.id,
            name: roster.owners[0]?.display_name || 'Unknown',
            keepers,
            cuts,
            totalValue,
            valueDropped,
            draftPicks: roster.draftPicks || [],
        };
    });

    teamAnalyses.sort((a, b) => b.totalValue - a.totalValue);

    // Print my team
    const myTeam = teamAnalyses.find(t => t.id === myTeamId)!;
    console.log('=== MY TEAM: ' + myTeam.name + ' ===');
    console.log('Keeper Value:', myTeam.totalValue.toLocaleString());
    console.log('Value Dropped:', myTeam.valueDropped.toLocaleString());
    console.log('\nKEEPERS (top 10):');
    myTeam.keepers.forEach((p, i) => {
        const lr = p.lr_rank ? `LR#${p.lr_rank} T${p.lr_tier}${p.lr_ms ? ' MS' + p.lr_ms.toFixed(0) : ''}${p.lr_signal ? ' ' + p.lr_signal : ''}` : '';
        console.log(`  ${i+1}. ${p.name.padEnd(25)} ${p.position.padEnd(3)} ${p.team.padEnd(4)} Val:${String(p.fc_value).padStart(5)}  FC#${String(p.fc_rank).padStart(3)}  ${lr}`);
    });
    console.log('\nCUTS (dropped to pool):');
    myTeam.cuts.forEach((p, i) => {
        const lr = p.lr_rank ? `LR#${p.lr_rank} T${p.lr_tier}${p.lr_ms ? ' MS' + p.lr_ms.toFixed(0) : ''}${p.lr_signal ? ' ' + p.lr_signal : ''}` : '';
        console.log(`  ${i+1}. ${p.name.padEnd(25)} ${p.position.padEnd(3)} ${p.team.padEnd(4)} Val:${String(p.fc_value).padStart(5)}  FC#${String(p.fc_rank).padStart(3)}  ${lr}`);
    });

    // League overview
    console.log('\n\n=== LEAGUE OVERVIEW ===');
    teamAnalyses.forEach((t, i) => {
        const isMe = t.id === myTeamId;
        console.log(`\n${i+1}. ${t.name}${isMe ? ' ⭐' : ''} | Keepers: ${t.totalValue.toLocaleString()} | Dropped: ${t.valueDropped.toLocaleString()} | Picks: ${t.draftPicks.length}`);
        const valuableCuts = t.cuts.filter(p => p.fc_value >= 500);
        if (valuableCuts.length > 0 && !isMe) {
            valuableCuts.forEach(p => {
                const lr = p.lr_rank ? ` LR#${p.lr_rank} T${p.lr_tier}` : '';
                console.log(`     CUT: ${p.name.padEnd(22)} ${p.position.padEnd(3)} Val:${String(p.fc_value).padStart(5)}${lr}`);
            });
        }
    });

    // Trade targets
    console.log('\n\n=== TRADE TARGETS ===');
    console.log('Teams where their #8-10 keepers are weaker + they have draft capital to offer:\n');
    
    const myWorstKeeper = myTeam.keepers[9];
    const myBestCuts = myTeam.cuts.filter(p => p.fc_value > 0);
    
    teamAnalyses.forEach(t => {
        if (t.id === myTeamId) return;
        const theirBackEnd = t.keepers.slice(7);
        const theirWeakest = theirBackEnd[theirBackEnd.length - 1];
        
        // They have picks AND their back-end is weak enough to want our cuts
        if (t.draftPicks.length > 10 && theirWeakest && myBestCuts.length > 0 && theirWeakest.fc_value < myBestCuts[0].fc_value) {
            console.log(`  ${t.name} (${t.draftPicks.length} picks)`);
            console.log('    Their weak keepers (#8-10):');
            theirBackEnd.forEach(p => {
                const lr = p.lr_rank ? ` LR#${p.lr_rank} T${p.lr_tier}` : '';
                console.log(`      ${p.name.padEnd(22)} ${p.position.padEnd(3)} Val:${String(p.fc_value).padStart(5)}${lr}`);
            });
            console.log('    Your cuts they might want:');
            myBestCuts.slice(0, 3).forEach(p => {
                const lr = p.lr_rank ? ` LR#${p.lr_rank} T${p.lr_tier}` : '';
                console.log(`      ${p.name.padEnd(22)} ${p.position.padEnd(3)} Val:${String(p.fc_value).padStart(5)}${lr}`);
            });
            console.log('');
        }
    });

    process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
