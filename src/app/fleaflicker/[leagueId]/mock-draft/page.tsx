import { getFleaflickerDraftData } from '@/lib/draft-data';
import MockDraftClient from './MockDraftClient';

export default async function FleaflickerMockDraftPage({ params, searchParams }: { params: Promise<{ leagueId: string }>; searchParams: Promise<{ format?: string; keepers?: string }> }) {
    const { leagueId } = await params;
    const { format, keepers } = await searchParams;
    const data = await getFleaflickerDraftData(leagueId, format, keepers);

    return <MockDraftClient leagueId={leagueId} {...data} />;
}
