import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { RosterGapsCard } from '@/components/RosterGapsCard';
import { computeSlotGaps } from '@/lib/slot-gaps';
import type { PortfolioPlayer } from '@/lib/portfolio';
import type { KindNotice } from '@/lib/weekly-freshness';

function P(o: Partial<PortfolioPlayer> & { sleeper_id: string; position: string }): PortfolioPlayer {
    return {
        sleeper_id: o.sleeper_id, full_name: o.full_name ?? o.sleeper_id, position: o.position, team: o.team ?? 'XXX',
        age: null, myRank: null, myPosRank: null, marketRank: null, marketValue: 0, is_starter: o.is_starter ?? false,
        weeklyRank: o.weeklyRank ?? null, weeklyTotal: null, weeklyPosMatchup: null,
        rosRank: o.rosRank ?? null, rosPosRank: o.rosPosRank ?? null, rosPpg: o.rosPpg ?? null,
    };
}

const render = (props: Parameters<typeof RosterGapsCard>[0]) => renderToStaticMarkup(<RosterGapsCard {...props} />);
const text = (html: string) => html
    .replace(/<!--.*?-->/g, '').replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ');

describe('RosterGapsCard', () => {
    it('renders nothing when there are no starting slots', () => {
        expect(render({ gaps: [], week: 12, hasWeeklyData: true })).toBe('');
    });

    it('shows a kicker with its pool size and "no action" when nothing is better', () => {
        const gaps = computeSlotGaps({
            roster: [P({ sleeper_id: 'myk', position: 'K', weeklyRank: 5, full_name: 'Aubrey' })],
            freeAgents: [P({ sleeper_id: 'k1', position: 'K', weeklyRank: 12, full_name: 'Other K' })],
            rosterPositions: ['K'], poolSizes: { k: 32 },
        });
        const t = text(render({ gaps, week: 12, hasWeeklyData: true }));
        expect(t).toContain('Aubrey');
        expect(t).toContain('Wk K #5 of 32 vs #12');
        expect(t).toContain('no action');
        expect(t).toContain('No better free agents for your starters.');
    });

    it('says so when my kicker is not in this week\'s list and no ranked free agent exists', () => {
        const gaps = computeSlotGaps({
            roster: [P({ sleeper_id: 'myk', position: 'K', weeklyRank: null, full_name: 'Unlisted K' })],
            freeAgents: [], rosterPositions: ['K'], poolSizes: { k: 32 },
        });
        const t = text(render({ gaps, week: 12, hasWeeklyData: true }));
        expect(t).toContain('Wk K unranked');
        expect(t).toContain("Your kicker isn't in this week's ranking.");
        expect(gaps[0].status).not.toBe('actionable'); // stays quiet: nothing to move to
    });

    it('says the same for a defense', () => {
        const gaps = computeSlotGaps({
            roster: [P({ sleeper_id: 'DEF_NYG', position: 'DEF', team: 'NYG', weeklyRank: null, full_name: 'Giants DEF', is_starter: true })],
            freeAgents: [], rosterPositions: ['DEF'], poolSizes: { dst: 24 },
        });
        expect(text(render({ gaps, week: 12, hasWeeklyData: true }))).toContain("Your defense isn't in this week's ranking.");
    });

    it('prints an upload notice with an Admin link, and never claims "no action" for a pool with no current ranking', () => {
        const notices: KindNotice[] = [{
            kind: 'k', state: 'stale', latestWeek: 11, overallLatestWeek: 12,
            message: 'No Week 12 kicker ranking uploaded. Last upload: Week 11.',
        }];
        const gaps = computeSlotGaps({
            roster: [P({ sleeper_id: 'myk', position: 'K', weeklyRank: null, full_name: 'My K' })],
            freeAgents: [], rosterPositions: ['K'], staleKinds: new Set(['k'] as const),
        });
        const html = render({ gaps, week: 12, hasWeeklyData: true, notices });
        const t = text(html);
        expect(t).toContain('No Week 12 kicker ranking uploaded. Last upload: Week 11.');
        expect(html).toContain('href="/admin"');
        expect(t).toContain('no current ranking');
        expect(t).not.toContain('no action');
    });

    it('with notices present, the all-clear line only claims what could be compared', () => {
        const gaps = computeSlotGaps({
            roster: [P({ sleeper_id: 'qb1', position: 'QB', weeklyRank: 3 })],
            freeAgents: [P({ sleeper_id: 'qb2', position: 'QB', weeklyRank: 20 })], rosterPositions: ['QB'],
        });
        const notices: KindNotice[] = [{ kind: 'dst', state: 'missing', latestWeek: null, overallLatestWeek: 12, message: 'No defense ranking has been uploaded.' }];
        expect(text(render({ gaps, week: 12, hasWeeklyData: true, notices }))).toContain('No better free agents for the starters we could compare.');
    });

    it('a stale flex list shows "no current ranking" but a ROS gap still reads "worth a move"', () => {
        const gaps = computeSlotGaps({
            roster: [P({ sleeper_id: 'rb1', position: 'RB', rosPosRank: 30, full_name: 'Back' })],
            freeAgents: [P({ sleeper_id: 'f', position: 'RB', rosPosRank: 5, full_name: 'Waiver Back' })],
            rosterPositions: ['RB'], staleKinds: new Set(['flex'] as const),
        });
        const t = text(render({ gaps, week: 12, hasWeeklyData: true }));
        expect(t).toContain("can't compare, no current ranking"); // the weekly side says why
        expect(t).toContain('worth a move');                       // the ROS gap still drives the slot
    });

    it('open rows get the platform link even without a waiver-engine move; closed rows do not', () => {
        const gaps = computeSlotGaps({
            roster: [
                P({ sleeper_id: 'myk', position: 'K', weeklyRank: 25, full_name: 'Weak K' }),
                P({ sleeper_id: 'qb1', position: 'QB', weeklyRank: 3, full_name: 'Good QB' }),
            ],
            freeAgents: [P({ sleeper_id: 'k1', position: 'K', weeklyRank: 3, full_name: 'Great K' })],
            rosterPositions: ['QB', 'K'], upgrades: [],
        });
        const html = render({ gaps, week: 12, hasWeeklyData: true, deepLink: 'https://sleeper.com/leagues/1/team', linkLabel: 'Sleeper' });
        expect((html.match(/Open <!-- -->Sleeper<!-- --> ↗|Open Sleeper ↗/g) ?? []).length).toBe(1);
        expect(text(html)).toContain('Add Great K');
    });

    it('a locked slot reads "locked (game started)"', () => {
        const gaps = computeSlotGaps({
            roster: [P({ sleeper_id: 'rb1', position: 'RB', weeklyRank: 40, team: 'DET', is_starter: true })],
            freeAgents: [], rosterPositions: ['RB'], startedTeams: new Set(['DET']),
        });
        expect(text(render({ gaps, week: 12, hasWeeklyData: true }))).toContain('locked (game started)');
    });
});
