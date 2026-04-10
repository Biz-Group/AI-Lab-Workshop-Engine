import type {
  PromptPackData,
  PromptPackEntry,
  PromptPackPromptBlock,
  PromptPackStepInstructions,
} from '@/lib/types';
import { parseStepInstructions } from '@/lib/utils/step-instructions';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function firstRelationRecord(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    return asRecord(value[0] ?? null);
  }

  return asRecord(value);
}

function readString(record: Record<string, unknown> | null, key: string): string | null {
  const value = record?.[key];
  return typeof value === 'string' ? value : null;
}

function hasPromptPackContent(entry: PromptPackEntry): boolean {
  return Boolean(
    entry.participantResponse?.content ||
      entry.participantResponse?.imageUrl ||
      entry.promptBlocks.length > 0 ||
      Object.values(entry.stepInstructions).some(Boolean)
  );
}

export interface PromptPackSourceData {
  participantName: string;
  sessionDate: string;
  organizationName: string;
  workshopName: string;
  entries: PromptPackEntry[];
  takeaways?: string[];
}

export function buildPromptPackDataFromSource(source: PromptPackSourceData): PromptPackData {
  return {
    participantName: source.participantName,
    sessionDate: source.sessionDate,
    organizationName: source.organizationName,
    workshopName: source.workshopName,
    entries: source.entries,
    takeaways: source.takeaways ?? [],
  };
}

export function mapPromptPackEntries(
  modules: unknown[],
  submissions: unknown[]
): PromptPackEntry[] {
  const submissionByStepId = new Map(
    submissions
      .map((submission) => {
        const record = asRecord(submission);
        const stepId = readString(record, 'step_id');
        if (!stepId) return null;

        return [
          stepId,
          {
            content: readString(record, 'content') ?? '',
            imageUrl: readString(record, 'image_url'),
            submittedAt: readString(record, 'created_at'),
            updatedAt: readString(record, 'updated_at'),
          },
        ] as const;
      })
      .filter((entry): entry is readonly [string, { content: string; imageUrl: string | null; submittedAt: string | null; updatedAt: string | null }] => Boolean(entry))
  );

  return modules.flatMap((module) => {
    const moduleRecord = asRecord(module);
    const moduleTitle = readString(moduleRecord, 'title') ?? 'Untitled Module';
    const moduleObjective = readString(moduleRecord, 'objective');

    return asArray<unknown>(moduleRecord?.steps).map((step) => {
      const stepRecord = asRecord(step);
      const stepId = readString(stepRecord, 'id') ?? '';
      const promptBlocks = asArray<unknown>(stepRecord?.prompt_blocks)
        .map((block) => {
          const blockRecord = asRecord(block);
          const title = readString(blockRecord, 'title');
          const content = readString(blockRecord, 'content_markdown');
          const isCopyable = blockRecord?.is_copyable;

          if (!title || !content) return null;

          return {
            title,
            content,
            isCopyable: typeof isCopyable === 'boolean' ? isCopyable : true,
          } satisfies PromptPackPromptBlock;
        })
        .filter((block): block is PromptPackPromptBlock => Boolean(block));

      const instructionMarkdown = readString(stepRecord, 'instruction_markdown') ?? '';
      const parsed = parseStepInstructions(instructionMarkdown);
      const stepInstructions: PromptPackStepInstructions = {
        ...parsed,
        rawInstructions: Object.keys(parsed).length === 0 && instructionMarkdown.trim()
          ? instructionMarkdown.trim()
          : undefined,
      };

      return {
        moduleTitle,
        moduleObjective,
        stepTitle: readString(stepRecord, 'title') ?? 'Untitled Step',
        stepInstructions,
        promptBlocks,
        participantResponse: submissionByStepId.get(stepId) ?? null,
      } satisfies PromptPackEntry;
    });
  });
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatPromptPackInstructionSections(sections: PromptPackStepInstructions): Array<{
  label: string;
  content: string;
}> {
  const orderedSections: Array<[keyof PromptPackStepInstructions, string]> = [
    ['objective', 'Why This Matters'],
    ['actions', 'What To Do'],
    ['deliverable', 'What You Will Leave With'],
    ['checklist', 'Done Enough When'],
    ['tips', 'Helpful Prompts'],
    ['successSignal', 'Success Signal'],
    ['reflection', 'Reflect'],
    ['nextUp', 'Next Up'],
  ];

  const result = orderedSections.flatMap(([key, label]) => {
    const content = sections[key];
    return content ? [{ label, content }] : [];
  });

  // If no structured sections were found, include the raw instruction text as fallback
  if (result.length === 0 && sections.rawInstructions) {
    result.push({ label: 'Instructions', content: sections.rawInstructions });
  }

  return result;
}

export function readJoinedName(value: unknown, fallback: string): string {
  const record = firstRelationRecord(value);
  return readString(record, 'name') ?? fallback;
}
