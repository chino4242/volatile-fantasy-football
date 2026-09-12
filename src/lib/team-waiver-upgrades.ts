/**
 * Team-page waiver upgrades — server helper.
 *
 * Bridges DB league data (a team's players + the league's free agents) into the
 * tested `findWaiverUpgrades` engine so a team page can show "better options on
 * the waiver wire this week" right next to the lineup optimizer. Stamps this
 * week's kicker/flex/qb/dst ranks onto both sides (same rank source the
 * optimizer uses), then runs the weekly-lineup upgrade finder.
 */

import { getWeeklyRanks, rankForPosition } from './weekly-rankings';
import { findWaiverUpgrades, type WaiverUpgrade } from './waiver-upgrades';
import { getWeeklyKickerRankings } from './kicker-rankings';
import type { PortfolioPlayer, PortfolioTeam, PortfolioLeagueType } from './portfolio';

/** Minimal player shape the caller provides (DbLeaguePlayer is compatible). */
export interface UpgradeSourcePlayer {
    sleeper_id: string;
    full_name: string;
    position: string | null;
    team: string | null;
    fc_value: number | null;
    is_starter?: boolean;
}

/** Stamp weekly rank onto a player → PortfolioPlayer (only the fields the
 *  waiver-upgrade engine reads). */
function toPortfolioPlayer(
    p: UpgradeSourcePlayer,
    byId: Awaited<ReturnType<typeof getWeeklyRanks>>['byId'],
): PortfolioPlayer {
    const info = rankForPosition(p.position, byId.get(p.sleeper_id));
    return {
        sleeper_id: p.sleeper_id,
        full_name: p.full_name,
        position: p.position,
        team: p.team,
        age: null,
        myRank: null,
        myPosRank: null,
        marketRank: null,
        marketValue: p.fc_value,
        is_starter: p.is_starter ?? false,
        weeklyRank: info.rank,
        weeklyTotal: info.total,
        weeklyPosMatchup: info.posMatchup,
    };
}

/**
 * Compute this-week waiver upgrades for a single team. Returns [] when there's
 * no weekly rank data for the roster/free agents.
 *
 * `rosteredInLeague` = sleeper_ids rostered by ANY team in the league (used to
 * mark scraped kickers as available/unavailable, since kickers aren't in the
 * FantasyCalc-valued free-agent pool).
 */
export async function getTeamWaiverUpgrades(
    myPlayers: UpgradeSourcePlayer[],
    freeAgents: UpgradeSourcePlayer[],
    rosterPositions: string[] | null | undefined,
    leagueType: PortfolioLeagueType,
    opts: { coreCapacity?: number; startedTeams?: Set<string>; rosteredInLeague?: Set<string> } = {},
): Promise<WaiverUpgrade[]> {
    if (!rosterPositions || rosterPositions.length === 0) return [];

    // Kickers aren't valued by FantasyCalc, so they're absent from the DB
    // free-agent pool. Pull the scraped kicker rankings and add any kicker NOT
    // rostered in this league as an available free agent, so kicker upgrades
    // surface alongside skill-position ones.
    const startsKicker = rosterPositions.some(t => {
        const u = (t || '').toUpperCase();
        return u === 'K' || u === 'PK';
    });
    const kickerFAs: UpgradeSourcePlayer[] = [];
    if (startsKicker) {
        try {
            const kr = await getWeeklyKickerRankings();
            const rostered = opts.rosteredInLeague ?? new Set<string>();
            for (const k of kr.list) {
                if (!k.sleeper_id || rostered.has(k.sleeper_id)) continue;
                kickerFAs.push({
                    sleeper_id: k.sleeper_id, full_name: k.name, position: 'K',
                    team: k.team, fc_value: null,
                });
            }
        } catch { /* best-effort — skip kicker FAs on failure */ }
    }
    const allFreeAgents = [...freeAgents, ...kickerFAs];

    // Stamp weekly ranks for both roster + free agents in one query.
    const ids = [...myPlayers.map(p => p.sleeper_id), ...allFreeAgents.map(p => p.sleeper_id)];
    const { byId } = await getWeeklyRanks([...new Set(ids)]);

    const team: PortfolioTeam = {
        rosterId: 'me',
        ownerName: 'me',
        players: myPlayers.map(p => toPortfolioPlayer(p, byId)),
    };
    const fas = allFreeAgents.map(p => toPortfolioPlayer(p, byId));

    return findWaiverUpgrades(team, fas, rosterPositions, leagueType, {
        coreCapacity: opts.coreCapacity,
        actualCoreCount: myPlayers.length,
        startedTeams: opts.startedTeams,
        maxSuggestions: 25,
    });
}
