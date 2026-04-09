'use client';

import { useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronLeft,
  ChevronRight,
  X,
  Trophy,
  Eye,
  ExternalLink,
  Clock,
} from 'lucide-react';
import { Button, Card, CardContent } from '@/components/ui';
import { NarrativeProgressMap } from '@/components/workshop/NarrativeProgressMap';
import { StepNarrativeSections } from '@/components/workshop/StepNarrativeSections';
import { ChapterCelebration, useChapterCelebration } from '@/components/workshop/ChapterCelebration';
import { cn, parseStepInstructions } from '@/lib/utils';

// ─── Types ──────────────────────────────────────────────────────────────
interface PromptBlockType {
  id: string;
  title: string;
  content_markdown: string;
  is_copyable: boolean;
  order_index: number;
}

interface Step {
  id: string;
  title: string;
  instruction_markdown: string;
  estimated_minutes: number | null;
  is_required: boolean;
  order_index: number;
  ai_tool_name?: string | null;
  ai_tool_url?: string | null;
  prompt_blocks: PromptBlockType[];
}

interface Module {
  id: string;
  title: string;
  objective: string | null;
  order_index: number;
  steps: Step[];
}

interface TemplatePreviewProps {
  templateName: string;
  modules: Module[];
  aiToolName?: string;
  aiToolUrl?: string;
  onClose: () => void;
}

// ─── Formatted Markdown Content ─────────────────────────────────────────
// Renders plain-text markdown with basic formatting: line breaks preserved,
// **bold**, *italic*, `code`, and --- horizontal rules.
function FormattedContent({ content, className }: { content: string; className?: string }) {
  const lines = content.split('\n');

  return (
    <div className={cn('space-y-1', className)}>
      {lines.map((line, i) => {
        const trimmed = line.trim();

        // Horizontal rule
        if (/^-{3,}$/.test(trimmed) || /^\*{3,}$/.test(trimmed)) {
          return <hr key={i} className="border-gray-200 my-3" />;
        }

        // Empty line = paragraph break
        if (trimmed === '') {
          return <div key={i} className="h-2" />;
        }

        // Format inline: **bold**, *italic*, `code`
        const parts = trimmed.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
        const formatted = parts.map((part, j) => {
          if (part.startsWith('**') && part.endsWith('**')) {
            return <strong key={j} className="font-semibold text-gray-900">{part.slice(2, -2)}</strong>;
          }
          if (part.startsWith('*') && part.endsWith('*')) {
            return <em key={j} className="italic">{part.slice(1, -1)}</em>;
          }
          if (part.startsWith('`') && part.endsWith('`')) {
            return <code key={j} className="px-1.5 py-0.5 bg-gray-100 rounded text-sm font-mono text-brand-700">{part.slice(1, -1)}</code>;
          }
          return <span key={j}>{part}</span>;
        });

        return (
          <p key={i} className="leading-relaxed">
            {formatted}
          </p>
        );
      })}
    </div>
  );
}

// ─── Prompt Block (Preview version with rich formatting) ────────────────
function PreviewPromptBlock({ title, content, isCopyable, index }: {
  title: string;
  content: string;
  isCopyable: boolean;
  index: number;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden shadow-sm bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 bg-gradient-to-r from-slate-50 to-gray-50 border-b border-gray-200">
        <div className="flex items-center gap-2.5">
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold">
            {index}
          </span>
          <span className="text-sm font-semibold text-gray-900">{title}</span>
          {!isCopyable && (
            <span className="text-[10px] uppercase tracking-wider text-gray-400 font-medium bg-gray-100 px-1.5 py-0.5 rounded">
              Read only
            </span>
          )}
        </div>
        {isCopyable && (
          <button
            onClick={handleCopy}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-all',
              copied
                ? 'bg-green-100 text-green-700'
                : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200 hover:border-gray-300'
            )}
          >
            {copied ? '✓ Copied!' : '⧉ Copy'}
          </button>
        )}
      </div>
      {/* Content */}
      <div className="p-5">
        <FormattedContent
          content={content}
          className="text-[14px] text-gray-800"
        />
      </div>
    </div>
  );
}

// ─── Main Preview ───────────────────────────────────────────────────────
export function TemplatePreview({ templateName, modules, aiToolName = 'ChatGPT', aiToolUrl = 'https://chat.openai.com', onClose }: TemplatePreviewProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  // Lock body scroll while preview is open & set portal target
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    setPortalTarget(document.body);
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Flatten modules → steps with module context
  const allSteps = modules.flatMap((mod, modIdx) =>
    mod.steps.map((step) => ({
      ...step,
      moduleTitle: mod.title,
      moduleIndex: modIdx,
      moduleObjective: mod.objective,
    }))
  );

  const totalSteps = allSteps.length;
  const currentStep = allSteps[currentStepIndex];
  const isLastStep = currentStepIndex === totalSteps - 1;
  const parsedInstructions = parseStepInstructions(currentStep?.instruction_markdown || '');
  const nextStepTitle = allSteps[currentStepIndex + 1]?.title ?? null;

  // Build narrative steps for sidebar and celebration tracking
  const narrativeSteps = allSteps.map((step, index) => ({
    id: step.id,
    moduleTitle: step.moduleTitle,
    moduleIndex: step.moduleIndex,
    isFirstInModule: index === 0 || allSteps[index - 1].moduleIndex !== step.moduleIndex,
    isLastInModule:
      index === totalSteps - 1 || allSteps[index + 1].moduleIndex !== step.moduleIndex,
    isLastStep: index === totalSteps - 1,
    title: step.title,
    status:
      index < currentStepIndex
        ? ('completed' as const)
        : index === currentStepIndex
          ? ('current' as const)
          : ('upcoming' as const),
  }));

  // Chapter celebration on module transitions
  const { celebration, dismissCelebration } = useChapterCelebration(
    narrativeSteps.map(s => ({ id: s.id, moduleIndex: s.moduleIndex, status: s.status })),
    modules.map(m => ({ title: m.title, objective: m.objective }))
  );

  const goToStep = useCallback(
    (index: number) => {
      if (index >= 0 && index < totalSteps) {
        setCurrentStepIndex(index);
      }
    },
    [totalSteps]
  );

  if (totalSteps === 0) {
    const emptyEl = (
      <div className="fixed inset-0 z-[100] bg-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 mb-4">This template has no steps to preview.</p>
          <Button onClick={onClose}>Close Preview</Button>
        </div>
      </div>
    );
    return portalTarget ? createPortal(emptyEl, portalTarget) : null;
  }

  // Wait for portal target (avoids SSR mismatch)
  if (!portalTarget) return null;

  const previewContent = (
    <div className="fixed inset-0 z-[100] flex bg-gradient-to-br from-slate-50 to-gray-100" style={{ overscrollBehavior: 'contain' }}>
      {/* Chapter Celebration Overlay */}
      {celebration && (
        <ChapterCelebration
          chapterTitle={modules[celebration.chapterNumber - 1]?.title ?? ''}
          chapterNumber={celebration.chapterNumber}
          totalChapters={celebration.totalChapters}
          chapterObjective={celebration.chapterObjective}
          isFinalChapter={celebration.isFinalChapter}
          onDismiss={dismissCelebration}
        />
      )}

      {/* Sidebar — Narrative Progress Map */}
      <aside className="hidden lg:flex w-80 bg-white/95 backdrop-blur-sm border-r border-gray-200 p-5 overflow-y-auto flex-col">
        <div className="mb-4">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center">
              <Eye className="w-4 h-4 text-white" />
            </div>
            <h2 className="font-semibold text-gray-900 text-sm">{templateName}</h2>
          </div>
          <p className="text-xs text-gray-500 pl-11">Preview Mode</p>
        </div>

        <NarrativeProgressMap
          steps={narrativeSteps}
          modules={modules.map((m) => ({ title: m.title, objective: m.objective }))}
          onStepClick={(stepId) => {
            const index = allSteps.findIndex((s) => s.id === stepId);
            if (index !== -1) goToStep(index);
          }}
          isClickable={true}
        />
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Preview Banner */}
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-2 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 text-amber-600" />
            <span className="text-sm font-medium text-amber-800">
              Template Preview — This is how participants will see your workshop
            </span>
          </div>
          <button
            onClick={onClose}
            className="flex items-center gap-1 text-sm text-amber-700 hover:text-amber-900 font-medium transition-colors"
          >
            <X className="w-4 h-4" />
            Exit Preview
          </button>
        </div>

        {/* Header */}
        <header className="bg-white border-b border-gray-200 px-6 py-4 shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-brand-100 text-brand-700 text-sm font-bold shrink-0">
                  {currentStepIndex + 1}
                </div>
                <h1 className="text-xl font-semibold text-gray-900">
                  {currentStep.title}
                </h1>
                {isLastStep && (
                  <span className="text-xs font-bold bg-gradient-to-r from-amber-100 to-amber-200 text-amber-800 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Trophy className="w-3 h-3" />
                    Final Challenge
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-500 ml-10">
                Chapter {currentStep.moduleIndex + 1}: {currentStep.moduleTitle}
              </p>
            </div>
            <div className="flex items-center gap-4">
              {currentStep.estimated_minutes && (
                <span className="text-sm text-gray-400 inline-flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  ~{currentStep.estimated_minutes} min
                </span>
              )}
              <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full">
                Step {currentStepIndex + 1} of {totalSteps}
              </span>
            </div>
          </div>
          <div className="mt-4 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-[0.18em] text-gray-400 mb-1">Participant context</p>
                <p className="text-sm font-medium text-gray-900">{parsedInstructions.objective || currentStep.moduleTitle}</p>
                <p className="text-sm text-gray-600 mt-1">
                  {parsedInstructions.deliverable || 'Participants will use this step to create or refine a concrete output.'}
                </p>
              </div>
              <div className="md:max-w-sm">
                <p className="text-xs uppercase tracking-[0.18em] text-gray-400 mb-1">What this unlocks</p>
                <p className="text-sm text-gray-700">
                  {parsedInstructions.nextUp || (nextStepTitle ? `Next up: ${nextStepTitle}.` : 'This closes the journey and leads into the prompt pack handoff.')}
                </p>
              </div>
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-3xl mx-auto space-y-6">
            <StepNarrativeSections instructions={parsedInstructions} className="space-y-4" />

            {!parsedInstructions.actions && currentStep.instruction_markdown && (
              <Card className="border-l-4 border-l-brand-400 shadow-sm">
                <CardContent className="p-6">
                  <FormattedContent
                    content={currentStep.instruction_markdown}
                    className="text-gray-800 text-[15px]"
                  />
                </CardContent>
              </Card>
            )}

            {/* Prompt Blocks */}
            {currentStep.prompt_blocks.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium text-gray-900">Prompt Templates</h3>
                  <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                    {currentStep.prompt_blocks.length} block{currentStep.prompt_blocks.length !== 1 ? 's' : ''}
                  </span>
                </div>
                {currentStep.prompt_blocks.map((block, blockIdx) => (
                  <PreviewPromptBlock
                    key={block.id}
                    title={block.title}
                    content={block.content_markdown}
                    isCopyable={block.is_copyable}
                    index={blockIdx + 1}
                  />
                ))}
              </div>
            )}

            {/* Submission placeholder (for required steps or last step) */}
            {(currentStep.is_required || isLastStep) && (
              <Card className="shadow-sm">
                <CardContent className="p-6">
                  <h3 className="font-medium text-gray-900 mb-3">
                    {isLastStep ? 'Submit Your Final Prompt' : 'Submit Your Response'}
                  </h3>
                  <div className="border-2 border-dashed border-gray-200 rounded-lg p-8 text-center text-gray-400 text-sm">
                    Participants will see a text area here to submit their response
                  </div>
                </CardContent>
              </Card>
            )}

            {/* AI Tool Button */}
            <Button
              variant="outline"
              className="w-full"
              onClick={() => window.open(currentStep.ai_tool_url || aiToolUrl, '_blank')}
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              Open {currentStep.ai_tool_name || aiToolName}
            </Button>
          </div>
        </div>

        {/* Footer Navigation */}
        <footer className="bg-white border-t border-gray-200 px-6 py-4 shrink-0">
          <div className="max-w-3xl mx-auto flex items-center justify-between">
            <Button
              variant="outline"
              onClick={() => goToStep(currentStepIndex - 1)}
              disabled={currentStepIndex === 0}
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Previous
            </Button>

            {/* Mobile step indicator */}
            <div className="flex items-center gap-1 lg:hidden">
              {allSteps.map((_, i) => (
                <div
                  key={i}
                  className={`w-2 h-2 rounded-full transition-colors ${
                    i === currentStepIndex
                      ? 'bg-brand-500'
                      : i < currentStepIndex
                        ? 'bg-brand-300'
                        : 'bg-gray-200'
                  }`}
                />
              ))}
            </div>

            {isLastStep ? (
              <Button onClick={onClose}>
                Finish Preview
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            ) : (
              <Button onClick={() => goToStep(currentStepIndex + 1)}>
                Next Step
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            )}
          </div>
        </footer>
      </main>
    </div>
  );

  return createPortal(previewContent, portalTarget);
}
