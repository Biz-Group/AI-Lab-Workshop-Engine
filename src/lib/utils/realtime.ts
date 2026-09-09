/**
 * Shared realtime vocabulary for the facilitator surfaces (presenter console
 * and projected gallery wall).
 *
 * Lifted out of PresenterView so the wall can reuse it without importing from
 * a `'use client'` component.
 */

export type ChannelConnectionStatus = 'connecting' | 'connected' | 'error';

export function mapRealtimeChannelStatus(status: string): ChannelConnectionStatus {
  if (status === 'SUBSCRIBED') return 'connected';
  if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
    return 'error';
  }
  return 'connecting';
}

export function deriveBroadcastStatus(
  presenterStatus: ChannelConnectionStatus,
  broadcastStatus: ChannelConnectionStatus
): ChannelConnectionStatus {
  if (presenterStatus === 'error' || broadcastStatus === 'error') return 'error';
  if (presenterStatus === 'connected' && broadcastStatus === 'connected') return 'connected';
  return 'connecting';
}

/**
 * Facilitator-facing wording for a channel state. The projected wall is on a
 * screen a whole room can see, so it must never show Supabase/channel jargon.
 */
export function describeConnection(status: ChannelConnectionStatus): string {
  if (status === 'connected') return 'Live';
  if (status === 'error') return 'Reconnecting…';
  return 'Connecting…';
}

// ─── Presenter <-> wall step synchronisation ────────────────────────────────
//
// The `workshop-broadcast:{sessionId}` channel already existed but had no
// listeners: the presenter console only ever sent timer updates into it. Both
// facilitator surfaces now also exchange step changes over it.
//
// Broadcast is used rather than `postgres_changes` on `sessions` deliberately:
// it needs no publication configuration, which cannot be verified from the
// repo (see migration 028).

export function workshopBroadcastChannel(sessionId: string): string {
  return `workshop-broadcast:${sessionId}`;
}

export const STEP_CHANGE_EVENT = 'step_change';
export const TIMER_UPDATE_EVENT = 'timer_update';

export interface StepChangePayload {
  current_step_id: string | null;
}

/** Narrows an untrusted broadcast payload to a step id. */
export function readStepChangePayload(payload: unknown): StepChangePayload | null {
  if (!payload || typeof payload !== 'object') return null;
  const value = (payload as Record<string, unknown>).current_step_id;
  if (value === null) return { current_step_id: null };
  if (typeof value === 'string') return { current_step_id: value };
  return null;
}
