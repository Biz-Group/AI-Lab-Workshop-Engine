'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui';
import { LoadingSpinner } from '@/components/ui';
import { BookOpen, CheckCircle2, PenSquare, Wifi } from 'lucide-react';

interface WaitingForSessionProps {
  sessionId: string;
  participantId: string;
  participantName: string;
  organizationName: string;
  workshopTitle: string;
  workshopDescription?: string | null;
}

export function WaitingForSession({
  sessionId,
  participantId,
  participantName,
  organizationName,
  workshopTitle,
  workshopDescription,
}: WaitingForSessionProps) {
  const router = useRouter();
  const [status, setStatus] = useState<string>('published');
  const [roomStatus, setRoomStatus] = useState<'checking' | 'waiting'>('checking');

  useEffect(() => {
    let isCancelled = false;

    const checkSessionState = async () => {
      try {
        const response = await fetch(`/api/sessions/state?sessionId=${sessionId}`, {
          cache: 'no-store',
        });
        const data = await response.json();
        if (!data.success || isCancelled) return;

        if (data.session.status === 'live') {
          router.refresh();
          return;
        }

        if (data.session.status === 'ended') {
          setStatus('ended');
          return;
        }

        setStatus(data.session.status);
        setRoomStatus('waiting');
      } catch {
        if (!isCancelled) {
          setRoomStatus('checking');
        }
      }
    };

    void checkSessionState();
    const intervalId = window.setInterval(() => {
      void checkSessionState();
    }, 5_000);

    return () => {
      isCancelled = true;
      window.clearInterval(intervalId);
    };
  }, [sessionId, router]);

  useEffect(() => {
    void fetch('/api/analytics/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        participantId,
        sessionId,
        eventType: 'waiting_viewed',
      }),
    });
  }, [participantId, sessionId]);

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
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-4xl grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <Card className="shadow-xl">
          <CardContent className="p-8">
            <div className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-sm font-medium text-brand-700 mb-4">
              <LoadingSpinner size="sm" />
              Waiting for the workshop to begin
            </div>
            <p className="text-sm uppercase tracking-[0.2em] text-gray-400 mb-2">{organizationName}</p>
            <h1 className="text-3xl font-bold text-gray-900 mb-3">{workshopTitle}</h1>
            <p className="text-gray-600 mb-6">
              Welcome, {participantName}. {workshopDescription || 'You are in the right place. As soon as the facilitator starts, we will bring you into the session automatically.'}
            </p>

            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${
                roomStatus === 'waiting'
                  ? 'bg-amber-500/15 text-amber-700'
                  : 'bg-slate-500/15 text-slate-700'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  roomStatus === 'waiting'
                    ? 'bg-amber-500'
                    : 'bg-slate-500 animate-pulse'
                }`}
              />
              <Wifi className="w-4 h-4 shrink-0" strokeWidth={2.25} />
              {roomStatus === 'waiting'
                ? 'Waiting for facilitator to start'
                : 'Checking workshop status'}
            </span>

            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              <div className="rounded-xl bg-slate-50 p-4">
                <BookOpen className="w-5 h-5 text-slate-700 mb-2" />
                <h2 className="font-semibold text-gray-900 mb-1">What to expect</h2>
                <p className="text-sm text-gray-600">You will move through guided chapters with clear outcomes and practical prompts.</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-4">
                <PenSquare className="w-5 h-5 text-slate-700 mb-2" />
                <h2 className="font-semibold text-gray-900 mb-1">What to prepare</h2>
                <p className="text-sm text-gray-600">Keep a browser tab for your AI tool ready so you can test, refine, and submit your work.</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-4">
                <CheckCircle2 className="w-5 h-5 text-slate-700 mb-2" />
                <h2 className="font-semibold text-gray-900 mb-1">What you leave with</h2>
                <p className="text-sm text-gray-600">Your responses are collected into a prompt pack you can revisit after the session.</p>
              </div>
            </div>

            <p className="text-sm text-gray-500 mt-6">You&apos;ll be taken in automatically the moment the session starts.</p>
          </CardContent>
        </Card>

        <Card className="shadow-lg">
          <CardContent className="p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Before we begin</h2>
            <div className="space-y-3 text-sm text-gray-600">
              <div className="rounded-lg border border-gray-200 p-3">
                Check that your name and email were entered correctly so your prompt pack reaches you at the end.
              </div>
              <div className="rounded-lg border border-gray-200 p-3">
                Expect each step to tell you why it matters, what to do, and what good looks like before you submit.
              </div>
              <div className="rounded-lg border border-gray-200 p-3">
                If you get stuck during the workshop, you can ask a question or request help directly from the attendee view.
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
