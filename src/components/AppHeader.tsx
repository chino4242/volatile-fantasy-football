"use client";

import Link from "next/link";
import Image from "next/image";
import { User } from "lucide-react";
import { useAuth } from "@/hooks/useUser";
import { InstallPWA } from "./InstallPWA";

export function AppHeader() {
    const { sleeperUsername, fleaflickerUsername } = useAuth();
    const isLoggedIn = !!sleeperUsername || !!fleaflickerUsername;

    return (
        <header className="sticky top-0 z-50 w-full border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
            <div className="mx-auto flex h-14 max-w-7xl items-center px-4 sm:px-6 lg:px-8">
                <Link href="/" className="flex items-center gap-2 font-bold text-zinc-900 dark:text-zinc-50">
                    <Image src="/logo.png" alt="VFF" width={32} height={32} className="rounded-lg" />
                    <span className="hidden sm:inline-block">Volatile Fantasy Football</span>
                    <span className="sm:hidden">VFF</span>
                </Link>

                <nav className="ml-auto flex items-center gap-2 sm:gap-4">
                    {/* Logged-out users: link to the home page to connect a league.
                        Authenticated users get real league links on the dashboard. */}
                    {!isLoggedIn && (
                        <Link
                            href="/"
                            className="flex items-center min-h-[44px] px-2 text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
                        >
                            Connect League
                        </Link>
                    )}
                    <InstallPWA />
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
