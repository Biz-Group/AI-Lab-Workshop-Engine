'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Trophy, Sparkles, Star, PartyPopper } from 'lucide-react';

interface ChapterCelebrationProps {
  chapterTitle: string;
  chapterNumber: number;
  totalChapters: number;
  chapterObjective?: string | null;
  isFinalChapter?: boolean;
  onDismiss: () => void;
}

// Confetti particle component
function ConfettiParticle({ delay, color, left }: { delay: number; color: string; left: number }) {
  return (
    <div
      className="absolute w-2 h-2 rounded-sm confetti-particle"
      style={{
        left: `${left}%`,
        backgroundColor: color,
        animationDelay: `${delay}ms`,
      }}
    />
  );
}

function createConfettiParticles() {
  const colors = ['#75BD66', '#197CBB', '#F59E0B', '#EC4899', '#8B5CF6', '#EF4444', '#10B981'];
  return Array.from({ length: 30 }, () => ({
    delay: Math.random() * 1000,
    color: colors[Math.floor(Math.random() * colors.length)],
    left: Math.random() * 100,
  }));
}

export function ChapterCelebration({
  chapterTitle,
  chapterNumber,
  totalChapters,
  chapterObjective,
  isFinalChapter = false,
  onDismiss,
}: ChapterCelebrationProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [particles] = useState(createConfettiParticles);
  const isDismissing = React.useRef(false);
  const onDismissRef = React.useRef(onDismiss);

  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    isDismissing.current = false;

    // Animate in
    requestAnimationFrame(() => setIsVisible(true));

    // Auto-dismiss after 4 seconds
    const timer = setTimeout(() => {
      if (!isDismissing.current) {
        isDismissing.current = true;
        setIsVisible(false);
        setTimeout(() => onDismissRef.current(), 500);
      }
    }, 4000);

    return () => clearTimeout(timer);
  }, []);

  const handleDismiss = useCallback(() => {
    if (isDismissing.current) return;
    isDismissing.current = true;
    setIsVisible(false);
    setTimeout(() => onDismissRef.current(), 500);
  }, []);

  // Escape key to dismiss
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleDismiss();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleDismiss]);

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 flex items-center justify-center transition-all duration-500',
        isVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
      )}
      onClick={handleDismiss}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      {/* Confetti */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {particles.map((p, i) => (
          <ConfettiParticle key={i} {...p} />
        ))}
      </div>

      {/* Celebration Card */}
      <div className={cn(
        'relative z-10 max-w-md w-full mx-4 rounded-2xl p-8 text-center transition-all duration-500',
        isVisible ? 'scale-100 translate-y-0' : 'scale-90 translate-y-8',
        isFinalChapter
          ? 'bg-gradient-to-br from-amber-50 via-white to-amber-50 shadow-2xl ring-2 ring-amber-300'
          : 'bg-white shadow-2xl'
      )}>
        {/* Icon */}
        <div className={cn(
          'w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center celebration-icon-pop',
          isFinalChapter
            ? 'bg-gradient-to-br from-amber-400 to-amber-600'
            : 'bg-gradient-to-br from-brand-400 to-brand-600'
        )}>
          {isFinalChapter ? (
            <Trophy className="w-10 h-10 text-white" />
          ) : (
            <Star className="w-10 h-10 text-white" />
          )}
        </div>

        {/* Title */}
        <h2 className={cn(
          'text-2xl font-bold mb-2',
          isFinalChapter ? 'text-amber-800' : 'text-gray-900'
        )}>
          {isFinalChapter ? 'Quest Complete!' : 'Chapter Complete!'}
        </h2>

        {/* Chapter Info */}
        <p className="text-gray-500 text-sm mb-3">
          {isFinalChapter
            ? 'You have conquered all challenges!'
            : `Chapter ${chapterNumber} of ${totalChapters}`}
        </p>

        <p className="text-lg font-semibold text-gray-800 mb-4">
          {chapterTitle}
        </p>

        <p className="text-sm text-gray-600 mb-4">
          {chapterObjective
            ? `You now have: ${chapterObjective}`
            : isFinalChapter
              ? 'You now have a full set of workshop outputs to take forward.'
              : 'You have something concrete to carry into the next chapter.'}
        </p>

        {/* Stars earned */}
        <div className="flex items-center justify-center gap-1 mb-4">
          {[...Array(3)].map((_, i) => (
            <Star
              key={i}
              className={cn(
                'w-6 h-6 celebration-star-pop',
                isFinalChapter ? 'text-amber-400 fill-amber-400' : 'text-brand-400 fill-brand-400'
              )}
              style={{ animationDelay: `${300 + i * 200}ms` }}
            />
          ))}
        </div>

        {/* Next hint */}
        {!isFinalChapter && (
          <p className="text-sm text-gray-400 flex items-center justify-center gap-1">
            <Sparkles className="w-3 h-3" />
            Next chapter awaits...
            <Sparkles className="w-3 h-3" />
          </p>
        )}

        {isFinalChapter && (
          <p className="text-sm text-amber-600 flex items-center justify-center gap-2">
            <PartyPopper className="w-4 h-4" />
            You&apos;re a Prompt Engineering Champion!
            <PartyPopper className="w-4 h-4" />
          </p>
        )}

        {/* Tap to dismiss */}
        <p className="text-xs text-gray-300 mt-4">Tap anywhere to continue</p>
      </div>
    </div>
  );
}

// Hook to manage chapter celebrations
export function useChapterCelebration(
  steps: { id: string; moduleIndex: number; status: string }[],
  modules: { title: string; objective?: string | null }[]
) {
  const [celebration, setCelebration] = useState<{
    chapterTitle: string;
    chapterNumber: number;
    totalChapters: number;
    chapterObjective?: string | null;
    isFinalChapter: boolean;
  } | null>(null);
  const celebratedModulesRef = React.useRef<Set<number>>(new Set());

  const checkForCelebration = useCallback(() => {
    for (let moduleIndex = 0; moduleIndex < modules.length; moduleIndex++) {
      if (celebratedModulesRef.current.has(moduleIndex)) continue;

      const moduleSteps = steps.filter(s => s.moduleIndex === moduleIndex);
      const allComplete = moduleSteps.length > 0 && moduleSteps.every(s => s.status === 'completed');

      if (allComplete) {
        celebratedModulesRef.current.add(moduleIndex);
        setCelebration({
          chapterTitle: modules[moduleIndex].title,
          chapterNumber: moduleIndex + 1,
          totalChapters: modules.length,
          chapterObjective: modules[moduleIndex].objective || null,
          isFinalChapter: moduleIndex === modules.length - 1,
        });
        break; // Only show one celebration at a time
      }
    }
  }, [steps, modules]);

  useEffect(() => {
    checkForCelebration();
  }, [checkForCelebration]);

  const dismissCelebration = useCallback(() => {
    setCelebration(null);
  }, []);

  return { celebration, dismissCelebration };
}
