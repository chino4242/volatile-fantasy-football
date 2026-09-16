'use client';

/**
 * "Your team" selector for a league's free-agents page. Makes the FA page
 * personalized WITHOUT requiring a special URL: it reads the saved "my team"
 * (useMyTeams), and if the page was opened without ?team=, auto-applies the
 * saved team to the URL so the server can build team-aware recommendations.
 * Changing the dropdown persists the choice and reloads with the new ?team=.
 */

import { useEffect } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useMyTeams } from '@/hooks/useMyTeams';

interface TeamOption { id: string; name: string }

export function FreeAgentTeamSelector({
    platform,
    leagueId,
    teams,
    currentTeam,
}: {
    platform: string;
    leagueId: string;
    teams: TeamOption[];
    currentTeam: string | null; // the ?team= currently applied (server-provided)
}) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const { getMyTeam, setMyTeam, loaded } = useMyTeams();

    const saved = loaded ? getMyTeam(platform, leagueId) : null;

    // Auto-apply the saved team if the page opened without ?team= and we have one.
    useEffect(() => {
        if (!loaded) return;
        if (!currentTeam && saved && teams.some(t => t.id === saved)) {
            const params = new URLSearchParams(searchParams.toString());
            params.set('team', saved);
            router.replace(`${pathname}?${params.toString()}`);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loaded, saved, currentTeam]);

    const onChange = (id: string) => {
        if (id) setMyTeam(platform, leagueId, id);
        const params = new URLSearchParams(searchParams.toString());
        if (id) params.set('team', id); else params.delete('team');
        router.replace(`${pathname}?${params.toString()}`);
    };

    const value = currentTeam || saved || '';

    return (
        <label className="flex items-center gap-2 text-sm text-zinc-500">
            <span className="whitespace-nowrap">Your team</span>
            <select
                value={value}
                onChange={e => onChange(e.target.value)}
                className="bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-zinc-800 dark:text-zinc-200 max-w-[220px]"
            >
                <option value="">Select your team…</option>
                {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
        </label>
    );
}
