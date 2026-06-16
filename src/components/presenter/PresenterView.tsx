'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import Image from 'next/image';
import {
  ChevronLeft,
  ChevronRight,
  Play,
  Square,
  Users,
  AlertTriangle,
  Clock,
  RefreshCw,
  Eye,
  CheckCircle,
  Copy,
  Download,
  QrCode,
  Minus,
  Plus,
  ImageIcon,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { Button, Timer, Card, CardContent, ProgressBar } from '@/components/ui';
import { ParticipantList } from './ParticipantList';
import { PresenterQAPanel, type PresenterQuestion } from './PresenterQAPanel';
import { createClient } from '@/lib/supabase';
import { formatJoinCodeForDisplay, cn } from '@/lib/utils';
import {
  buildSessionParticipationCsv,
  buildSessionParticipationRows,
} from '@/lib/utils/session-analytics';
import toast from 'react-hot-toast';

interface Module {
  id: string;
  title: string;
  order_index: number;
  steps: Step[];
}

interface Step {
  id: string;
  title: string;
  order_index: number;
  estimated_minutes: number | null;
  is_required: boolean;
}

interface PresenterViewProps {
  session: {
    id: string;
    joinCode: string;
    status: string;
    currentStepId: string | null;
    timerEndAt: string | null;
    organizationName: string;
    templateName: string;
  };
  modules: Module[];
  initialParticipantCount: number;
}

type ChannelConnectionStatus = 'connecting' | 'connected' | 'error';

interface PreviewPromptBlock {
  id: string;
  title: string;
  content_markdown: string;
  is_copyable: boolean;
  order_index: number;
}

interface PreviewStep {
  id: string;
  title: string;
  instruction_markdown: string;
  order_index: number;
  estimated_minutes: number | null;
  is_required: boolean;
  ai_tool_name?: string | null;
  ai_tool_url?: string | null;
  prompt_blocks: PreviewPromptBlock[];
}

interface PreviewModule {
  id: string;
  title: string;
  objective: string | null;
  order_index: number;
  steps: PreviewStep[];
}

function mapRealtimeChannelStatus(status: string): ChannelConnectionStatus {
  if (status === 'SUBSCRIBED') return 'connected';
  if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
    return 'error';
  }
  return 'connecting';
}

function deriveBroadcastStatus(
  presenterStatus: ChannelConnectionStatus,
  broadcastStatus: ChannelConnectionStatus
): ChannelConnectionStatus {
  if (presenterStatus === 'error' || broadcastStatus === 'error') return 'error';
  if (presenterStatus === 'connected' && broadcastStatus === 'connected') return 'connected';
  return 'connecting';
}

const LazyQrCodeModal = dynamic(
  () => import('@/components/ui/QrCodeModal').then((mod) => mod.QrCodeModal),
  {
    ssr: false,
    loading: () => (
      <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
        <div className="bg-white text-gray-800 text-sm px-4 py-2 rounded-lg shadow-lg">Loading QR code...</div>
      </div>
    ),
  }
);

const LazyTemplatePreview = dynamic(
  () => import('@/app/admin/templates/[templateId]/TemplatePreview').then((mod) => mod.TemplatePreview),
  {
    ssr: false,
    loading: () => (
      <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center">
        <div className="bg-white text-gray-800 text-sm px-4 py-2 rounded-lg shadow-lg">Loading preview...</div>
      </div>
    ),
  }
);

export function PresenterView({ 
  session: initialSession, 
  modules,
  initialParticipantCount 
}: PresenterViewProps) {
  const router = useRouter();
  const [session, setSession] = useState(initialSession);
  const [participantCount, setParticipantCount] = useState(initialParticipantCount);
  const [stuckCount, setStuckCount] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);
  const [isUpdating, setIsUpdating] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [previewModules, setPreviewModules] = useState<PreviewModule[] | null>(null);
  const broadcastChannelRef = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null);
  const [questions, setQuestions] = useState<PresenterQuestion[]>([]);
  const [channelStatuses, setChannelStatuses] = useState<{
    presenter: ChannelConnectionStatus;
    broadcast: ChannelConnectionStatus;
  }>({
    presenter: 'connecting',
    broadcast: 'connecting',
  });
  const [participationSummary, setParticipationSummary] = useState({
    totalParticipants: initialParticipantCount,
    activeParticipants: 0,
    participantsWithSubmissions: 0,
    totalQuestions: 0,
    totalStuckSignals: 0,
    promptPackDownloads: 0,
    promptPackEmails: 0,
  });
  const currentStepIdRef = useRef<string | null>(session.currentStepId);
  const broadcastStatus = useMemo(
    () => deriveBroadcastStatus(channelStatuses.presenter, channelStatuses.broadcast),
    [channelStatuses.broadcast, channelStatuses.presenter]
  );

  // Flatten steps (memoized)
  const allSteps = useMemo(() => modules.flatMap((module, moduleIndex) =>
    module.steps.map((step, stepIndex) => ({
      ...step,
      moduleTitle: module.title,
      moduleIndex,
      stepIndex,
      globalIndex: modules.slice(0, moduleIndex).reduce((acc, m) => acc + m.steps.length, 0) + stepIndex,
    }))
  ), [modules]);
  const allStepIds = useMemo(() => allSteps.map((step) => step.id), [allSteps]);

  const currentStepIndex = allSteps.findIndex(s => s.id === session.currentStepId);
  const currentStep = allSteps[currentStepIndex] || allSteps[0];
  const isFirstStep = currentStepIndex <= 0;
  const isLastStep = currentStepIndex >= allSteps.length - 1;
  const stepTitlesById = useMemo(
    () => Object.fromEntries(allSteps.map((step) => [step.id, `${step.moduleTitle} / ${step.title}`])),
    [allSteps]
  );

  const fetchParticipationAnalytics = useCallback(async () => {
    const supabase = createClient();
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const [participantsResult, submissionsResult, analyticsResult, questionsResult, recentStuckResult] = await Promise.all([
      supabase
        .from('participants')
        .select('id, display_name, email, joined_at, last_seen_at, current_step_id, feedback_submitted')
        .eq('session_id', initialSession.id)
        .order('joined_at', { ascending: true }),
      supabase
        .from('submissions')
        .select('participant_id, step_id')
        .eq('session_id', initialSession.id),
      supabase
        .from('analytics_events')
        .select('participant_id, event_type')
        .eq('session_id', initialSession.id),
      supabase
        .from('session_questions')
        .select('participant_id')
        .eq('session_id', initialSession.id),
      supabase
        .from('analytics_events')
        .select('participant_id')
        .eq('session_id', initialSession.id)
        .eq('event_type', 'stuck_signal')
        .gte('created_at', fiveMinutesAgo),
    ]);

    const { rows, summary } = buildSessionParticipationRows({
      participants: participantsResult.data ?? [],
      submissions: submissionsResult.data ?? [],
      analyticsEvents: analyticsResult.data ?? [],
      questions: questionsResult.data ?? [],
      stepTitlesById,
    });

    const activeStuckParticipants = new Set(
      (recentStuckResult.data ?? []).map(s => s.participant_id)
    );

    setParticipantCount(summary.totalParticipants);
    setStuckCount(activeStuckParticipants.size);
    setParticipationSummary(summary);

    return rows;
  }, [initialSession.id, stepTitlesById]);

  // Fetch completion count for current step
  const fetchCompletions = useCallback(async () => {
    const stepId = currentStepIdRef.current;
    if (!stepId) {
      setCompletedCount(0);
      return;
    }

    const supabase = createClient();
    const { count } = await supabase
      .from('submissions')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', initialSession.id)
      .eq('step_id', stepId);

    setCompletedCount(count || 0);
  }, [initialSession.id]);

  const refreshDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshPendingRef = useRef({ analytics: false, completions: false });
  const refreshInFlightRef = useRef({ analytics: false, completions: false });
  const refreshQueuedRef = useRef({ analytics: false, completions: false });

  const runParticipationRefresh = useCallback(async () => {
    if (refreshInFlightRef.current.analytics) {
      refreshQueuedRef.current.analytics = true;
      return;
    }

    refreshInFlightRef.current.analytics = true;
    try {
      await fetchParticipationAnalytics();
    } finally {
      refreshInFlightRef.current.analytics = false;
      if (refreshQueuedRef.current.analytics) {
        refreshQueuedRef.current.analytics = false;
        void runParticipationRefresh();
      }
    }
  }, [fetchParticipationAnalytics]);

  const runCompletionsRefresh = useCallback(async () => {
    if (refreshInFlightRef.current.completions) {
      refreshQueuedRef.current.completions = true;
      return;
    }

    refreshInFlightRef.current.completions = true;
    try {
      await fetchCompletions();
    } finally {
      refreshInFlightRef.current.completions = false;
      if (refreshQueuedRef.current.completions) {
        refreshQueuedRef.current.completions = false;
        void runCompletionsRefresh();
      }
    }
  }, [fetchCompletions]);

  const flushScheduledRefreshes = useCallback(() => {
    const runAnalytics = refreshPendingRef.current.analytics;
    const runCompletions = refreshPendingRef.current.completions;

    refreshPendingRef.current.analytics = false;
    refreshPendingRef.current.completions = false;

    if (runCompletions) {
      void runCompletionsRefresh();
    }

    if (runAnalytics) {
      void runParticipationRefresh();
    }
  }, [runCompletionsRefresh, runParticipationRefresh]);

  const scheduleRealtimeRefresh = useCallback(
    (options: { analytics?: boolean; completions?: boolean }) => {
      if (options.analytics) {
        refreshPendingRef.current.analytics = true;
      }
      if (options.completions) {
        refreshPendingRef.current.completions = true;
      }

      if (refreshDebounceTimerRef.current) return;
      refreshDebounceTimerRef.current = setTimeout(() => {
        refreshDebounceTimerRef.current = null;
        flushScheduledRefreshes();
      }, 300);
    },
    [flushScheduledRefreshes]
  );

  // Fetch completion count once when current step changes (Realtime handles incremental updates)
  useEffect(() => {
    currentStepIdRef.current = session.currentStepId;
    void fetchCompletions();
  }, [fetchCompletions, session.currentStepId]);

  useEffect(() => {
    void fetchParticipationAnalytics();
  }, [fetchParticipationAnalytics]);

  useEffect(() => () => {
    if (refreshDebounceTimerRef.current) {
      clearTimeout(refreshDebounceTimerRef.current);
      refreshDebounceTimerRef.current = null;
    }
  }, []);

  // Map snake_case API keys to camelCase state keys
  const mapApiToState = (updates: Record<string, unknown>): Record<string, unknown> => {
    const keyMap: Record<string, string> = {
      current_step_id: 'currentStepId',
      timer_end_at: 'timerEndAt',
      join_code: 'joinCode',
      organization_name: 'organizationName',
      template_name: 'templateName',
    };
    const mapped: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates)) {
      mapped[keyMap[key] || key] = value;
    }
    return mapped;
  };

  // Update session
  const updateSession = async (updates: Record<string, unknown>) => {
    setIsUpdating(true);
    try {
      const response = await fetch(`/api/admin/sessions/${session.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error);
      }

      setSession(prev => ({ ...prev, ...mapApiToState(updates) }));
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update session');
      return false;
    } finally {
      setIsUpdating(false);
    }
  };

  // Navigation handlers
  const goToStep = async (stepId: string) => {
    await updateSession({ current_step_id: stepId });
    setCompletedCount(0);
  };

  const nextStep = () => {
    if (!isLastStep) {
      goToStep(allSteps[currentStepIndex + 1].id);
    }
  };

  const prevStep = () => {
    if (!isFirstStep) {
      goToStep(allSteps[currentStepIndex - 1].id);
    }
  };

  // Start/end session
  const startSession = async () => {
    const firstStepId = allSteps[0]?.id;
    await updateSession({
      status: 'live',
      current_step_id: firstStepId,
      started_at: new Date().toISOString(),
    });
  };

  const endSession = async () => {
    await updateSession({
      status: 'ended',
      ended_at: new Date().toISOString(),
    });
    router.push('/admin/sessions');
  };

  // Timer
  const startTimer = async (minutes: number) => {
    const endAt = new Date(Date.now() + minutes * 60 * 1000).toISOString();
    const success = await updateSession({ timer_end_at: endAt });
    if (success) {
      broadcastChannelRef.current?.send({
        type: 'broadcast',
        event: 'timer_update',
        payload: { timer_end_at: endAt },
      });
    }
  };

  const stopTimer = async () => {
    const success = await updateSession({ timer_end_at: null });
    if (success) {
      broadcastChannelRef.current?.send({
        type: 'broadcast',
        event: 'timer_update',
        payload: { timer_end_at: null },
      });
    }
  };

  // Fetch Q&A
  const fetchQuestions = useCallback(async () => {
    try {
      const res = await fetch(`/api/questions?sessionId=${initialSession.id}`);
      const data = await res.json();
      if (data.success) setQuestions(data.data);
    } catch { /* silent */ }
  }, [initialSession.id]);

  useEffect(() => {
    fetchQuestions();
  }, [fetchQuestions]);

  // Subscribe to realtime updates + track facilitator presence
  useEffect(() => {
    const supabase = createClient();
    let mounted = true;

    setChannelStatuses({
      presenter: 'connecting',
      broadcast: 'connecting',
    });

    const presenterChannel = supabase
      .channel(`presenter:${initialSession.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'participants',
          filter: `session_id=eq.${initialSession.id}`,
        },
        () => {
          scheduleRealtimeRefresh({ analytics: true });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'analytics_events',
          filter: `session_id=eq.${initialSession.id}`,
        },
        (payload) => {
          if (payload.new.event_type === 'stuck_signal') {
            scheduleRealtimeRefresh({ analytics: true });
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'submissions',
          filter: `session_id=eq.${initialSession.id}`,
        },
        () => {
          scheduleRealtimeRefresh({ analytics: true, completions: true });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'session_questions',
          filter: `session_id=eq.${initialSession.id}`,
        },
        () => {
          void fetchQuestions();
          scheduleRealtimeRefresh({ analytics: true });
        }
      )
      .subscribe((status) => {
        if (!mounted) return;
        setChannelStatuses((previous) => ({
          ...previous,
          presenter: mapRealtimeChannelStatus(status),
        }));
      });

    const presenceChannel = supabase.channel(`presence:${initialSession.id}`);

    presenceChannel.subscribe(async (status) => {
      if (!mounted) return;
      if (status === 'SUBSCRIBED') {
        try {
          await presenceChannel.track({ role: 'facilitator' });
        } catch {
          // Presence tracking is best-effort and should not impact connection badge state.
        }
      }
    });

    const bcastChannel = supabase.channel(`workshop-broadcast:${initialSession.id}`);
    bcastChannel.subscribe((status) => {
      if (!mounted) return;
      setChannelStatuses((previous) => ({
        ...previous,
        broadcast: mapRealtimeChannelStatus(status),
      }));
    });
    broadcastChannelRef.current = bcastChannel;

    return () => {
      mounted = false;
      supabase.removeChannel(presenterChannel);
      supabase.removeChannel(presenceChannel);
      supabase.removeChannel(bcastChannel);
      broadcastChannelRef.current = null;
    };
  }, [fetchQuestions, initialSession.id, scheduleRealtimeRefresh]);

  // Answer a question
  const answerQuestion = useCallback(async (questionId: string, answerText: string): Promise<boolean> => {
    const text = answerText.trim();
    if (!text) return false;

    try {
      const res = await fetch(`/api/questions/${questionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answerText: text }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      toast.success('Answer sent');
      return true;
    } catch {
      toast.error('Failed to answer');
      return false;
    }
  }, []);

  // Delete a question
  const deleteQuestion = useCallback(async (questionId: string): Promise<void> => {
    try {
      const res = await fetch(`/api/questions/${questionId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
    } catch {
      toast.error('Failed to delete');
    }
  }, []);

  const completionPercentage = participantCount > 0 
    ? Math.round((completedCount / participantCount) * 100) 
    : 0;

  const [selectedTimerMinutes, setSelectedTimerMinutes] = useState(5);

  const copyJoinCode = () => {
    navigator.clipboard.writeText(session.joinCode);
    toast.success('Join code copied!');
  };

  const exportCSV = async () => {
    try {
      const rows = await fetchParticipationAnalytics();
      const csv = buildSessionParticipationCsv(rows);
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `session-${session.joinCode}-participation.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Participation CSV exported');
    } catch {
      toast.error('Failed to export');
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      {/* Header */}
      <header className="bg-gray-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/sessions"
            className="p-2 -ml-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
            title="Back to Dashboard"
          >
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <Image
            src="/biz-group-logo.webp"
            alt="Biz Group"
            width={32}
            height={31}
            className="rounded"
          />
          <div>
            <h1 className="text-xl font-semibold">{session.templateName}</h1>
            <p className="text-gray-400 text-sm">{session.organizationName}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className={`px-3 py-1 rounded-full text-sm inline-flex items-center gap-1.5 ${
            session.status === 'live' 
              ? 'bg-green-500/20 text-green-400'
              : session.status === 'ended'
                ? 'bg-red-500/20 text-red-400'
                : 'bg-yellow-500/20 text-yellow-400'
          }`}>
            <span className={`w-2 h-2 rounded-full ${
              session.status === 'live' ? 'bg-green-400 animate-pulse' : session.status === 'ended' ? 'bg-red-400' : 'bg-yellow-400'
            }`} />
            {session.status === 'live' ? 'Active' : session.status === 'ended' ? 'Ended' : 'Inactive'}
          </span>
          <span className={`px-3 py-1 rounded-full text-sm inline-flex items-center gap-1.5 ${
            broadcastStatus === 'connected'
              ? 'bg-green-500/20 text-green-400'
              : broadcastStatus === 'error'
                ? 'bg-red-500/20 text-red-400'
                : 'bg-yellow-500/20 text-yellow-400'
          }`}>
            {broadcastStatus === 'connected' ? (
              <Wifi className="w-3.5 h-3.5" />
            ) : broadcastStatus === 'error' ? (
              <WifiOff className="w-3.5 h-3.5" />
            ) : (
              <Wifi className="w-3.5 h-3.5 animate-pulse" />
            )}
            {broadcastStatus === 'connected' ? 'Broadcasting' : broadcastStatus === 'error' ? 'Disconnected' : 'Connecting'}
          </span>
          {session.status === 'live' && (
            <Button variant="danger" size="sm" onClick={endSession}>
              <Square className="w-4 h-4 mr-2" />
              End Session
            </Button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex min-h-0 overflow-auto">
        {/* Left Panel - Participant List */}
        <div className="w-72 flex-shrink-0 flex flex-col border-r border-gray-700 overflow-y-auto">
          <ParticipantList
            sessionId={session.id}
            allStepIds={allStepIds}
            totalSteps={allSteps.length}
            className="flex-1 overflow-y-auto"
          />
        </div>

        {/* Center-Left Panel - Join Code & Stats */}
        <div className="w-72 flex-shrink-0 bg-gray-800 p-6 flex flex-col border-r border-gray-700 overflow-y-auto">
          {/* Join Code */}
          <div className="text-center mb-8">
            <p className="text-gray-400 text-sm mb-2">JOIN CODE</p>
            <div className="presenter-join-code px-1 text-brand-400">
              {formatJoinCodeForDisplay(session.joinCode)}
            </div>
            <p className="text-gray-500 text-sm mt-2">
              go to <span className="text-brand-400">/join</span>
            </p>
            <button
              onClick={() => setShowQrModal(true)}
              className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-300 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
            >
              <QrCode className="w-4 h-4" />
              Show QR Code
            </button>
          </div>

          {/* Stats */}
          <div className="space-y-4 flex-1">
            <Card className="bg-gray-700 border-gray-600">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="w-5 h-5 text-brand-400" />
                    <span className="text-gray-300">Participants</span>
                  </div>
                  <span className="text-2xl font-bold">{participantCount}</span>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gray-700 border-gray-600">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-green-400" />
                    <span className="text-gray-300">Step Completed</span>
                  </div>
                  <span className="text-xl font-bold">{completedCount}/{participantCount}</span>
                </div>
                <ProgressBar value={completionPercentage} className="bg-gray-600" />
              </CardContent>
            </Card>

            <Card className="bg-gray-700 border-gray-600">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-300">Active now</span>
                  <span className="font-semibold">{participationSummary.activeParticipants}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-300">With submissions</span>
                  <span className="font-semibold">{participationSummary.participantsWithSubmissions}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-300">Questions asked</span>
                  <span className="font-semibold">{participationSummary.totalQuestions}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-300">Total stuck signals</span>
                  <span className="font-semibold">{participationSummary.totalStuckSignals}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-300">Pack downloads</span>
                  <span className="font-semibold">{participationSummary.promptPackDownloads}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-300">Pack emails</span>
                  <span className="font-semibold">{participationSummary.promptPackEmails}</span>
                </div>
              </CardContent>
            </Card>

            {stuckCount > 0 && (
              <Card className="bg-orange-500/20 border-orange-500/50">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-orange-400" />
                    <span className="text-orange-300">{stuckCount} need help</span>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Timer Controls */}
          <div className="mt-4">
            <p className="text-gray-400 text-sm mb-2">TIMER</p>
            {session.timerEndAt ? (
              <div className="space-y-2">
                <Timer endAt={session.timerEndAt} size="xl" className="text-center" />
                <Button variant="secondary" size="sm" onClick={stopTimer} className="w-full">
                  Stop Timer
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedTimerMinutes((prev) => Math.max(1, prev - 1))}
                  className="p-2 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded-lg text-white transition-colors"
                  aria-label="Decrease timer minutes"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <div className="flex-1 text-center text-2xl font-bold text-white tabular-nums">
                  {selectedTimerMinutes}m
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedTimerMinutes((prev) => Math.min(120, prev + 1))}
                  className="p-2 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded-lg text-white transition-colors"
                  aria-label="Increase timer minutes"
                >
                  <Plus className="w-4 h-4" />
                </button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => startTimer(selectedTimerMinutes)}
                >
                  Start
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Center Panel - Current Step */}
        <div className="flex-1 flex flex-col p-8 overflow-y-auto">
          {session.status !== 'live' ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <h2 className="text-3xl font-bold mb-4">Ready to Start?</h2>
                <p className="text-gray-400 mb-8">
                  {participantCount} participant{participantCount !== 1 ? 's' : ''} have joined
                </p>
                <Button size="lg" onClick={startSession}>
                  <Play className="w-5 h-5 mr-2" />
                  Start Workshop
                </Button>
              </div>
            </div>
          ) : (
            <>
              {/* Step Info */}
              <div className="text-center mb-8">
                <p className="text-gray-400 text-sm mb-2">
                  Step {currentStepIndex + 1} of {allSteps.length} • {currentStep?.moduleTitle}
                </p>
                <h2 className="presenter-step-title text-4xl font-bold">
                  {currentStep?.title}
                </h2>
                {currentStep?.estimated_minutes && (
                  <p className="text-gray-400 mt-2 flex items-center justify-center gap-2">
                    <Clock className="w-4 h-4" />
                    {currentStep.estimated_minutes} minutes
                  </p>
                )}
              </div>

              {/* Step List */}
              <div className="flex-1 overflow-y-auto">
                <div className="max-w-2xl mx-auto space-y-2">
                  {allSteps.map((step, index) => (
                    <button
                      key={step.id}
                      onClick={() => goToStep(step.id)}
                      className={cn(
                        'w-full text-left px-4 py-3 rounded-lg transition-colors',
                        index === currentStepIndex
                          ? 'bg-brand-600 text-white'
                          : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-sm opacity-60">{index + 1}</span>
                          <span className="font-medium">{step.title}</span>
                        </div>
                        {step.is_required && (
                          <span className="text-xs bg-white/10 px-2 py-0.5 rounded">Required</span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Navigation */}
              <div className="flex items-center justify-between mt-8">
                <Button
                  variant="secondary"
                  onClick={prevStep}
                  disabled={isFirstStep || isUpdating}
                >
                  <ChevronLeft className="w-5 h-5 mr-1" />
                  Previous
                </Button>

                <div className="flex items-center gap-4">
                  <Button
                    variant="ghost"
                    onClick={fetchCompletions}
                    disabled={isUpdating}
                  >
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                </div>

                <Button
                  onClick={nextStep}
                  disabled={isLastStep || isUpdating}
                >
                  Next
                  <ChevronRight className="w-5 h-5 ml-1" />
                </Button>
              </div>
            </>
          )}
        </div>

        {/* Right Panel - Quick Actions + Q&A */}
        <div className="w-80 bg-gray-800 p-4 flex flex-col overflow-y-auto">
          <h3 className="text-sm font-medium text-gray-400 mb-3">QUICK ACTIONS</h3>
          <div className="space-y-1.5">
            <Button
              variant="secondary"
              size="sm"
              className="w-full justify-start"
              onClick={copyJoinCode}
            >
              <Copy className="w-4 h-4 mr-2" />
              Copy Join Code
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="w-full justify-start"
              onClick={() => setShowQrModal(true)}
            >
              <QrCode className="w-4 h-4 mr-2" />
              Show QR Code
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="w-full justify-start"
              onClick={async () => {
                try {
                  const supabase = createClient();
                  const { data: snapshotModules, error } = await supabase
                    .from('session_snapshot_modules')
                    .select(`
                      id, title, objective, order_index,
                      steps:session_snapshot_steps(
                        id, title, instruction_markdown, order_index,
                        estimated_minutes, is_required, ai_tool_name, ai_tool_url,
                        prompt_blocks:session_snapshot_prompt_blocks(
                          id, title, content_markdown, is_copyable, order_index
                        )
                      )
                    `)
                    .eq('session_id', session.id)
                    .order('order_index');
                  if (error || !snapshotModules?.length) {
                    toast.error('No session content to preview');
                    return;
                  }
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const sorted = (snapshotModules as any[])
                    .sort((a, b) => a.order_index - b.order_index)
                    .map(m => ({
                      ...m,
                      steps: (m.steps || [])
                        .sort((a: { order_index: number }, b: { order_index: number }) => a.order_index - b.order_index)
                        .map((s: { prompt_blocks?: Array<{ order_index: number }> }) => ({
                          ...s,
                          prompt_blocks: (s.prompt_blocks || []).sort((a: { order_index: number }, b: { order_index: number }) => a.order_index - b.order_index),
                        })),
                    }));
                  setPreviewModules(sorted);
                } catch {
                  toast.error('Failed to load preview');
                }
              }}
            >
              <Eye className="w-4 h-4 mr-2" />
              Preview as Attendee
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="w-full justify-start"
              onClick={exportCSV}
            >
              <Download className="w-4 h-4 mr-2" />
              Export Participation CSV
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="w-full justify-start"
              onClick={() => {
                window.open(`/session/${session.id}/gallery`, '_blank');
              }}
            >
              <ImageIcon className="w-4 h-4 mr-2" />
              Submission Gallery
            </Button>
          </div>

          {/* Quick Step Jump */}
          {session.status === 'live' && allSteps.length > 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-medium text-gray-400 mb-2">JUMP TO STEP</h3>
              <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                {allSteps.map((step, index) => (
                  <button
                    key={step.id}
                    onClick={() => goToStep(step.id)}
                    className={cn(
                      'w-full text-left px-2 py-1.5 rounded text-xs transition-colors truncate',
                      index === currentStepIndex
                        ? 'bg-brand-600 text-white'
                        : 'text-gray-400 hover:text-white hover:bg-gray-700'
                    )}
                  >
                    <span className="opacity-60 mr-1">{index + 1}.</span>
                    {step.title}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Q&A Panel */}
          <PresenterQAPanel
            questions={questions}
            onAnswerQuestion={answerQuestion}
            onDeleteQuestion={deleteQuestion}
          />
        </div>
      </main>

      {/* QR Code Modal */}
      {showQrModal && (
        <LazyQrCodeModal
          isOpen={showQrModal}
          onClose={() => setShowQrModal(false)}
          joinCode={formatJoinCodeForDisplay(session.joinCode)}
          joinUrl={typeof window !== 'undefined' ? `${window.location.origin}/join/${session.joinCode}` : ''}
        />
      )}

      {/* Session Preview Modal */}
      {previewModules && (
        <LazyTemplatePreview
          templateName={session.templateName}
          modules={previewModules}
          onClose={() => setPreviewModules(null)}
        />
      )}
    </div>
  );
}
