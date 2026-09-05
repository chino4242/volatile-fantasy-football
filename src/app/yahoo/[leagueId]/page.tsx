import { redirect } from "next/navigation";

// The Yahoo league view now lives in the unified DB-backed tree
// (/db-league/yahoo/[leagueId]). Keep this route as a redirect so old links work.
export default async function LegacyYahooLeaguePage({
    params,
}: {
    params: Promise<{ leagueId: string }>;
}) {
    const { leagueId } = await params;
    redirect(`/db-league/yahoo/${leagueId}`);
}
