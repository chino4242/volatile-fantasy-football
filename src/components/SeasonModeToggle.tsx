'use client';

import { Snowflake, Flame } from 'lucide-react';
import { useSeasonMode } from '@/hooks/useSeasonMode';

/**
 * Segmented Off-season / In-season switch for the header. Flipping it hides or
 * reveals the mode-specific feature links across the app instantly.
 */
export function SeasonModeToggle() {
    const { mode, setMode, loaded } = useSeasonMode();

    // Avoid a hydration flash: render a stable placeholder until localStorage read.
    if (!loaded) {
        return <div className="h-8 w-[132px] rounded-full bg-zinc-100 dark:bg-zinc-800" aria-hidden />;
    }

    const isIn = mode === 'in-season';
    return (
        <div
            role="group"
            aria-label="Season mode"
            className="inline-flex items-center rounded-full bg-zinc-100 p-0.5 text-xs font-medium dark:bg-zinc-800"
        >
            <button
                type="button"
                onClick={() => setMode('off-season')}
                aria-pressed={!isIn}
                className={`flex items-center gap-1 rounded-full px-2.5 py-1 transition-colors ${
                    !isIn
                        ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-950 dark:text-zinc-50'
                        : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
                }`}
            >
                <Snowflake className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Off-season</span>
            </button>
            <button
                type="button"
                onClick={() => setMode('in-season')}
                aria-pressed={isIn}
                className={`flex items-center gap-1 rounded-full px-2.5 py-1 transition-colors ${
                    isIn
                        ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-950 dark:text-zinc-50'
                        : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
                }`}
            >
                <Flame className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">In-season</span>
            </button>
        </div>
    );
}
