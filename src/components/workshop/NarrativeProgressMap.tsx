'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { 
  Check, 
  MapPin, 
  Flag, 
  Star, 
  Trophy, 
  Sparkles,
  ChevronDown,
  ChevronUp,
  Swords,
  AlertTriangle,
} from 'lucide-react';

interface NarrativeStep {
  id: string;
  title: string;
  moduleTitle: string;
  moduleIndex: number;
  status: 'completed' | 'current' | 'incomplete' | 'upcoming';
  isFirstInModule: boolean;
  isLastInModule: boolean;
  isLastStep: boolean;
}

interface NarrativeProgressMapProps {
  steps: NarrativeStep[];
  modules: { title: string; objective: string | null }[];
  onStepClick?: (stepId: string) => void;
  isClickable?: boolean;
  className?: string;
}

// Icons for chapter markers
const CHAPTER_ICONS = [MapPin, Star, Flag, Sparkles, Trophy];

export function NarrativeProgressMap({
  steps,
  modules,
  onStepClick,
  isClickable = false,
  className,
}: NarrativeProgressMapProps) {
  const [expandedModules, setExpandedModules] = useState<Set<number>>(new Set());
  const [animatingStep, setAnimatingStep] = useState<string | null>(null);

  // Auto-expand the module containing the current step
  useEffect(() => {
    const currentStep = steps.find(s => s.status === 'current');
    if (currentStep) {
      setExpandedModules(prev => new Set([...prev, currentStep.moduleIndex]));
    }
  }, [steps]);

  const toggleModule = (moduleIndex: number) => {
    setExpandedModules(prev => {
      const next = new Set(prev);
      if (next.has(moduleIndex)) {
        next.delete(moduleIndex);
      } else {
        next.add(moduleIndex);
      }
      return next;
    });
  };

  // Calculate module completion
  const getModuleProgress = (moduleIndex: number) => {
    const moduleSteps = steps.filter(s => s.moduleIndex === moduleIndex);
    const completedSteps = moduleSteps.filter(s => s.status === 'completed');
    const incompleteSteps = moduleSteps.filter(s => s.status === 'incomplete');
    return {
      completed: completedSteps.length,
      total: moduleSteps.length,
      percentage: moduleSteps.length > 0 ? (completedSteps.length / moduleSteps.length) * 100 : 0,
      isComplete: completedSteps.length === moduleSteps.length,
      hasCurrent: moduleSteps.some(s => s.status === 'current'),
      hasIncomplete: incompleteSteps.length > 0,
    };
  };

  // Overall progress
  const totalCompleted = steps.filter(s => s.status === 'completed').length;
  const overallProgress = steps.length > 0 ? (totalCompleted / steps.length) * 100 : 0;

  const handleStepClick = (stepId: string) => {
    if (!isClickable) return;
    setAnimatingStep(stepId);
    setTimeout(() => setAnimatingStep(null), 300);
    onStepClick?.(stepId);
  };

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Progress Header */}
      <div className="mb-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Progress</h3>

        {/* Overall Progress Bar */}
        <div className="relative">
          <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
            <span>{totalCompleted} of {steps.length} moments captured</span>
            <span>{Math.round(overallProgress)}%</span>
          </div>
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-brand-500 rounded-full transition-all duration-700 ease-out"
              style={{ width: `${overallProgress}%` }}
            />
          </div>
        </div>
      </div>

      {/* Chapter List */}
      <div className="flex-1 overflow-y-auto space-y-3 pt-1 px-1 -mx-1">
        {modules.map((module, moduleIndex) => {
          const progress = getModuleProgress(moduleIndex);
          const ChapterIcon = CHAPTER_ICONS[moduleIndex % CHAPTER_ICONS.length];
          const isExpanded = expandedModules.has(moduleIndex);
          const moduleSteps = steps.filter(s => s.moduleIndex === moduleIndex);
          const isCurrentModule = progress.hasCurrent;
          const isFinalModule = moduleIndex === modules.length - 1;

          return (
            <div key={moduleIndex} className="relative">
              {/* Connecting line between modules */}
              {moduleIndex < modules.length - 1 && (
                <div className={cn(
                  'absolute left-5 top-full w-0.5 h-3 z-0',
                  progress.isComplete ? 'bg-brand-400' : 'bg-gray-200'
                )} />
              )}

              {/* Chapter Header */}
              <button
                onClick={() => toggleModule(moduleIndex)}
                className={cn(
                  'w-full text-left rounded-xl p-3 transition-all duration-200',
                  isCurrentModule
                    ? 'bg-white shadow-md ring-2 ring-brand-300 ring-offset-1'
                    : progress.isComplete
                      ? 'bg-white/80 shadow-sm'
                      : progress.hasIncomplete
                        ? 'bg-amber-50/90 shadow-sm ring-1 ring-amber-200'
                      : 'bg-white/60 hover:bg-white/80',
                )}
              >
                <div className="flex items-center gap-3">
                  {/* Chapter Icon */}
                  <div className={cn(
                    'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-all',
                    progress.isComplete
                      ? 'bg-brand-500 text-white'
                      : isCurrentModule
                        ? 'bg-brand-100 text-brand-600 ring-2 ring-brand-300'
                        : progress.hasIncomplete
                          ? 'bg-amber-100 text-amber-700'
                        : 'bg-gray-100 text-gray-400'
                  )}>
                    {progress.isComplete ? (
                      <Trophy className="w-5 h-5" />
                    ) : isFinalModule ? (
                      <Swords className="w-5 h-5" />
                    ) : (
                      <ChapterIcon className="w-5 h-5" />
                    )}
                  </div>

                  {/* Chapter Info */}
                  <div className="flex-1 min-w-0">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                      {isFinalModule ? 'Final Challenge' : `Chapter ${moduleIndex + 1}`}
                    </span>
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {module.title}
                    </p>
                  </div>

                  {/* Expand Toggle */}
                  <div className="text-gray-400">
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </div>
                </div>
              </button>

              {/* Steps (collapsible) */}
              <div className={cn(
                'overflow-hidden transition-all duration-300 ease-in-out',
                isExpanded ? 'max-h-[800px] opacity-100 mt-1' : 'max-h-0 opacity-0'
              )}>
                <div className="pl-5 space-y-0.5 py-1">
                  {moduleSteps.map((step, stepIdx) => (
                    <div
                      key={step.id}
                      role={isClickable ? 'button' : undefined}
                      tabIndex={isClickable ? 0 : undefined}
                      onClick={() => handleStepClick(step.id)}
                      onKeyDown={isClickable ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleStepClick(step.id);
                        }
                      } : undefined}
                      className={cn(
                        'flex items-center gap-3 py-2 px-3 rounded-lg transition-all duration-200',
                        isClickable && 'cursor-pointer',
                        step.status === 'current' && 'bg-brand-50',
                        step.status === 'completed' && isClickable && 'hover:bg-gray-50',
                        step.status === 'incomplete' && 'bg-amber-50/50',
                        step.status === 'incomplete' && isClickable && 'hover:bg-amber-50',
                        step.status === 'upcoming' && isClickable && 'hover:bg-gray-50',
                        animatingStep === step.id && 'scale-95',
                      )}
                    >
                      {/* Step connector line */}
                      <div className="relative flex flex-col items-center">
                        <div className={cn(
                          'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-500',
                          step.status === 'completed' && 'bg-brand-500 text-white',
                          step.status === 'current' && 'ring-2 ring-brand-400 ring-offset-1 bg-white text-brand-600',
                          step.status === 'incomplete' && 'bg-amber-100 text-amber-700 ring-1 ring-amber-300',
                          step.status === 'upcoming' && 'bg-gray-100 text-gray-400',
                        )}>
                          {step.status === 'completed' ? (
                            <Check className="w-3 h-3" />
                          ) : step.status === 'incomplete' ? (
                            <AlertTriangle className="w-3 h-3" />
                          ) : (
                            <span>{stepIdx + 1}</span>
                          )}
                        </div>
                        {stepIdx < moduleSteps.length - 1 && (
                          <div className={cn(
                            'w-0.5 h-4 mt-0.5',
                            step.status === 'completed'
                              ? 'bg-brand-300'
                              : step.status === 'incomplete'
                                ? 'bg-amber-200'
                                : 'bg-gray-200'
                          )} />
                        )}
                      </div>

                      {/* Step Label */}
                      <div className="flex-1 min-w-0">
                        <p className={cn(
                          'text-sm truncate',
                          step.status === 'completed' && 'text-gray-600',
                          step.status === 'current' && 'text-brand-700 font-semibold',
                          step.status === 'incomplete' && 'text-amber-700 font-medium',
                          step.status === 'upcoming' && 'text-gray-400',
                        )}>
                          {step.title}
                        </p>
                      </div>

                      {/* Step Status */}
                      {step.status === 'current' && (
                        <div className="w-2 h-2 rounded-full bg-brand-500 animate-pulse flex-shrink-0" />
                      )}
                      {step.status === 'incomplete' && (
                        <span className="incomplete-step-badge flex-shrink-0">Come back later</span>
                      )}
                      {step.isLastStep && step.status === 'upcoming' && (
                        <Trophy className="w-3 h-3 text-amber-400 flex-shrink-0" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

    </div>
  );
}
