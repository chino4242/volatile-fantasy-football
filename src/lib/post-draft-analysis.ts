/**
 * Post-Draft Analysis Engine
 * 
 * Evaluates each team's full roster through the lens of the Late Round Draft Guide strategy.
 * Produces a summary card per team with power rankings.
 * 
 * Key principles from the guide:
 * - Market Score identifies undervalued players (higher = better value pick)
 * - Tier separation matters more than linear rankings
 * - QB: mobility/rushing is king, avoid pocket passers and TD-rate-dependent QBs
 * - RB: receiving ability is the differentiator, Year 2 backs in middle rounds
 * - WR: yards per route run, target share, team passing environment
 * - TE: ambiguous rooms, slot rates, first downs per route run
 * - Positional balance: elite RBs provide biggest edge (VORP), don't overpay QB/TE
 */

// Types
export interface PlayerForAnalysis {
    id: string;
    full_name: string;
    position: string | null;
    fc_value: number | null;
    years_exp?: number | null;
    // Late Round data (from customRankingsMap)
    lr_rank?: number | null;
    lr_tier?: number | null;
    lr_market_score?: number | null;
    lr_signal?: string | null;
    // ZAP data
    zap_score?: number | null;
    zap_category?: string | null;
}

export interface PositionGrade {
    position: string;
    grade: string;
    score: number;
    playerCount: number;
    topPlayer: string | null;
    tierBreakdown: string; // e.g. "2 elite, 1 solid, 1 depth"
    strength: string | null;
    weakness: string | null;
}

export interface TeamAnalysis {
    teamId: number;
    teamName: string;
    overallGrade: string;
    overallScore: number;
    powerRank: number;
    positionGrades: PositionGrade[];
    strengths: string[];
    weaknesses: string[];
    summary: string;
    marketScoreAvg: number | null;
    eliteCount: number; // Players in T1-5
    depthScore: number;
}

// Constants
const TIER_ELITE_MAX = 5;
const TIER_STRONG_MAX = 10;
const TIER_SOLID_MAX = 15;
const TIER_MID_MAX = 20;
const TIER_DEPTH_MAX = 25;

const POSITION_WEIGHTS = { QB: 0.15, RB: 0.35, WR: 0.35, TE: 0.15 };

// Ideal roster shape (for a 1QB redraft league)
const IDEAL_STARTERS = { QB: 1, RB: 2, WR: 3, TE: 1 };
const IDEAL_DEPTH = { QB: 1, RB: 3, WR: 3, TE: 1 };

function getTierLabel(tier: number | null | undefined): string {
    if (!tier) return 'unranked';
    if (tier <= TIER_ELITE_MAX) return 'elite';
    if (tier <= TIER_STRONG_MAX) return 'strong';
    if (tier <= TIER_SOLID_MAX) return 'solid';
    if (tier <= TIER_MID_MAX) return 'mid';
    if (tier <= TIER_DEPTH_MAX) return 'depth';
    return 'flier';
}

function getGradeFromScore(score: number, maxScore: number): string {
    if (maxScore === 0) return 'C';
    const pct = score / maxScore;
    if (pct >= 0.92) return 'A+';
    if (pct >= 0.84) return 'A';
    if (pct >= 0.76) return 'A-';
    if (pct >= 0.68) return 'B+';
    if (pct >= 0.60) return 'B';
    if (pct >= 0.50) return 'B-';
    if (pct >= 0.40) return 'C+';
    if (pct >= 0.30) return 'C';
    return 'C-';
}

function getPositionGrade(score: number): string {
    if (score >= 90) return 'A+';
    if (score >= 80) return 'A';
    if (score >= 70) return 'A-';
    if (score >= 60) return 'B+';
    if (score >= 50) return 'B';
    if (score >= 40) return 'B-';
    if (score >= 30) return 'C+';
    if (score >= 20) return 'C';
    return 'D';
}

/**
 * Score a single player based on Late Round tier.
 * Higher tiers = lower score. Elite players contribute more.
 */
function playerTierScore(tier: number | null | undefined): number {
    if (!tier) return 5; // Unranked = minimal value
    if (tier <= 3) return 100;
    if (tier <= 5) return 85;
    if (tier <= 8) return 70;
    if (tier <= 10) return 60;
    if (tier <= 13) return 50;
    if (tier <= 15) return 40;
    if (tier <= 18) return 30;
    if (tier <= 21) return 22;
    if (tier <= 25) return 15;
    if (tier <= 30) return 10;
    return 5;
}

/**
 * Score a position group for a team.
 * Weights the top starters heavily, with diminishing returns for depth.
 */
function scorePositionGroup(players: PlayerForAnalysis[], position: string): { score: number; breakdown: string; topPlayer: string | null; strength: string | null; weakness: string | null } {
    const posPlayers = players.filter(p => p.position === position);
    const ideal = IDEAL_STARTERS[position as keyof typeof IDEAL_STARTERS] || 1;
    const idealDepth = IDEAL_DEPTH[position as keyof typeof IDEAL_DEPTH] || 2;
    const totalIdeal = ideal + idealDepth;

    if (posPlayers.length === 0) {
        return { score: 0, breakdown: 'empty', topPlayer: null, strength: null, weakness: `No ${position}s rostered` };
    }

    // Sort by tier (best first)
    const sorted = [...posPlayers].sort((a, b) => (a.lr_tier || 99) - (b.lr_tier || 99));
    const topPlayer = sorted[0]?.full_name || null;

    // Score starters (weighted 3x) and depth (1x)
    let starterScore = 0;
    let depthScore = 0;

    for (let i = 0; i < sorted.length; i++) {
        const tierScore = playerTierScore(sorted[i].lr_tier);
        if (i < ideal) {
            starterScore += tierScore;
        } else {
            depthScore += tierScore * 0.4; // Diminishing returns for depth
        }
    }

    // Normalize: max starter score = ideal * 100, max depth = idealDepth * 100 * 0.4
    const maxStarter = ideal * 100;
    const maxDepth = idealDepth * 100 * 0.4;
    const normalizedStarter = Math.min(100, (starterScore / maxStarter) * 100);
    const normalizedDepth = Math.min(100, (depthScore / maxDepth) * 100);

    // Starter impact 70%, depth 30%
    const score = normalizedStarter * 0.7 + normalizedDepth * 0.3;

    // Tier breakdown
    const elite = sorted.filter(p => (p.lr_tier || 99) <= TIER_ELITE_MAX).length;
    const strong = sorted.filter(p => (p.lr_tier || 99) > TIER_ELITE_MAX && (p.lr_tier || 99) <= TIER_STRONG_MAX).length;
    const solid = sorted.filter(p => (p.lr_tier || 99) > TIER_STRONG_MAX && (p.lr_tier || 99) <= TIER_SOLID_MAX).length;
    const mid = sorted.filter(p => (p.lr_tier || 99) > TIER_SOLID_MAX && (p.lr_tier || 99) <= TIER_MID_MAX).length;
    const rest = sorted.length - elite - strong - solid - mid;

    const parts: string[] = [];
    if (elite > 0) parts.push(`${elite} elite`);
    if (strong > 0) parts.push(`${strong} strong`);
    if (solid > 0) parts.push(`${solid} solid`);
    if (mid > 0) parts.push(`${mid} mid`);
    if (rest > 0) parts.push(`${rest} depth`);
    const breakdown = parts.join(', ') || 'none';

    // Determine strengths/weaknesses
    let strength: string | null = null;
    let weakness: string | null = null;

    if (sorted[0]?.lr_tier && sorted[0].lr_tier <= 3) {
        strength = `Elite ${position}1 (${sorted[0].full_name}, Tier ${sorted[0].lr_tier})`;
    } else if (elite + strong >= ideal) {
        strength = `Strong ${position} starters`;
    }

    if (posPlayers.length < ideal) {
        weakness = `Only ${posPlayers.length}/${ideal} starting-caliber ${position}s`;
    } else if (sorted[0]?.lr_tier && sorted[0].lr_tier > TIER_SOLID_MAX) {
        weakness = `No top-tier ${position} (best: Tier ${sorted[0].lr_tier})`;
    } else if (posPlayers.length < ideal + 1 && position !== 'QB') {
        weakness = `Thin ${position} depth (${posPlayers.length} total)`;
    }

    return { score, breakdown, topPlayer, strength, weakness };
}

/**
 * Generate a text summary for the team based on the analysis.
 */
function generateSummary(posGrades: PositionGrade[], strengths: string[], weaknesses: string[], marketScoreAvg: number | null): string {
    const topPos = posGrades.reduce((best, pg) => pg.score > best.score ? pg : best, posGrades[0]);
    const worstPos = posGrades.reduce((worst, pg) => pg.score < worst.score ? pg : worst, posGrades[0]);

    let summary = '';

    if (topPos && topPos.score >= 70) {
        summary += `${topPos.position} is a clear strength. `;
    }

    if (worstPos && worstPos.score < 35) {
        summary += `${worstPos.position} is a concern — needs upgrades. `;
    } else if (worstPos && worstPos.score < 50) {
        summary += `${worstPos.position} could use more depth. `;
    }

    if (marketScoreAvg !== null && marketScoreAvg >= 65) {
        summary += `Strong value drafting (avg Market Score: ${marketScoreAvg.toFixed(0)}). `;
    } else if (marketScoreAvg !== null && marketScoreAvg < 40) {
        summary += `Paid market price for most picks — limited value edges. `;
    }

    if (strengths.length === 0 && weaknesses.length === 0) {
        summary += 'Balanced roster without obvious holes or elite peaks.';
    }

    return summary.trim() || 'Solid roster construction overall.';
}

/**
 * Main analysis function: evaluate all teams and produce power rankings.
 */
export function analyzeLeaguePostDraft(
    teams: Array<{
        id: number;
        name: string;
        players: PlayerForAnalysis[];
    }>,
    customRankingsMap?: Record<string, { rank: number | null; signal: string | null; notes: string | null; source: string; marketScore: number | null; tier: number | null }[]>
): TeamAnalysis[] {
    // Enrich players with Late Round data
    const enrichedTeams = teams.map(team => {
        const enrichedPlayers = team.players
            .filter(p => p.position && ['QB', 'RB', 'WR', 'TE'].includes(p.position))
            .map(p => {
                const rankings = customRankingsMap?.[p.id];
                const lr = rankings?.find(r => r.source.toLowerCase().includes('late round'));
                return {
                    ...p,
                    lr_rank: lr?.rank ?? null,
                    lr_tier: lr?.tier ?? null,
                    lr_market_score: lr?.marketScore ?? null,
                    lr_signal: lr?.signal ?? null,
                };
            });
        return { ...team, players: enrichedPlayers };
    });

    // Score each team
    const teamAnalyses: TeamAnalysis[] = enrichedTeams.map(team => {
        const positionGrades: PositionGrade[] = (['QB', 'RB', 'WR', 'TE'] as const).map(pos => {
            const { score, breakdown, topPlayer, strength, weakness } = scorePositionGroup(team.players, pos);
            return {
                position: pos,
                grade: getPositionGrade(score),
                score,
                playerCount: team.players.filter(p => p.position === pos).length,
                topPlayer,
                tierBreakdown: breakdown,
                strength,
                weakness,
            };
        });

        // Overall score: weighted by position importance
        const overallScore = positionGrades.reduce((sum, pg) => {
            const weight = POSITION_WEIGHTS[pg.position as keyof typeof POSITION_WEIGHTS] || 0.25;
            return sum + pg.score * weight;
        }, 0);

        // Market Score average (only for players that have one)
        const marketScores = team.players.filter(p => p.lr_market_score).map(p => p.lr_market_score!);
        const marketScoreAvg = marketScores.length > 0 ? marketScores.reduce((a, b) => a + b, 0) / marketScores.length : null;

        // Elite count
        const eliteCount = team.players.filter(p => p.lr_tier && p.lr_tier <= TIER_ELITE_MAX).length;

        // Depth score: how many positions have at least ideal + 1 depth
        const depthScore = (['QB', 'RB', 'WR', 'TE'] as const).reduce((sum, pos) => {
            const count = team.players.filter(p => p.position === pos).length;
            const needed = (IDEAL_STARTERS[pos] || 1) + 1;
            return sum + (count >= needed ? 25 : count >= (IDEAL_STARTERS[pos] || 1) ? 15 : 0);
        }, 0);

        // Collect strengths and weaknesses
        const strengths = positionGrades.map(pg => pg.strength).filter(Boolean) as string[];
        const weaknesses = positionGrades.map(pg => pg.weakness).filter(Boolean) as string[];

        // Add Market Score-based signals
        const buySignals = team.players.filter(p => p.lr_signal === 'Super Buy' || p.lr_signal === 'Buy');
        if (buySignals.length >= 3) {
            strengths.push(`${buySignals.length} players flagged as undervalued by Late Round`);
        }
        const sellSignals = team.players.filter(p => p.lr_signal === 'Super Sell' || p.lr_signal === 'Sell');
        if (sellSignals.length >= 3) {
            weaknesses.push(`${sellSignals.length} players flagged as overvalued by Late Round`);
        }

        const summary = generateSummary(positionGrades, strengths, weaknesses, marketScoreAvg);

        return {
            teamId: team.id,
            teamName: team.name,
            overallGrade: '', // Set after ranking
            overallScore,
            powerRank: 0, // Set after ranking
            positionGrades,
            strengths,
            weaknesses,
            summary,
            marketScoreAvg,
            eliteCount,
            depthScore,
        };
    });

    // Sort by overall score and assign ranks + grades
    teamAnalyses.sort((a, b) => b.overallScore - a.overallScore);
    const maxScore = teamAnalyses[0]?.overallScore || 1;

    teamAnalyses.forEach((ta, i) => {
        ta.powerRank = i + 1;
        ta.overallGrade = getGradeFromScore(ta.overallScore, maxScore);
    });

    return teamAnalyses;
}
