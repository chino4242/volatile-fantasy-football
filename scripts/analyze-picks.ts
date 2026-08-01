import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { getFleaflickerLeague } from '../src/lib/fleaflicker';

async function main() {
    const leagueId = '197269';
    const myTeamId = 1323356;

    const league = await getFleaflickerLeague(leagueId);

    const kevin = league.rosters.find(r => r.owners[0]?.display_name === 'kevinwheatcraft');
    const myTeam = league.rosters.find(r => r.id === myTeamId);

    if (!kevin) { console.log('Kevin not found'); process.exit(1); }

    const currentYear = new Date().getFullYear();

    console.log('=== kevinwheatcraft ===');
    console.log('Team ID:', kevin.id);
    console.log('Total picks:', kevin.draftPicks.length);

    const kevinSorted = [...kevin.draftPicks].sort((a, b) => a.season - b.season || a.round - b.round || a.slot - b.slot);
    const kevinThisYear = kevinSorted.filter(p => p.season === currentYear);
    const kevinFuture = kevinSorted.filter(p => p.season > currentYear);

    console.log(`\n  THIS YEAR (${currentYear}) — ${kevinThisYear.length} picks:`);
    kevinThisYear.forEach(p => {
        const orig = p.originalOwner !== kevin.id ? ` (from ${league.rosters.find(r => r.id === p.originalOwner)?.owners[0]?.display_name || 'unknown'})` : '';
        console.log(`    ${p.round}.${String(p.slot).padStart(2, '0')} (Overall ${p.overall})${orig}`);
    });

    console.log(`\n  FUTURE — ${kevinFuture.length} picks:`);
    kevinFuture.forEach(p => {
        const orig = p.originalOwner !== kevin.id ? ` (from ${league.rosters.find(r => r.id === p.originalOwner)?.owners[0]?.display_name || 'unknown'})` : '';
        console.log(`    ${p.season} Round ${p.round}${orig}`);
    });

    console.log('\n\n=== MY PICKS (Contino) ===');
    console.log('Total picks:', myTeam?.draftPicks.length || 0);

    const myPicks = [...(myTeam?.draftPicks || [])].sort((a, b) => a.season - b.season || a.round - b.round || a.slot - b.slot);
    const myThisYear = myPicks.filter(p => p.season === currentYear);
    const myFuture = myPicks.filter(p => p.season > currentYear);

    console.log(`\n  THIS YEAR (${currentYear}) — ${myThisYear.length} picks:`);
    myThisYear.forEach(p => {
        const orig = p.originalOwner !== myTeamId ? ` (from ${league.rosters.find(r => r.id === p.originalOwner)?.owners[0]?.display_name || 'unknown'})` : '';
        console.log(`    ${p.round}.${String(p.slot).padStart(2, '0')} (Overall ${p.overall})${orig}`);
    });

    console.log(`\n  FUTURE — ${myFuture.length} picks:`);
    myFuture.forEach(p => {
        const orig = p.originalOwner !== myTeamId ? ` (from ${league.rosters.find(r => r.id === p.originalOwner)?.owners[0]?.display_name || 'unknown'})` : '';
        console.log(`    ${p.season} Round ${p.round}${orig}`);
    });

    // Show all teams with early picks (round 1-3) for context
    console.log('\n\n=== EARLY PICKS THIS YEAR (Rounds 1-3) ===');
    league.rosters.forEach(roster => {
        const earlyPicks = roster.draftPicks.filter(p => p.season === currentYear && p.round <= 3)
            .sort((a, b) => a.round - b.round || a.slot - b.slot);
        if (earlyPicks.length > 0) {
            const name = roster.owners[0]?.display_name || 'Unknown';
            const picks = earlyPicks.map(p => {
                const orig = p.originalOwner !== roster.id ? `(from ${league.rosters.find(r => r.id === p.originalOwner)?.owners[0]?.display_name || '?'})` : '';
                return `${p.round}.${String(p.slot).padStart(2, '0')}${orig}`;
            }).join(', ');
            console.log(`  ${name.padEnd(20)} ${picks}`);
        }
    });

    process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
