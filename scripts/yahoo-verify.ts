import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
    const { db } = await import('../src/db');
    const { leagues, rosters, rosterPlayers, players } = await import('../src/db/schema');
    const { eq } = await import('drizzle-orm');

    const arg = process.argv[2];
    if (arg === 'def') {
        const defs = await db.select({ sleeper_id: players.sleeper_id, full_name: players.full_name })
            .from(players).where(eq(players.position, 'DEF'));
        console.log(`DEF players in DB: ${defs.length}`);
        defs.slice(0, 40).forEach(d => console.log(`  ${d.sleeper_id}  ${d.full_name}`));
        process.exit(0);
    }
    const ls = await db.select().from(leagues).where(eq(leagues.platform, 'yahoo'));
    for (const l of ls) {
        const rs = await db.select().from(rosters).where(eq(rosters.league_id, l.league_id));
        let playerCount = 0;
        for (const r of rs) {
            const rp = await db.select().from(rosterPlayers).where(eq(rosterPlayers.roster_id, r.id));
            playerCount += rp.length;
        }
        console.log(`${l.name} [${l.league_id}] — format=${l.scoring_format}, type=${l.league_type}, teams=${rs.length}, matchedPlayers=${playerCount}`);
    }
    process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
