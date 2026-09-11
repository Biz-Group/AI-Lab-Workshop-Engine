'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase';
import {
  mapRealtimeChannelStatus,
  type ChannelConnectionStatus,
} from '@/lib/utils/realtime';

/**
 * Shared submission feed for the facilitator surfaces.
 *
 * Extracted from SubmissionGallery so the projected wall reuses one
 * implementation of fetch + realtime + polling rather than a second copy.
 *
 * Two modes:
 *  - `refetch`     re-reads everything on any change. What the admin gallery
 *                  has always done; cheap to reason about, fine for a page
 *                  someone is scrolling.
 *  - `incremental` applies each realtime payload in place. Used by the wall,
 *                  where a full refetch on every submission would rebuild the
 *                  whole board mid-reveal.
 *
 * The 5s reconcile poll is kept in BOTH modes on purpose. The
 * `ALTER PUBLICATION` statements were left commented out in migrations 003 and
 * 009, and a channel reports SUBSCRIBED even when its table is not published --
 * so realtime working cannot be assumed, and a wall that only listens would sit
 * empty on stage.
 */

const POLL_INTERVAL_MS = 5_000;

export interface SessionSubmissionImage {
  id: string;
  step_id: string;
  participant_id: string;
  image_url: string;
  /** Cache-busted; the storage key is stable per (session, participant, step). */
  display_image_url: string;
  content: string;
  participant_name: string;
  hidden_from_wall: boolean;
  created_at: string;
  updated_at: string;
  /**
   * Natural pixel dimensions captured at upload time (image-upload.ts). Null
   * for submissions made before that existed -- consumers should fall back
   * to their own aspect-ratio discovery in that case.
   */
  image_width: number | null;
  image_height: number | null;
}

export interface SessionSubmissionResponse {
  id: string;
  step_id: string;
  participant_id: string;
  content: string;
  participant_name: string;
  hidden_from_wall: boolean;
  created_at: string;
}

export interface UseSessionSubmissionsOptions {
  sessionId: string;
  /** Restrict the feed to one snapshot step. Omit to load the whole session. */
  stepId?: string | null;
  mode?: 'refetch' | 'incremental';
}

export interface UseSessionSubmissionsResult {
  images: SessionSubmissionImage[];
  responses: SessionSubmissionResponse[];
  /** Distinct participants who have submitted, NOT a row count. */
  submittedParticipantIds: Set<string>;
  isLoading: boolean;
  connection: ChannelConnectionStatus;
  refresh: () => Promise<void>;
}

/**
 * The storage key is `{sessionId}/{participantId}/{stepId}.{ext}` with
 * `upsert: true`, so a replaced image reuses the same URL. Without this the
 * wall would keep showing the previous bitmap from cache.
 */
export function buildVersionedImageUrl(url: string, updatedAt?: string | null): string {
  if (!updatedAt) return url;
  const version = Date.parse(updatedAt);
  if (Number.isNaN(version)) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}v=${version}`;
}

function readParticipantName(participant: unknown): string | null {
  if (!participant) return null;
  const record = Array.isArray(participant) ? participant[0] : participant;
  if (!record || typeof record !== 'object') return null;
  const name = (record as { display_name?: unknown }).display_name;
  return typeof name === 'string' ? name : null;
}

interface SubmissionRow {
  id: string;
  step_id: string;
  participant_id: string;
  content: string | null;
  image_url: string | null;
  hidden_from_wall: boolean | null;
  created_at: string;
  updated_at: string | null;
  image_width: number | null;
  image_height: number | null;
  participant?: unknown;
}

const SELECT_COLUMNS = `
  id,
  step_id,
  participant_id,
  content,
  image_url,
  hidden_from_wall,
  created_at,
  updated_at,
  image_width,
  image_height,
  participant:participants(display_name)
`;

function toImage(row: SubmissionRow, name: string): SessionSubmissionImage | null {
  if (!row.image_url) return null;
  return {
    id: row.id,
    step_id: row.step_id,
    participant_id: row.participant_id,
    image_url: row.image_url,
    display_image_url: buildVersionedImageUrl(row.image_url, row.updated_at || row.created_at),
    content: row.content || '',
    participant_name: name,
    hidden_from_wall: row.hidden_from_wall === true,
    created_at: row.created_at,
    updated_at: row.updated_at || row.created_at,
    image_width: row.image_width ?? null,
    image_height: row.image_height ?? null,
  };
}

function toResponse(row: SubmissionRow, name: string): SessionSubmissionResponse | null {
  const content = (row.content || '').trim();
  if (!content) return null;
  return {
    id: row.id,
    step_id: row.step_id,
    participant_id: row.participant_id,
    content: row.content || '',
    participant_name: name,
    hidden_from_wall: row.hidden_from_wall === true,
    created_at: row.created_at,
  };
}

export function useSessionSubmissions({
  sessionId,
  stepId = null,
  mode = 'refetch',
}: UseSessionSubmissionsOptions): UseSessionSubmissionsResult {
  const [images, setImages] = useState<SessionSubmissionImage[]>([]);
  const [responses, setResponses] = useState<SessionSubmissionResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [connection, setConnection] = useState<ChannelConnectionStatus>('connecting');

  // Realtime payloads carry the raw submissions row with no joined
  // display_name, so incremental inserts resolve the name from here.
  const nameCacheRef = useRef<Map<string, string>>(new Map());

  const refresh = useCallback(async () => {
    const supabase = createClient();

    let query = supabase
      .from('submissions')
      .select(SELECT_COLUMNS)
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false });

    if (stepId) {
      query = query.eq('step_id', stepId);
    }

    const { data, error } = await query;
    if (error || !data) {
      setIsLoading(false);
      return;
    }

    const rows = data as unknown as SubmissionRow[];
    const nextImages: SessionSubmissionImage[] = [];
    const nextResponses: SessionSubmissionResponse[] = [];

    for (const row of rows) {
      const name = readParticipantName(row.participant) || 'Unknown';
      nameCacheRef.current.set(row.participant_id, name);

      const image = toImage(row, name);
      if (image) nextImages.push(image);

      const response = toResponse(row, name);
      if (response) nextResponses.push(response);
    }

    setImages(nextImages);
    setResponses(nextResponses);
    setIsLoading(false);
  }, [sessionId, stepId]);

  const resolveName = useCallback((participantId: string) => {
    return nameCacheRef.current.get(participantId) || 'Unknown';
  }, []);

  /**
   * Fills in a name the realtime payload could not carry.
   *
   * A targeted lookup rather than a full refresh on cache miss: on a gallery
   * step every participant's FIRST submission is a miss, so refreshing here
   * would quietly turn incremental mode back into full-refetch mode in exactly
   * the common case.
   */
  const backfillName = useCallback(async (participantId: string) => {
    const supabase = createClient();
    const { data } = await supabase
      .from('participants')
      .select('display_name')
      .eq('id', participantId)
      .single();

    const name = typeof data?.display_name === 'string' ? data.display_name : null;
    if (!name) return;

    nameCacheRef.current.set(participantId, name);
    setImages((prev) =>
      prev.map((entry) =>
        entry.participant_id === participantId ? { ...entry, participant_name: name } : entry
      )
    );
    setResponses((prev) =>
      prev.map((entry) =>
        entry.participant_id === participantId ? { ...entry, participant_name: name } : entry
      )
    );
  }, []);

  const applyUpsert = useCallback(
    (row: SubmissionRow) => {
      if (stepId && row.step_id !== stepId) return;

      const name = resolveName(row.participant_id);
      const image = toImage(row, name);
      const response = toResponse(row, name);

      setImages((prev) => {
        const without = prev.filter((entry) => entry.id !== row.id);
        // An edit that removes the image must drop the tile, not leave a stale
        // one behind -- the row still exists, it just no longer qualifies.
        if (!image) return without;
        return [image, ...without];
      });

      setResponses((prev) => {
        const without = prev.filter((entry) => entry.id !== row.id);
        // Same predicate-exit problem: clearing the caption empties `content`,
        // which no longer satisfies the text-response filter.
        if (!response) return without;
        return [response, ...without];
      });

      // Render immediately with a placeholder name, then fill it in.
      if (!nameCacheRef.current.has(row.participant_id)) {
        void backfillName(row.participant_id);
      }
    },
    [resolveName, backfillName, stepId]
  );

  const applyDelete = useCallback((id: string) => {
    // With the default REPLICA IDENTITY a DELETE payload carries only the
    // primary key, so removal is by id across both lists.
    setImages((prev) => prev.filter((entry) => entry.id !== id));
    setResponses((prev) => prev.filter((entry) => entry.id !== id));
  }, []);

  useEffect(() => {
    setIsLoading(true);
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const supabase = createClient();
    let mounted = true;

    const handleChange = (payload: {
      eventType: string;
      new?: Record<string, unknown>;
      old?: Record<string, unknown>;
    }) => {
      if (!mounted) return;

      if (mode === 'refetch') {
        void refresh();
        return;
      }

      if (payload.eventType === 'DELETE') {
        const id = payload.old?.id;
        if (typeof id === 'string') applyDelete(id);
        return;
      }

      const row = payload.new as unknown as SubmissionRow | undefined;
      if (row?.id) applyUpsert(row);
    };

    const channel = supabase
      .channel(`gallery:${sessionId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'submissions', filter: `session_id=eq.${sessionId}` },
        (payload) => handleChange(payload as unknown as Parameters<typeof handleChange>[0])
      )
      .subscribe((status) => {
        if (!mounted) return;
        setConnection(mapRealtimeChannelStatus(status));
      });

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [sessionId, mode, refresh, applyUpsert, applyDelete]);

  // Reconcile poll. Also the sole delivery path when the table turns out not to
  // be in the realtime publication.
  //
  // Paused while the tab is backgrounded: a facilitator routinely leaves the
  // wall or admin gallery open in an unfocused tab for an entire workshop, and
  // an unattended tab polling every 5s all day is pure read load against
  // Supabase's disk I/O budget for zero benefit -- nobody is looking at it.
  // Refreshing once on refocus catches anything realtime missed while hidden.
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (interval) return;
      interval = setInterval(() => {
        void refresh();
      }, POLL_INTERVAL_MS);
    };

    const stop = () => {
      if (!interval) return;
      clearInterval(interval);
      interval = null;
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        stop();
      } else {
        void refresh();
        start();
      }
    };

    if (document.visibilityState !== 'hidden') start();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      stop();
    };
  }, [refresh]);

  const submittedParticipantIds = useMemo(() => {
    const ids = new Set<string>();
    for (const image of images) ids.add(image.participant_id);
    for (const response of responses) ids.add(response.participant_id);
    return ids;
  }, [images, responses]);

  return { images, responses, submittedParticipantIds, isLoading, connection, refresh };
}
