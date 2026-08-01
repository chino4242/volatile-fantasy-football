export function getPositionColor(position: string | null | undefined): string {
    switch (position) {
        case 'QB': return 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20';
        case 'RB': return 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20';
        case 'WR': return 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20';
        case 'TE': return 'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20';
        default: return 'text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800';
    }
}

export function getPositionBadgeColor(position: string | null | undefined): string {
    switch (position) {
        case 'QB': return 'bg-red-500 text-white';
        case 'RB': return 'bg-blue-500 text-white';
        case 'WR': return 'bg-green-500 text-white';
        case 'TE': return 'bg-purple-500 text-white';
        default: return 'bg-zinc-500 text-white';
    }
}
