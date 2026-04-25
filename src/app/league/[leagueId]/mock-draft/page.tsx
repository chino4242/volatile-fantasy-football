import { getSleeperDraftData } from '@/lib/draft-data';
import DraftClient from '@/app/fleaflicker/[leagueId]/mock-draft/DraftClient';

export const dynamic = 'force-dynamic';

export default async function SleeperMockDraftPage({ params, searchParams }: { params: Promise<{ leagueId: string }>; searchParams: Promise<{ format?: string; keepers?: string }> }) {
    const { leagueId } = await params;
    const { format, keepers } = await searchParams;
    const data = await getSleeperDraftData(leagueId, format, keepers);

    return <DraftClient leagueId={leagueId} {...data} platform="sleeper" />;
}
