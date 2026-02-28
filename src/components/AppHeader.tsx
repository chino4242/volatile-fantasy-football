"use client";

import Link from "next/link";
import { User, Trophy } from "lucide-react";
import { useAuth } from "@/hooks/useUser";

export function AppHeader() {
    const { sleeperUsername, fleaflickerUsername } = useAuth();
    const isLoggedIn = !!sleeperUsername || !!fleaflickerUsername;

    return (
        <header className="sticky top-0 z-50 w-full border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
            <div className="mx-auto flex h-14 max-w-7xl items-center px-4 sm:px-6 lg:px-8">
                <Link href="/" className="flex items-center gap-2 font-bold text-zinc-900 dark:text-zinc-50">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white">
                        <Trophy className="h-5 w-5" />
                    </div>
                    <span className="hidden sm:inline-block">The Proving Ground</span>
                    <span className="sm:hidden">Volatile</span>
                </Link>

                <nav className="ml-auto flex items-center gap-2 sm:gap-4">
                    {/* Only show these hardcoded links to unauthenticated users, as authenticated users have them on the dashboard */}
                    {!isLoggedIn && (
                        <>
                            <Link
                                href="/league/your-league-id"
                                className="flex items-center min-h-[44px] min-w-[44px] px-2 text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
                            >
                                Sleeper
                            </Link>
                            <Link
                                href="/fleaflicker/your-league-id"
                                className="flex items-center min-h-[44px] min-w-[44px] px-2 text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
                            >
                                Fleaflicker
                            </Link>
                        </>
                    )}
                    <Link
                        href="/players"
                        className="flex items-center min-h-[44px] min-w-[44px] px-2 text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
                    >
                        Players
                    </Link>
                    <Link
                        href="/admin"
                        className="flex items-center min-h-[44px] min-w-[44px] px-2 text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
                    >
                        Admin
                    </Link>
                </nav>
            </div>
        </header>
    );
}
