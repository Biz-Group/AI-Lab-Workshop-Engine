'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
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
  ExternalLink,
  CheckCircle,
  Copy,
  Download,
  QrCode,
  MessageCircle,
  Send,
  Trash2,
  ChevronDown as ChevDown,
  Minus,
  Plus,
  ImageIcon,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { Button, Timer, Card, CardContent, ProgressBar, QrCodeModal } from '@/components/ui';
import { ParticipantList } from './ParticipantList';
import { createClient } from '@/lib/supabase';
import { formatJoinCodeForDisplay, cn } from '@/lib/utils';
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
  const broadcastChannelRef = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null);

  // Q&A state
  interface Question {
    id: string;
    participant_name: string;
    question_text: string;
    answer_text: string | null;
    is_answered: boolean;
    created_at: string;
  }
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answerDrafts, setAnswerDrafts] = useState<Record<string, string>>({});
  const [showAnswered, setShowAnswered] = useState(false);
  const [broadcastStatus, setBroadcastStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');

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

  const currentStepIndex = allSteps.findIndex(s => s.id === session.currentStepId);
  const currentStep = allSteps[currentStepIndex] || allSteps[0];
  const isFirstStep = currentStepIndex <= 0;
  const isLastStep = currentStepIndex >= allSteps.length - 1;

  // Subscribe to realtime updates + track facilitator presence
  useEffect(() => {
    const supabase = createClient();

    // Combined presenter channel - listen for participants, stuck signals, submissions, and Q&A
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
          setParticipantCount(prev => prev + 1);
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
            setStuckCount(prev => prev + 1);
            setTimeout(() => setStuckCount(prev => Math.max(0, prev - 1)), 30000);
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
          // Refresh completion count when a new submission comes in
          fetchCompletions();
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
          fetchQuestions();
        }
      )
      .subscribe();

    const presenceChannel = supabase.channel(`presence:${initialSession.id}`);
    let mounted = true;

    presenceChannel.subscribe(async (status) => {
      if (!mounted) return;
      if (status === 'SUBSCRIBED') {
        setBroadcastStatus('connected');
        await presenceChannel.track({ role: 'facilitator' });
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        setBroadcastStatus('error');
      }
    });

    // Broadcast channel for timer/session events to participants
    const bcastChannel = supabase.channel(`workshop-broadcast:${initialSession.id}`);
    bcastChannel.subscribe();
    broadcastChannelRef.current = bcastChannel;

    return () => {
      mounted = false;
      supabase.removeChannel(presenterChannel);
      supabase.removeChannel(presenceChannel);
      supabase.removeChannel(bcastChannel);
      broadcastChannelRef.current = null;
    };
  }, [initialSession.id]);

  // Fetch completion count for current step
  const fetchCompletions = useCallback(async () => {
    if (!session.currentStepId) return;

    const supabase = createClient();
    const { count } = await supabase
      .from('submissions')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', initialSession.id)
      .eq('step_id', session.currentStepId);

    setCompletedCount(count || 0);
  }, [session.currentStepId, initialSession.id]);

  // Fetch completion count once when current step changes (Realtime handles incremental updates)
  useEffect(() => {
    fetchCompletions();
  }, [fetchCompletions]);

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

  // Answer a question
  const answerQuestion = async (questionId: string) => {
    const text = answerDrafts[questionId]?.trim();
    if (!text) return;
    try {
      const res = await fetch(`/api/questions/${questionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answerText: text }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setAnswerDrafts(prev => { const n = { ...prev }; delete n[questionId]; return n; });
      toast.success('Answer sent');
    } catch {
      toast.error('Failed to answer');
    }
  };

  // Delete a question
  const deleteQuestion = async (questionId: string) => {
    try {
      const res = await fetch(`/api/questions/${questionId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
    } catch {
      toast.error('Failed to delete');
    }
  };

  const unansweredQuestions = questions.filter(q => !q.is_answered);
  const answeredQuestions = questions.filter(q => q.is_answered);

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
      const supabase = createClient();
      const { data: participants } = await supabase
        .from('participants')
        .select('display_name, created_at')
        .eq('session_id', session.id)
        .order('created_at');

      const { data: submissions } = await supabase
        .from('submissions')
        .select('participant_id, step_id, content, created_at')
        .eq('session_id', session.id)
        .order('created_at');

      let csv = 'Participant,Joined At,Step,Submission,Submitted At\n';
      (participants || []).forEach(p => {
        const subs = (submissions || []).filter((s: any) => {
          // Match by participant - just include all for simplicity
          return true;
        });
        if (subs.length === 0) {
          csv += `"${p.display_name}","${p.created_at}","","",""\n`;
        }
      });
      (submissions || []).forEach((s: any) => {
        csv += `"","","${s.step_id}","${(s.content || '').replace(/"/g, '""')}","${s.created_at}"\n`;
      });

      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `session-${session.joinCode}-export.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('CSV exported');
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
            height={32}
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
      <main className="flex-1 flex overflow-hidden">
        {/* Left Panel - Participant List */}
        <div className="w-72 flex-shrink-0 flex flex-col border-r border-gray-700 overflow-hidden">
          <ParticipantList
            sessionId={session.id}
            allStepIds={allSteps.map(s => s.id)}
            totalSteps={allSteps.length}
            className="flex-1 overflow-hidden"
          />
        </div>

        {/* Center-Left Panel - Join Code & Stats */}
        <div className="w-72 flex-shrink-0 bg-gray-800 p-6 flex flex-col border-r border-gray-700">
          {/* Join Code */}
          <div className="text-center mb-8 px-2">
            <p className="text-gray-400 text-sm mb-2">JOIN CODE</p>
            <div className="presenter-join-code -ml-2 text-5xl text-brand-400">
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
                    <span className="text-gray-300">Completed</span>
                  </div>
                  <span className="text-xl font-bold">{completedCount}/{participantCount}</span>
                </div>
                <ProgressBar value={completionPercentage} className="bg-gray-600" />
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
        <div className="flex-1 flex flex-col p-8">
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
              onClick={() => {
                window.open(`/s/${session.id}`, '_blank');
              }}
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              Preview as Attendee
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="w-full justify-start"
              onClick={exportCSV}
            >
              <Download className="w-4 h-4 mr-2" />
              Export CSV
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
              Image Gallery
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
          <div className="mt-5 border-t border-gray-700 pt-4 flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-gray-400 flex items-center gap-2">
                <MessageCircle className="w-4 h-4" />
                Q&A
                {unansweredQuestions.length > 0 && (
                  <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                    {unansweredQuestions.length}
                  </span>
                )}
              </h3>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
              {unansweredQuestions.length === 0 && answeredQuestions.length === 0 ? (
                <p className="text-xs text-gray-500 text-center py-4">No questions yet</p>
              ) : (
                <>
                  {/* Unanswered Questions */}
                  {unansweredQuestions.map(q => (
                    <div key={q.id} className="bg-gray-700 rounded-lg p-3 border border-amber-500/30">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <span className="text-xs font-medium text-brand-400">{q.participant_name}</span>
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-gray-500">
                            {new Date(q.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <button
                            onClick={() => deleteQuestion(q.id)}
                            className="p-0.5 text-gray-500 hover:text-red-400 transition-colors"
                            title="Remove question"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                      <p className="text-sm text-gray-200 mb-2">{q.question_text}</p>
                      <div className="flex gap-1.5">
                        <input
                          type="text"
                          value={answerDrafts[q.id] || ''}
                          onChange={(e) => setAnswerDrafts(prev => ({ ...prev, [q.id]: e.target.value }))}
                          onKeyDown={(e) => e.key === 'Enter' && answerQuestion(q.id)}
                          placeholder="Type answer..."
                          className="flex-1 px-2 py-1 bg-gray-600 border border-gray-500 rounded text-xs text-white placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-brand-500"
                        />
                        <button
                          onClick={() => answerQuestion(q.id)}
                          disabled={!answerDrafts[q.id]?.trim()}
                          className="p-1 bg-brand-600 text-white rounded hover:bg-brand-700 disabled:opacity-40 transition-colors"
                        >
                          <Send className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}

                  {/* Answered Questions (collapsible) */}
                  {answeredQuestions.length > 0 && (
                    <div>
                      <button
                        onClick={() => setShowAnswered(!showAnswered)}
                        className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-400 transition-colors py-1"
                      >
                        <ChevDown className={cn('w-3 h-3 transition-transform', showAnswered && 'rotate-180')} />
                        Answered ({answeredQuestions.length})
                      </button>
                      {showAnswered && (
                        <div className="space-y-2 mt-1">
                          {answeredQuestions.map(q => (
                            <div key={q.id} className="bg-gray-700/50 rounded-lg p-2.5 border border-green-500/20">
                              <div className="flex items-start justify-between gap-2 mb-0.5">
                                <span className="text-xs text-gray-400">{q.participant_name}</span>
                                <button
                                  onClick={() => deleteQuestion(q.id)}
                                  className="p-0.5 text-gray-500 hover:text-red-400 transition-colors"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                              <p className="text-xs text-gray-300 mb-1">{q.question_text}</p>
                              <p className="text-xs text-green-400">↳ {q.answer_text}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* QR Code Modal */}
      <QrCodeModal
        isOpen={showQrModal}
        onClose={() => setShowQrModal(false)}
        joinCode={formatJoinCodeForDisplay(session.joinCode)}
        joinUrl={typeof window !== 'undefined' ? `${window.location.origin}/join/${session.joinCode}` : ''}
      />
    </div>
  );
}
