'use client';

import { useCallback, useEffect, useState } from 'react';
import { readAcks, writeAck, isAcked, pruneToWeek, type AcksByWeek } from '@/lib/lineup-acks';

const CHANGE_EVENT = 'vff-lineup-acks-change';

/**
 * Week-scoped "On purpose" acknowledgments for lineup flags. Thin client wrapper
 * over the pure helpers in lib/lineup-acks, adding cross-component sync via a
 * custom event (mirrors useSeasonMode). Prunes stale weeks on mount.
 */
export function useLineupAcks(currentWeek: number | null) {
    const [acks, setAcks] = useState<AcksByWeek>({});
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        pruneToWeek(currentWeek);
        setAcks(readAcks());
        setLoaded(true);
        const onChange = () => setAcks(readAcks());
        window.addEventListener(CHANGE_EVENT, onChange);
        window.addEventListener('storage', onChange);
        return () => {
            window.removeEventListener(CHANGE_EVENT, onChange);
            window.removeEventListener('storage', onChange);
        };
    }, [currentWeek]);

    const isAckedKey = useCallback(
        (ackKey: string) => isAcked(acks, currentWeek, ackKey),
        [acks, currentWeek],
    );

    const ack = useCallback((ackKey: string) => {
        writeAck(currentWeek, ackKey);
        setAcks(readAcks());
        window.dispatchEvent(new Event(CHANGE_EVENT));
    }, [currentWeek]);

    return { isAckedKey, ack, loaded };
}
