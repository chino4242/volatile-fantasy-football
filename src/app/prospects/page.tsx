import { db } from "@/db";
import { prospectData } from "@/db/schema";
import { desc, eq, and } from "drizzle-orm";
import Link from "next/link";
import ProspectsTable from "./ProspectsTable";

export const dynamic = 'force-dynamic';

interface PageProps {
    searchParams: Promise<{ year?: string }>;
}

export default async function ProspectsPage({ searchParams }: PageProps) {
    const { year: yearParam } = await searchParams;
    const year = yearParam ? parseInt(yearParam) : 2026;

    const prospects = await db
        .select()
        .from(prospectData)
        .where(and(eq(prospectData.draft_year, year), eq(prospectData.is_year_2, false)))
        .orderBy(desc(prospectData.zap_score));

    const y2Prospects = await db
        .select()
        .from(prospectData)
        .where(eq(prospectData.is_year_2, true))
        .orderBy(desc(prospectData.zap_score));

    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-4 sm:p-8">
            <div className="max-w-7xl mx-auto">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
                            {year} Prospect Guide
                        </h1>
                        <p className="text-sm text-zinc-500 mt-1">
                            Late Round Fantasy Football ZAP Model — {prospects.length} rookies, {y2Prospects.length} Year 2
                        </p>
                    </div>
                    <Link href="/" className="text-sm text-blue-600 hover:text-blue-500">
                        ← Home
                    </Link>
                </div>
                <ProspectsTable rookies={prospects} year2={y2Prospects} />
            </div>
        </div>
    );
}
