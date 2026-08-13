import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

// Simple in-memory rate limiting (10 per day per user)
const rateLimits = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(userId: string): { allowed: boolean; remaining: number } {
    const now = Date.now();
    const entry = rateLimits.get(userId);
    
    if (!entry || now > entry.resetAt) {
        rateLimits.set(userId, { count: 1, resetAt: now + 24 * 60 * 60 * 1000 });
        return { allowed: true, remaining: 9 };
    }
    
    if (entry.count >= 10) {
        return { allowed: false, remaining: 0 };
    }
    
    entry.count++;
    return { allowed: true, remaining: 10 - entry.count };
}

const SYSTEM_PROMPT = `You are a dynasty fantasy football trade analyst for a private league tool. You provide opinionated, concise trade analysis based ONLY on the data provided below.

RULES:
- Do NOT use your training data for player evaluations, projections, or news
- Do NOT reference injuries, suspensions, coaching changes, or any information not explicitly provided
- Base your analysis ONLY on: the stats, rankings, signals, roster context, and values given
- Be direct and opinionated — give a clear recommendation, not a wishy-washy "it depends"
- Write like you're texting a friend who's in the league, not a formal report
- Keep responses concise (3-5 sentences for follow-ups, full format for initial analysis)

For the INITIAL analysis, use this format:
**Verdict:** (one clear sentence — accept, decline, or counter)
**Why:**
- (2-4 bullets referencing specific data points)
**Counter suggestion:** (if declining or if there's a better deal structure — one sentence describing what to propose instead)
**Negotiation angle:** (one sentence you could text to the other owner to pitch this trade)

For FOLLOW-UP questions, respond conversationally in 2-4 sentences. Stay direct and opinionated.`;

export async function POST(request: NextRequest) {
    const body = await request.json();
    const { userId, tradeContext, messages } = body;

    if (!userId || !tradeContext) {
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Rate limit check
    const { allowed, remaining } = checkRateLimit(userId);
    if (!allowed) {
        return NextResponse.json({ error: 'Daily limit reached (10/day). Resets in 24 hours.', remaining: 0 }, { status: 429 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        return NextResponse.json({ error: 'AI analysis not configured' }, { status: 503 });
    }

    try {
        const client = new Anthropic({ apiKey });

        // Build message history: first message is always the trade context,
        // followed by any conversation history
        const apiMessages: { role: 'user' | 'assistant'; content: string }[] = [
            { role: 'user', content: tradeContext },
        ];

        // Append conversation history if this is a follow-up
        if (messages && Array.isArray(messages) && messages.length > 0) {
            for (const msg of messages) {
                apiMessages.push({ role: msg.role, content: msg.content });
            }
        }

        const message = await client.messages.create({
            model: 'claude-sonnet-5',
            max_tokens: 1200,
            system: SYSTEM_PROMPT,
            messages: apiMessages,
        });

        const text = message.content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n') || '';

        return NextResponse.json({ analysis: text, remaining });
    } catch (error: any) {
        console.error('Trade analysis error:', error?.message, error?.status);
        if (error?.status === 404) {
            return NextResponse.json({ error: 'Model not available — check API key permissions' }, { status: 503 });
        }
        if (error?.status === 401) {
            return NextResponse.json({ error: 'Invalid API key' }, { status: 503 });
        }
        return NextResponse.json({ error: `AI analysis failed: ${error?.message || 'unknown error'}` }, { status: 500 });
    }
}
