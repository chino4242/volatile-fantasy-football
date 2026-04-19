/**
 * Analyze Late Round prospect data using Claude.
 * 
 * Usage: npx tsx scripts/analyze-prospects.ts [--force]
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { prospectData } from '../src/db/schema';
import { eq, isNull, sql } from 'drizzle-orm';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_API_KEY) { console.error('ANTHROPIC_API_KEY not found in .env.local'); process.exit(1); }

const client = postgres(process.env.DATABASE_URL!, { prepare: false });
const db = drizzle(client);
const force = process.argv.includes('--force');

async function analyze(name: string, position: string, text: string, zapScore: string | null, zapCategory: string | null, comps: string | null) {
    const context = [
        zapScore ? `ZAP Score: ${zapScore}` : null,
        zapCategory ? `ZAP Category: ${zapCategory}` : null,
        comps ? `Statistical Comps: ${comps}` : null,
    ].filter(Boolean).join('\n');

    const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 500,
            messages: [{ role: 'user', content: `Analyze this Late Round prospect profile for ${name} (${position}). Return ONLY valid JSON with these exact keys:
- "confidence": integer 1-10 (10 = elite prospect, 1 = undraftable)
- "summary": one sentence summary (max 15 words)
- "bull_case": one sentence best-case NFL outcome
- "bear_case": one sentence worst-case NFL outcome
- "comps": 2-3 NFL player comparisons with brief reasoning

${context}

Analysis:
${text.slice(0, 4000)}` }],
        }),
    });

    const data = await res.json();
    const content2 = data.content?.[0]?.text || '';
    const jsonMatch = content2.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');
    const parsed = JSON.parse(jsonMatch[0]);
    return {
        confidence: Math.min(10, Math.max(1, parseInt(parsed.confidence) || 5)),
        summary: String(parsed.summary || '').slice(0, 200),
        bull_case: String(parsed.bull_case || '').slice(0, 300),
        bear_case: String(parsed.bear_case || '').slice(0, 300),
        comps: String(parsed.comps || '').slice(0, 500),
    };
}

async function main() {
    const whereClause = force ? sql`1=1` : isNull(prospectData.ai_confidence);
    const prospects = await db.select({
        id: prospectData.id, full_name: prospectData.full_name, position: prospectData.position,
        analysis_text: prospectData.analysis_text, zap_score: prospectData.zap_score,
        zap_category: prospectData.zap_category, statistical_comparables: prospectData.statistical_comparables,
    }).from(prospectData).where(whereClause);

    // Only analyze prospects that have analysis text
    const withText = prospects.filter(p => p.analysis_text && p.analysis_text.length > 50);
    console.log(`Found ${withText.length} prospects to analyze${force ? ' (force mode)' : ''}`);

    let success = 0, failed = 0;
    for (const p of withText) {
        try {
            const result = await analyze(p.full_name, p.position, p.analysis_text!, p.zap_score, p.zap_category, p.statistical_comparables);
            await db.update(prospectData).set({
                ai_confidence: result.confidence,
                ai_summary: result.summary,
                ai_bull_case: result.bull_case,
                ai_bear_case: result.bear_case,
                ai_comps: result.comps,
            }).where(eq(prospectData.id, p.id));
            console.log(`✓ ${p.full_name} — ${result.confidence}/10 — ${result.summary}`);
            success++;
            await new Promise(r => setTimeout(r, 1000));
        } catch (e: any) {
            console.log(`✗ ${p.full_name} — ${e.message}`);
            failed++;
        }
    }

    console.log(`\nDone: ${success} analyzed, ${failed} failed`);
    await client.end();
}

main().catch(e => { console.error(e); process.exit(1); });
