import { db } from "@/db";
import { leagues } from "@/db/schema";
import { eq } from "drizzle-orm";
import { MyFFPCClient } from "./MyFFPCClient";

export const dynamic = "force-dynamic";

export default async function MyFFPCPage() {
    // Fetch existing MyFFPC leagues
    const existingLeagues = await db
        .select({
            league_id: leagues.league_id,
            name: leagues.name,
            total_rosters: leagues.total_rosters,
        })
        .from(leagues)
        .where(eq(leagues.platform, "myffpc"));

    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-4 sm:p-6">
            <div className="max-w-3xl mx-auto">
                <div className="mb-6">
                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
                        MyFFPC Leagues
                    </h1>
                    <p className="text-sm text-zinc-500 mt-1">
                        Import and manage your MyFFPC dynasty leagues
                    </p>
                </div>

                <MyFFPCClient existingLeagues={existingLeagues} />
            </div>
        </div>
    );
}
