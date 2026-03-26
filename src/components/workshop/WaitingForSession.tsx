'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { LoadingSpinner } from '@/components/ui';
import { Wifi } from 'lucide-react';

interface WaitingForSessionProps {
  sessionId: string;
}

export function WaitingForSession({ sessionId }: WaitingForSessionProps) {
  const router = useRouter();
  const [status, setStatus] = useState<string>('waiting');
  const [facilitatorPresence, setFacilitatorPresence] = useState<'connecting' | 'online' | 'away'>('connecting');

  useEffect(() => {
    const supabase = createClient();

    // Subscribe to realtime session status changes
    const channel = supabase
      .channel(`session-status:${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'sessions',
          filter: `id=eq.${sessionId}`,
        },
        (payload) => {
          const newStatus = payload.new.status;
          if (newStatus === 'live') {
            // Session is now live - reload to get the full workshop
            router.refresh();
          } else if (newStatus === 'ended') {
            setStatus('ended');
          }
        }
      )
      .subscribe();

    const presenceChannel = supabase
      .channel(`presence:${sessionId}`)
      .on('presence', { event: 'sync' }, () => {
        const state = presenceChannel.presenceState<{ role?: string }>();
        const hasFacilitator = Object.values(state).some((presences) =>
          presences.some((presence) => presence.role === 'facilitator')
        );

        setFacilitatorPresence(hasFacilitator ? 'online' : 'away');
      })
      .subscribe();

    // Poll every 30 seconds as a fallback (realtime handles the fast path)
    const interval = setInterval(async () => {
      const { data } = await supabase
        .from('sessions')
        .select('status')
        .eq('id', sessionId)
        .single();

      if (data?.status === 'live') {
        router.refresh();
      } else if (data?.status === 'ended') {
        setStatus('ended');
      }
    }, 30000);

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(presenceChannel);
      clearInterval(interval);
    };
  }, [sessionId, router]);

  if (status === 'ended') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-2">Session Ended</h1>
          <p className="text-white/80">This workshop session has ended.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <LoadingSpinner size="lg" className="mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-white mb-2">Session Not Started</h1>
        <p className="text-white/80 mb-4">Please wait for the facilitator to start the session.</p>
        <span
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${
            facilitatorPresence === 'online'
              ? 'bg-green-500/20 text-green-300'
              : facilitatorPresence === 'away'
                ? 'bg-amber-500/20 text-amber-300'
                : 'bg-slate-500/20 text-slate-200'
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full ${
              facilitatorPresence === 'online'
                ? 'bg-green-400 animate-pulse'
                : facilitatorPresence === 'away'
                  ? 'bg-amber-400'
                  : 'bg-slate-300 animate-pulse'
            }`}
          />
          <Wifi className="w-4 h-4 shrink-0" strokeWidth={2.25} />
          {facilitatorPresence === 'online'
            ? 'Facilitator connected'
            : facilitatorPresence === 'away'
              ? 'Waiting for facilitator...'
              : 'Checking facilitator...'}
        </span>
        <p className="text-white/50 text-sm mt-4">You&apos;ll be taken in automatically when it begins.</p>
      </div>
    </div>
  );
}
