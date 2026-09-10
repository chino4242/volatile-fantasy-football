import { describe, it, expect } from 'vitest';
import { scoreAthlete, parseSummary } from '@/lib/nfl-live-stats';

describe('scoreAthlete (half-PPR)', () => {
    it('scores a receiving line: REC*0.5 + YDS*0.1 + TD*6', () => {
        // 6 rec, 90 yds, 1 TD → 3 + 9 + 6 = 18.0
        const r = scoreAthlete({
            receiving: { labels: ['REC', 'YDS', 'AVG', 'TD', 'LONG', 'TGTS'], stats: ['6', '90', '15.0', '1', '40', '9'] },
        });
        expect(r.points).toBeCloseTo(18.0);
        expect(r.usage).toBe(9); // targets
        expect(r.usageLabel).toBe('9 tgt');
    });

    it('scores a passing line: YDS*0.04 + TD*4 + INT*-2, parsing C/ATT', () => {
        // 300 yds, 3 TD, 1 INT → 12 + 12 - 2 = 22.0
        const r = scoreAthlete({
            passing: { labels: ['C/ATT', 'YDS', 'AVG', 'TD', 'INT', 'SACKS', 'QBR', 'RTG'], stats: ['25/33', '300', '9.0', '3', '1', '2-14', '80', '110'] },
        });
        expect(r.points).toBeCloseTo(22.0);
    });

    it('scores a rushing line + counts carries as usage', () => {
        // 100 yds, 1 TD → 10 + 6 = 16.0; 18 carries
        const r = scoreAthlete({
            rushing: { labels: ['CAR', 'YDS', 'AVG', 'TD', 'LONG'], stats: ['18', '100', '5.6', '1', '22'] },
        });
        expect(r.points).toBeCloseTo(16.0);
        expect(r.usage).toBe(18);
        expect(r.usageLabel).toBe('18 car');
    });

    it('combines rush + rec (flex back) and sums usage tgt · car', () => {
        const r = scoreAthlete({
            rushing: { labels: ['CAR', 'YDS', 'TD'], stats: ['10', '40', '0'] },      // 4.0
            receiving: { labels: ['REC', 'YDS', 'TD', 'TGTS'], stats: ['5', '30', '1', '6'] }, // 2.5 + 3 + 6 = 11.5
        });
        expect(r.points).toBeCloseTo(15.5);
        expect(r.usage).toBe(16); // 6 tgt + 10 car
        expect(r.usageLabel).toBe('6 tgt · 10 car');
    });

    it('applies fumble-lost penalty', () => {
        const r = scoreAthlete({
            rushing: { labels: ['CAR', 'YDS', 'TD'], stats: ['12', '80', '1'] }, // 8 + 6 = 14
            fumbles: { labels: ['FUM', 'LOST'], stats: ['1', '1'] },              // -2
        });
        expect(r.points).toBeCloseTo(12.0);
    });
});

describe('parseSummary', () => {
    const summary = {
        boxscore: {
            players: [
                {
                    team: { abbreviation: 'NE' },
                    statistics: [
                        { name: 'passing', labels: ['C/ATT', 'YDS', 'TD', 'INT'], athletes: [
                            { athlete: { id: '1', displayName: 'Drake Maye' }, stats: ['23/33', '178', '1', '3'] },
                        ] },
                        { name: 'receiving', labels: ['REC', 'YDS', 'TD', 'TGTS'], athletes: [
                            { athlete: { id: '2', displayName: 'Mack Hollins' }, stats: ['4', '51', '0', '5'] },
                        ] },
                    ],
                },
            ],
        },
    };

    it('produces one line per involved athlete, keyed by name', () => {
        const lines = parseSummary(summary);
        const maye = lines.find(l => l.name === 'Drake Maye')!;
        const hollins = lines.find(l => l.name === 'Mack Hollins')!;
        // Maye: 178*.04 + 4 - 6 = 7.12 - 2 = 5.12 → 5.1
        expect(maye.points).toBeCloseTo(5.1);
        // Hollins: 4*.5 + 51*.1 = 2 + 5.1 = 7.1
        expect(hollins.points).toBeCloseTo(7.1);
        expect(hollins.usage).toBe(5);
    });

    it('drops players with no involvement', () => {
        const empty = { boxscore: { players: [{ team: {}, statistics: [
            { name: 'receiving', labels: ['REC', 'YDS', 'TD', 'TGTS'], athletes: [
                { athlete: { id: '9', displayName: 'Benchwarmer' }, stats: ['0', '0', '0', '0'] },
            ] },
        ] }] } };
        expect(parseSummary(empty).find(l => l.name === 'Benchwarmer')).toBeUndefined();
    });
});
