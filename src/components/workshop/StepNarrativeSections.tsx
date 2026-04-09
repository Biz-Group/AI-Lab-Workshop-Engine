'use client';

import { ReactNode } from 'react';
import {
  BookOpen,
  ListChecks,
  ClipboardCheck,
  CheckCircle,
  Lightbulb,
  Compass,
  NotebookPen,
  ArrowRightCircle,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui';
import type { ParsedStepInstructions } from '@/lib/utils';

interface StepNarrativeSectionsProps {
  instructions: ParsedStepInstructions;
  className?: string;
}

interface NarrativeSectionConfig {
  key: keyof ParsedStepInstructions;
  title: string;
  icon: ReactNode;
  tone: string;
}

const SECTION_CONFIG: NarrativeSectionConfig[] = [
  {
    key: 'objective',
    title: 'Why This Matters',
    icon: <BookOpen className="w-3.5 h-3.5" />,
    tone: 'text-sky-700',
  },
  {
    key: 'actions',
    title: 'What To Do',
    icon: <ListChecks className="w-3.5 h-3.5" />,
    tone: 'text-slate-700',
  },
  {
    key: 'deliverable',
    title: 'What You Will Leave With',
    icon: <ClipboardCheck className="w-3.5 h-3.5" />,
    tone: 'text-emerald-700',
  },
  {
    key: 'checklist',
    title: 'Done Enough When',
    icon: <CheckCircle className="w-3.5 h-3.5" />,
    tone: 'text-emerald-700',
  },
  {
    key: 'tips',
    title: 'Helpful Prompts',
    icon: <Lightbulb className="w-3.5 h-3.5" />,
    tone: 'text-amber-700',
  },
  {
    key: 'successSignal',
    title: 'Success Signal',
    icon: <Compass className="w-3.5 h-3.5" />,
    tone: 'text-violet-700',
  },
  {
    key: 'reflection',
    title: 'Reflect',
    icon: <NotebookPen className="w-3.5 h-3.5" />,
    tone: 'text-fuchsia-700',
  },
  {
    key: 'nextUp',
    title: 'Next Up',
    icon: <ArrowRightCircle className="w-3.5 h-3.5" />,
    tone: 'text-brand-700',
  },
];

function ChecklistSection({ checklist }: { checklist: string }) {
  const items = checklist
    .split('\n')
    .map((line) => line.replace(/^\s*(?:[-*]\s*\[[xX ]\]\s*|[-*]\s+|\d+[.)]\s+)/, '').trim())
    .filter(Boolean);

  if (items.length === 0) {
    return <div className="whitespace-pre-wrap text-gray-900">{checklist}</div>;
  }

  return (
    <ul className="space-y-2">
      {items.map((item, index) => (
        <li key={`${item}-${index}`} className="flex items-start gap-2 text-sm text-gray-800">
          <span className="mt-1 h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function StepNarrativeSections({ instructions, className }: StepNarrativeSectionsProps) {
  const sections = SECTION_CONFIG.filter(({ key }) => instructions[key]);

  if (sections.length === 0) return null;

  return (
    <div className={className}>
      {sections.map(({ key, title, icon, tone }) => {
        const content = instructions[key];
        if (!content) return null;

        return (
          <Card key={key} className="instruction-section-card">
            <CardContent className="p-0">
              <div className={`flex items-center gap-2 mb-2 ${tone}`}>
                {icon}
                <h3 className="instruction-section-heading">{title}</h3>
              </div>
              {key === 'checklist' ? (
                <ChecklistSection checklist={content} />
              ) : (
                <div className="markdown-content text-gray-900 whitespace-pre-wrap">
                  {content}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
