import { getFleaflickerDraftData } from '@/lib/draft-data';
import MockDraftClient from '@/app/fleaflicker/[leagueId]/mock-draft/MockDraftClient';

export default async function FleaflickerLiveDraftPage({ params, searchParams }: { params: Promise<{ leagueId: string }>; searchParams: Promise<{ format?: string; keepers?: string }> }) {
    const { leagueId } = await params;
    const { format, keepers } = await searchParams;
    const data = await getFleaflickerDraftData(leagueId, format, keepers);

    return <MockDraftClient leagueId={leagueId} {...data} mode="live" />;
}
