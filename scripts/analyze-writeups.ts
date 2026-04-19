/**
 * Analyze prospect writeups using Claude to extract sentiment, summary, and comps.
 * 
 * Usage: npx tsx scripts/analyze-writeups.ts [--force]
 * 
 * By default, only analyzes writeups that don't have AI analysis yet.
 * Use --force to re-analyze all writeups.
 * 
 * Requires ANTHROPIC_API_KEY in .env.local
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { prospectWriteups } from '../src/db/schema';
import { eq, isNull, sql } from 'drizzle-orm';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_API_KEY) { console.error('ANTHROPIC_API_KEY not found in .env.local'); process.exit(1); }

const client = postgres(process.env.DATABASE_URL!, { prepare: false });
const db = drizzle(client);

const force = process.argv.includes('--force');

async function analyzeWriteup(name: string, position: string | null, text: string): Promise<{ confidence: number; summary: string; bull_case: string; bear_case: string; comps: string }> {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 500,
            messages: [{ role: 'user', content: `Analyze this scouting writeup for ${name} (${position || 'unknown position'}). Return ONLY valid JSON with these exact keys:
- "confidence": integer 1-10 (10 = elite prospect, 1 = undraftable)
- "summary": one sentence summary of the prospect (max 15 words)
- "bull_case": one sentence best-case NFL outcome
- "bear_case": one sentence worst-case NFL outcome  
- "comps": 2-3 NFL player comparisons with brief reasoning (e.g., "Amari Cooper (route running style), Jerry Jeudy (inconsistency concerns)")

Writeup:
${text.slice(0, 4000)}` }],
        }),
    });

    const data = await res.json();
    const content = data.content?.[0]?.text || '';
    
    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
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
    const whereClause = force ? sql`1=1` : isNull(prospectWriteups.ai_confidence);
    const writeups = await db.select({ id: prospectWriteups.id, full_name: prospectWriteups.full_name, position: prospectWriteups.position, analysis_text: prospectWriteups.analysis_text })
        .from(prospectWriteups).where(whereClause);

    console.log(`Found ${writeups.length} writeups to analyze${force ? ' (force mode)' : ''}`);

    let success = 0, failed = 0;
    for (const w of writeups) {
        try {
            const result = await analyzeWriteup(w.full_name, w.position, w.analysis_text);
            await db.update(prospectWriteups).set({
                ai_confidence: result.confidence,
                ai_summary: result.summary,
                ai_bull_case: result.bull_case,
                ai_bear_case: result.bear_case,
                ai_comps: result.comps,
            }).where(eq(prospectWriteups.id, w.id));
            console.log(`✓ ${w.full_name} — ${result.confidence}/10 — ${result.summary}`);
            success++;
            // Rate limit: ~1 req/sec
            await new Promise(r => setTimeout(r, 1000));
        } catch (e: any) {
            console.log(`✗ ${w.full_name} — ${e.message}`);
            failed++;
        }
    }

    console.log(`\nDone: ${success} analyzed, ${failed} failed`);
    await client.end();
}

main().catch(e => { console.error(e); process.exit(1); });
