'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { 
  ChevronLeft, 
  ChevronRight, 
  ExternalLink, 
  AlertCircle,
  CheckCircle,
  Trophy,
  MessageCircle,
  Send,
  X,
  ImagePlus,
  Trash2,
  BookOpen,
  ListChecks,
  ClipboardCheck,
  Lightbulb,
  Clock3,
} from 'lucide-react';
import { 
  Button, 
  Card, 
  CardContent, 
  PromptBlock, 
  Timer,
  TextArea 
} from '@/components/ui';
import { NarrativeProgressMap } from './NarrativeProgressMap';
import { ChapterCelebration, useChapterCelebration } from './ChapterCelebration';
import { createClient } from '@/lib/supabase';
import { parseChecklistItems, parseStepInstructions } from '@/lib/utils';
import toast from 'react-hot-toast';

interface Module {
  id: string;
  title: string;
  objective: string | null;
  order_index: number;
  steps: Step[];
}

interface Step {
  id: string;
  title: string;
  instruction_markdown: string;
  order_index: number;
  estimated_minutes: number | null;
  is_required: boolean;
  ai_tool_name?: string;
  ai_tool_url?: string;
  prompt_blocks: PromptBlockType[];
}

interface PromptBlockType {
  id: string;
  title: string;
  content_markdown: string;
  order_index: number;
  is_copyable: boolean;
}

interface Submission {
  id: string;
  step_id: string;
  content: string;
  image_url?: string | null;
  updated_at?: string;
}

interface WorkshopRunnerProps {
  session: {
    id: string;
    status: string;
    currentStepId: string | null;
    timerEndAt: string | null;
    organization: { id: string; name: string; logo_url: string | null };
    template: { name: string; description: string | null };
    aiToolName?: string;
    aiToolUrl?: string;
  };
  modules: Module[];
  participant: {
    id: string;
    displayName: string;
  };
  submissions: Submission[];
}

function buildVersionedImageUrl(url: string, updatedAt?: string) {
  if (!updatedAt) return url;
  const version = Date.parse(updatedAt);
  if (Number.isNaN(version)) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}v=${version}`;
}

function getDeliverablePreview(deliverable: string | undefined) {
  if (!deliverable) return null;
  const firstLine = deliverable
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean);

  if (!firstLine) return null;
  if (firstLine.length <= 80) return firstLine;
  return `${firstLine.slice(0, 77)}...`;
}

export function WorkshopRunner({ 
  session: initialSession, 
  modules, 
  participant,
  submissions: initialSubmissions 
}: WorkshopRunnerProps) {
  const router = useRouter();
  const [session, setSession] = useState(initialSession);
  const [submissions, setSubmissions] = useState(initialSubmissions);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [submissionContent, setSubmissionContent] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageMarkedForRemoval, setImageMarkedForRemoval] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isStuck, setIsStuck] = useState(false);
  const [isQAOpen, setIsQAOpen] = useState(false);
  const [questions, setQuestions] = useState<Array<{
    id: string;
    participant_name: string;
    question_text: string;
    answer_text: string | null;
    is_answered: boolean;
    created_at: string;
  }>>([]);
  const [questionText, setQuestionText] = useState('');
  const [isAskingQuestion, setIsAskingQuestion] = useState(false);
  const [visitedStepIds, setVisitedStepIds] = useState<Set<string>>(new Set());
  const [pendingStepIndex, setPendingStepIndex] = useState<number | null>(null);
  const [isSkipWarningOpen, setIsSkipWarningOpen] = useState(false);

  // Flatten steps for navigation (memoized — only recalculates when modules change)
  const allSteps = useMemo(() => modules.flatMap((module, moduleIndex) => 
    module.steps.map((step, stepIndex) => ({
      ...step,
      moduleTitle: module.title,
      moduleIndex,
      stepIndex,
      globalIndex: modules.slice(0, moduleIndex).reduce((acc, m) => acc + m.steps.length, 0) + stepIndex,
    }))
  ), [modules]);

  const currentStep = allSteps[currentStepIndex];
  const isLastStep = currentStepIndex === allSteps.length - 1;
  const existingSubmission = submissions.find(s => s.step_id === currentStep?.id);
  const hasEffectiveImage = !!imageFile || (!!existingSubmission?.image_url && !imageMarkedForRemoval);
  const canSubmit = submissionContent.trim().length > 0 || hasEffectiveImage;
  const parsedInstructions = useMemo(() => parseStepInstructions(currentStep?.instruction_markdown || ''), [currentStep?.instruction_markdown]);
  const checklistItems = useMemo(() => parseChecklistItems(parsedInstructions.checklist), [parsedInstructions.checklist]);
  const deliverablePreview = useMemo(() => getDeliverablePreview(parsedInstructions.deliverable), [parsedInstructions.deliverable]);

  // No longer sync with facilitator's current step - allow free navigation
  // useEffect removed to prevent navigation reset

  // Fetch questions — defined before realtime so it can be referenced in subscriptions
  const fetchQuestions = useCallback(async () => {
    try {
      const res = await fetch(`/api/questions?sessionId=${initialSession.id}`);
      const data = await res.json();
      if (data.success) setQuestions(data.data);
    } catch { /* silent */ }
  }, [initialSession.id]);

  // Initial question fetch
  useEffect(() => {
    fetchQuestions();
  }, [fetchQuestions]);

  // Subscribe to session realtime updates
  useEffect(() => {
    const supabase = createClient();
    
    const sessionChannel = supabase
      .channel(`session:${initialSession.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'sessions',
          filter: `id=eq.${initialSession.id}`,
        },
        (payload) => {
          const updated = payload.new as {
            status: string;
            current_step_id: string | null;
            timer_end_at: string | null;
          };
          
          setSession(prev => ({
            ...prev,
            status: updated.status,
            currentStepId: updated.current_step_id,
            timerEndAt: updated.timer_end_at,
          }));

          if (updated.status === 'ended') {
            router.push(`/s/${initialSession.id}/end`);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(sessionChannel);
    };
  }, [initialSession.id, router]);

  // Subscribe to Q&A realtime updates (separate effect so fetchQuestions is always current)
  useEffect(() => {
    const supabase = createClient();

    const qaChannel = supabase
      .channel(`questions:${initialSession.id}`)
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

    return () => {
      supabase.removeChannel(qaChannel);
    };
  }, [initialSession.id, fetchQuestions]);

  // Ask a question
  const handleAskQuestion = async () => {
    if (!questionText.trim()) return;
    setIsAskingQuestion(true);
    try {
      const res = await fetch('/api/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: initialSession.id,
          participantId: participant.id,
          participantName: participant.displayName,
          questionText: questionText.trim(),
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setQuestionText('');
      toast.success('Question submitted!');
      fetchQuestions();
    } catch {
      toast.error('Failed to submit question');
    } finally {
      setIsAskingQuestion(false);
    }
  };

  // Log analytics events
  const logEvent = useCallback(async (eventType: string, payload?: Record<string, unknown>) => {
    try {
      await fetch('/api/analytics/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          participantId: participant.id,
          sessionId: initialSession.id,
          eventType,
          payload,
        }),
      });
    } catch {
      // Silent fail for analytics
    }
  }, [participant.id, initialSession.id]);

  // Navigate to step
  const goToStep = useCallback((index: number) => {
    if (index < 0 || index >= allSteps.length) return;
    setCurrentStepIndex(index);
    logEvent('step_viewed', { step_id: allSteps[index]?.id });
  }, [allSteps, logEvent]);

  const closeSkipWarning = () => {
    setIsSkipWarningOpen(false);
    setPendingStepIndex(null);
  };

  const attemptStepNavigation = useCallback((nextIndex: number) => {
    if (nextIndex < 0 || nextIndex >= allSteps.length) return;

    const isMovingForward = nextIndex > currentStepIndex;
    const hasCurrentSubmission = !!currentStep?.id && submissions.some((submission) => submission.step_id === currentStep.id);

    if (isMovingForward && !hasCurrentSubmission) {
      setPendingStepIndex(nextIndex);
      setIsSkipWarningOpen(true);
      return;
    }

    goToStep(nextIndex);
  }, [allSteps.length, currentStep?.id, currentStepIndex, goToStep, submissions]);

  const confirmSkipAndContinue = async () => {
    if (pendingStepIndex == null) return;

    const skippedStepId = currentStep?.id;
    const targetStepId = allSteps[pendingStepIndex]?.id;

    closeSkipWarning();

    if (skippedStepId && targetStepId) {
      await logEvent('step_skipped', {
        step_id: skippedStepId,
        skipped_to_step_id: targetStepId,
      });
    }

    goToStep(pendingStepIndex);
  };

  // Handle prompt copy
  const handlePromptCopy = (blockId: string) => {
    logEvent('prompt_copied', { block_id: blockId, step_id: currentStep?.id });
  };

  // Open AI Tool
  const openAITool = () => {
    const toolUrl = currentStep?.ai_tool_url || initialSession.aiToolUrl || 'https://chat.openai.com';
    window.open(toolUrl, '_blank');
    logEvent('chatgpt_opened', { step_id: currentStep?.id });
  };

  // Handle stuck signal
  const handleStuck = async () => {
    setIsStuck(true);
    await logEvent('stuck_signal', { step_id: currentStep?.id });
    toast.success('Your facilitator has been notified.');
    setTimeout(() => setIsStuck(false), 30000); // Reset after 30 seconds
  };

  // Submit response
  const handleSubmit = async () => {
    if (!canSubmit) {
      toast.error('Please enter a response or upload an image');
      return;
    }

    setIsSubmitting(true);
    try {
      let imageUrl: string | null = imageMarkedForRemoval
        ? null
        : (existingSubmission?.image_url ?? null);

      // Upload image first if a new file is selected
      if (imageFile) {
        setIsUploading(true);
        const formData = new FormData();
        formData.append('file', imageFile);
        formData.append('participantId', participant.id);
        formData.append('sessionId', initialSession.id);
        formData.append('stepId', currentStep.id);

        const uploadRes = await fetch('/api/submissions/upload', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${document.cookie.split('workshop_session_token=')[1]?.split(';')[0] || ''}`,
          },
          body: formData,
        });

        const uploadData = await uploadRes.json();
        setIsUploading(false);

        if (!uploadData.success) {
          throw new Error(uploadData.error || 'Failed to upload image');
        }
        imageUrl = uploadData.imageUrl;
      }

      const response = await fetch('/api/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          participantId: participant.id,
          sessionId: initialSession.id,
          stepId: currentStep.id,
          content: submissionContent || '',
          imageUrl,
        }),
      });

      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error);
      }

      const normalizedSubmission: Submission = {
        ...data.submission,
        updated_at: data.submission.updated_at || new Date().toISOString(),
      };
      setSubmissions(prev => [...prev.filter(s => s.step_id !== currentStep.id), normalizedSubmission]);
      setImageFile(null);
      setImagePreview(null);
      setImageMarkedForRemoval(false);
      await logEvent('step_completed', { step_id: currentStep.id });
      toast.success('Response submitted!');

      // Don't auto-advance - let user navigate manually
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to submit response');
    } finally {
      setIsSubmitting(false);
      setIsUploading(false);
    }
  };

  // Populate submission content if existing
  useEffect(() => {
    setSubmissionContent(existingSubmission?.content || '');
    setImageFile(null);
    setImagePreview(
      existingSubmission?.image_url
        ? buildVersionedImageUrl(existingSubmission.image_url, existingSubmission.updated_at)
        : null
    );
    setImageMarkedForRemoval(false);
  }, [existingSubmission, currentStep?.id]);

  useEffect(() => {
    if (!currentStep?.id) return;
    setVisitedStepIds((previous) => {
      if (previous.has(currentStep.id)) return previous;
      const next = new Set(previous);
      next.add(currentStep.id);
      return next;
    });
  }, [currentStep?.id]);

  // Progress steps for sidebar - narrative version (memoized)
  const narrativeSteps = useMemo(() => allSteps.map((step, index) => ({
    id: step.id,
    title: step.title,
    moduleTitle: step.moduleTitle,
    moduleIndex: step.moduleIndex,
    status: submissions.some(s => s.step_id === step.id)
      ? 'completed' as const
      : index === currentStepIndex
        ? 'current' as const
        : visitedStepIds.has(step.id)
          ? 'incomplete' as const
        : 'upcoming' as const,
    isFirstInModule: step.stepIndex === 0,
    isLastInModule: step.stepIndex === modules[step.moduleIndex].steps.length - 1,
    isLastStep: index === allSteps.length - 1,
  })), [allSteps, submissions, currentStepIndex, visitedStepIds, modules]);

  // Chapter celebration hook
  const { celebration, dismissCelebration } = useChapterCelebration(
    narrativeSteps,
    modules.map(m => ({ title: m.title }))
  );

  if (!currentStep) {
    return <div>No steps available</div>;
  }

  return (
    <div className="min-h-screen flex">
      {/* Chapter Celebration Overlay */}
      {celebration && (
        <ChapterCelebration
          chapterTitle={celebration.chapterTitle}
          chapterNumber={celebration.chapterNumber}
          totalChapters={celebration.totalChapters}
          isFinalChapter={celebration.isFinalChapter}
          onDismiss={dismissCelebration}
        />
      )}

      {/* Sidebar - Narrative Progress Map */}
      <aside className="hidden lg:flex w-80 glass-strong border-r border-white/20 p-5 overflow-y-auto flex-col">
        <div className="mb-4">
          <div className="flex items-center gap-3 mb-1">
            <Image
              src="/biz-group-logo.webp"
              alt="Biz Group"
              width={32}
              height={32}
              className="rounded"
            />
            <h2 className="font-semibold text-gray-900 text-sm">{session.template.name}</h2>
          </div>
          <p className="text-xs text-gray-500 pl-11">{session.organization.name}</p>
        </div>
        
        <NarrativeProgressMap
          steps={narrativeSteps}
          modules={modules.map(m => ({ title: m.title, objective: m.objective }))}
          onStepClick={(stepId) => {
            const index = allSteps.findIndex(s => s.id === stepId);
            if (index !== -1) attemptStepNavigation(index);
          }}
          isClickable={true}
        />
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col">
        {/* Header */}
        <header className="glass-strong border-b border-white/20 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-semibold text-gray-900">{currentStep.title}</h1>
                {isLastStep && (
                  <span className="text-xs font-bold bg-gradient-to-r from-amber-100 to-amber-200 text-amber-800 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Trophy className="w-3 h-3" />
                    Final Challenge
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-500">
                Chapter {currentStep.moduleIndex + 1}: {currentStep.moduleTitle}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {currentStep.estimated_minutes
                  ? `Timebox: about ${currentStep.estimated_minutes} min`
                  : 'Timebox: work at your own pace'}
                {deliverablePreview ? ` • Deliverable: ${deliverablePreview}` : ''}
              </p>
            </div>
            <div className="flex items-center justify-end gap-3 flex-wrap">
              {session.timerEndAt && (
                <Timer endAt={session.timerEndAt} size="md" />
              )}
              {currentStep.estimated_minutes ? (
                <span className="text-sm text-gray-500 inline-flex items-center gap-1">
                  <Clock3 className="w-3.5 h-3.5" />
                  ~{currentStep.estimated_minutes} min
                </span>
              ) : null}
              <span className="text-sm text-gray-500">
                Step {currentStepIndex + 1} of {allSteps.length}
              </span>
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-3xl mx-auto space-y-6">
            {/* Structured Instructions */}
            {parsedInstructions.objective && (
              <Card className="instruction-section-card border-l-4 border-l-brand-500">
                <CardContent className="p-0">
                  <div className="flex items-center gap-2 mb-2">
                    <BookOpen className="w-4 h-4 text-brand-700" />
                    <h3 className="instruction-section-heading text-brand-700">Quest Objective</h3>
                  </div>
                  <div className="markdown-content text-gray-900 whitespace-pre-wrap">
                    {parsedInstructions.objective}
                  </div>
                </CardContent>
              </Card>
            )}

            {parsedInstructions.actions && (
              <Card className="instruction-section-card">
                <CardContent className="p-0">
                  <div className="flex items-center gap-2 mb-2">
                    <ListChecks className="w-4 h-4 text-gray-700" />
                    <h3 className="instruction-section-heading">Your Actions</h3>
                  </div>
                  <div className="markdown-content text-gray-900 whitespace-pre-wrap">
                    {parsedInstructions.actions}
                  </div>
                </CardContent>
              </Card>
            )}

            {parsedInstructions.deliverable && (
              <Card className="instruction-section-card border-l-4 border-l-amber-400">
                <CardContent className="p-0">
                  <div className="flex items-center gap-2 mb-2">
                    <ClipboardCheck className="w-4 h-4 text-amber-700" />
                    <h3 className="instruction-section-heading text-amber-700">Deliverable</h3>
                  </div>
                  <div className="markdown-content text-gray-900 whitespace-pre-wrap">
                    {parsedInstructions.deliverable}
                  </div>
                </CardContent>
              </Card>
            )}

            {checklistItems.length > 0 && (
              <Card className="instruction-section-card">
                <CardContent className="p-0">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="w-4 h-4 text-emerald-600" />
                    <h3 className="instruction-section-heading text-emerald-700">Checklist</h3>
                  </div>
                  <ul className="space-y-2">
                    {checklistItems.map((item, index) => (
                      <li key={`${item}-${index}`} className="flex items-start gap-2 text-sm text-gray-800">
                        <span className="mt-1 h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {parsedInstructions.tips && (
              <Card className="instruction-section-card border-l-4 border-l-blue-400">
                <CardContent className="p-0">
                  <div className="flex items-center gap-2 mb-2">
                    <Lightbulb className="w-4 h-4 text-blue-600" />
                    <h3 className="instruction-section-heading text-blue-700">Tips</h3>
                  </div>
                  <div className="markdown-content text-gray-900 whitespace-pre-wrap">
                    {parsedInstructions.tips}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Prompt Blocks */}
            {currentStep.prompt_blocks.length > 0 && (
              <div className="space-y-4">
                <h3 className="font-medium text-gray-900">Prompt Templates</h3>
                {currentStep.prompt_blocks.map((block) => (
                  <PromptBlock
                    key={block.id}
                    title={block.title}
                    content={block.content_markdown}
                    isCopyable={block.is_copyable}
                    onCopy={() => handlePromptCopy(block.id)}
                  />
                ))}
              </div>
            )}

            {/* AI Tool Button */}
            <Button
              variant="outline"
              className="w-full"
              onClick={openAITool}
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              Open {currentStep?.ai_tool_name || initialSession.aiToolName || 'ChatGPT'}
            </Button>

            {/* Submission Area (for required steps or last step) */}
            {(currentStep.is_required || isLastStep) && (
              <Card>
                <CardContent className="p-6 space-y-4">
                  <h3 className="font-medium text-gray-900">
                    {isLastStep ? 'Submit Your Final Prompt' : 'Submit Your Response'}
                  </h3>
                  <TextArea
                    value={submissionContent}
                    onChange={(e) => setSubmissionContent(e.target.value)}
                    placeholder="Paste your final prompt or response here..."
                    className="min-h-[150px]"
                  />

                  {/* Image Upload */}
                  <div>
                    {imagePreview ? (
                      <div className="relative inline-block">
                        <img
                          src={imagePreview}
                          alt="Upload preview"
                          className="max-h-48 rounded-lg border border-gray-200 object-contain"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setImageFile(null);
                            setImagePreview(null);
                            setImageMarkedForRemoval(true);
                          }}
                          className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow hover:bg-red-600 transition-colors"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <label className="flex items-center gap-2 px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-brand-400 hover:bg-brand-50/50 transition-colors">
                        <ImagePlus className="w-5 h-5 text-gray-400" />
                        <span className="text-sm text-gray-500">Upload a screenshot or image</span>
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/gif,image/webp"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              if (file.size > 5 * 1024 * 1024) {
                                toast.error('Image must be under 5MB');
                                return;
                              }
                              setImageFile(file);
                              setImageMarkedForRemoval(false);
                              setImagePreview(URL.createObjectURL(file));
                            }
                          }}
                        />
                      </label>
                    )}
                  </div>

                  <div className="flex items-center justify-between">
                    <Button
                      onClick={handleSubmit}
                      isLoading={isSubmitting}
                      disabled={!canSubmit}
                    >
                      {isUploading ? (
                        'Uploading image...'
                      ) : existingSubmission ? (
                        <>
                          <CheckCircle className="w-4 h-4 mr-2" />
                          Update Response
                        </>
                      ) : (
                        'Submit Response'
                      )}
                    </Button>
                    {existingSubmission && (
                      <span className="text-sm text-green-600 flex items-center gap-1">
                        <CheckCircle className="w-4 h-4" />
                        Submitted
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Help & Q&A Buttons */}
            <div className="flex items-center justify-center gap-3">
              <Button
                variant="ghost"
                onClick={handleStuck}
                disabled={isStuck}
                className="text-gray-500"
              >
                <AlertCircle className="w-4 h-4 mr-2" />
                {isStuck ? 'Help requested' : "I'm stuck"}
              </Button>
              <Button
                variant="ghost"
                onClick={() => setIsQAOpen(true)}
                className="text-gray-500 relative"
              >
                <MessageCircle className="w-4 h-4 mr-2" />
                Ask a Question
                {questions.filter(q => !q.is_answered).length > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-brand-600 text-white text-xs rounded-full flex items-center justify-center">
                    {questions.filter(q => !q.is_answered).length}
                  </span>
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Q&A Slide-out Panel */}
        {isQAOpen && (
          <div className="fixed inset-0 z-50 flex justify-end">
            <div className="absolute inset-0 bg-black/30" onClick={() => setIsQAOpen(false)} />
            <div className="relative w-full max-w-md bg-white shadow-2xl flex flex-col h-full">
              {/* Panel Header */}
              <div className="flex items-center justify-between p-4 border-b">
                <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                  <MessageCircle className="w-5 h-5 text-brand-600" />
                  Q&A Board
                </h2>
                <button
                  onClick={() => setIsQAOpen(false)}
                  className="p-1 text-gray-400 hover:text-gray-600 rounded"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Ask Question Input */}
              <div className="p-4 border-b bg-gray-50">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={questionText}
                    onChange={(e) => setQuestionText(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleAskQuestion()}
                    placeholder="Type your question..."
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                    maxLength={1000}
                  />
                  <button
                    onClick={handleAskQuestion}
                    disabled={!questionText.trim() || isAskingQuestion}
                    className="p-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Questions List */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {questions.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">
                    <MessageCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No questions yet. Be the first to ask!</p>
                  </div>
                ) : (
                  questions.map((q) => (
                    <div
                      key={q.id}
                      className={`rounded-lg border p-3 ${
                        q.is_answered
                          ? 'border-green-200 bg-green-50/50'
                          : 'border-gray-200 bg-white'
                      }`}
                    >
                      <div className="flex items-start justify-between mb-1">
                        <span className="text-xs font-medium text-brand-600">{q.participant_name}</span>
                        <span className="text-xs text-gray-400">
                          {new Date(q.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-sm text-gray-800 mb-2">{q.question_text}</p>
                      {q.is_answered && q.answer_text && (
                        <div className="mt-2 pt-2 border-t border-green-200">
                          <p className="text-xs font-medium text-green-700 mb-0.5">Facilitator:</p>
                          <p className="text-sm text-green-800">{q.answer_text}</p>
                        </div>
                      )}
                      {!q.is_answered && (
                        <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                          Awaiting answer
                        </span>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* Soft gate warning for incomplete steps */}
        {isSkipWarningOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" onClick={closeSkipWarning} />
            <div className="relative w-full max-w-lg rounded-xl bg-white border border-gray-200 shadow-2xl p-6">
              <div className="flex items-start gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Skip this step for now?</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    You have not submitted your response for <span className="font-medium">{currentStep.title}</span>.
                  </p>
                </div>
              </div>

              <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-900 mb-5">
                {deliverablePreview
                  ? `Expected deliverable: ${deliverablePreview}`
                  : 'You can continue now and return later, but this step will be marked as skipped.'}
              </div>

              <div className="flex items-center justify-end gap-2">
                <Button onClick={closeSkipWarning}>Stay and complete</Button>
                <Button variant="secondary" onClick={confirmSkipAndContinue}>
                  Skip for now
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Footer Navigation */}
        <footer className="glass-strong border-t border-white/20 px-6 py-4">
          <div className="max-w-3xl mx-auto flex items-center justify-between">
            <Button
              variant="outline"
              onClick={() => goToStep(currentStepIndex - 1)}
              disabled={currentStepIndex === 0}
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Previous
            </Button>

            {isLastStep ? (
              <Button
                onClick={() => router.push(`/s/${initialSession.id}/end`)}
              >
                Finish Workshop
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            ) : (
              <Button
                onClick={() => attemptStepNavigation(currentStepIndex + 1)}
                disabled={currentStepIndex === allSteps.length - 1}
              >
                Next Step
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            )}
          </div>
        </footer>
      </main>
    </div>
  );
}
