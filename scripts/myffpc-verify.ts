import 'dotenv/config';
async function main() {
    const { db } = await import('../src/db');
    const { leagues, rosters, rosterPlayers } = await import('../src/db/schema');
    const { eq, inArray } = await import('drizzle-orm');
    const [l] = await db.select().from(leagues).where(eq(leagues.league_id, 'myffpc_1787777544107'));
    console.log(`league="${l.name}" total_rosters=${l.total_rosters} last_synced=${l.last_synced_at?.toISOString?.() || l.last_synced_at}`);
    const rs = await db.select().from(rosters).where(eq(rosters.league_id, l.league_id));
    const ids = rs.map(r => r.id);
    const rps = ids.length ? await db.select().from(rosterPlayers).where(inArray(rosterPlayers.roster_id, ids)) : [];
    const byRoster = new Map<string, number>();
    const starterByRoster = new Map<string, number>();
    for (const rp of rps) { byRoster.set(rp.roster_id!, (byRoster.get(rp.roster_id!) || 0) + 1); if (rp.is_starter) starterByRoster.set(rp.roster_id!, (starterByRoster.get(rp.roster_id!) || 0) + 1); }
    for (const r of rs.sort((a, b) => Number(a.roster_id.split('_').pop()) - Number(b.roster_id.split('_').pop()))) {
        console.log(`  ${r.owner_name}: ${byRoster.get(r.id) || 0} players (${starterByRoster.get(r.id) || 0} starters)`);
    }
    console.log(`\ntotal roster_players: ${rps.length}, starters: ${rps.filter(x => x.is_starter).length}`);
    process.exit(0);
}
main();
