export type StepInstructionSection =
  | 'objective'
  | 'actions'
  | 'deliverable'
  | 'checklist'
  | 'tips'
  | 'successSignal'
  | 'reflection'
  | 'nextUp';

export interface ParsedStepInstructions {
  objective?: string;
  actions?: string;
  deliverable?: string;
  checklist?: string;
  tips?: string;
  successSignal?: string;
  reflection?: string;
  nextUp?: string;
}

type DetectedHeader = {
  section: StepInstructionSection;
  content: string | null;
};

const HEADER_TO_SECTION: Record<string, StepInstructionSection> = {
  objective: 'objective',
  outcome: 'objective',
  task: 'actions',
  tasks: 'actions',
  action: 'actions',
  actions: 'actions',
  instruction: 'actions',
  instructions: 'actions',
  deliverable: 'deliverable',
  'what to submit': 'deliverable',
  checklist: 'checklist',
  'done when': 'checklist',
  'success signal': 'successSignal',
  success: 'successSignal',
  reflect: 'reflection',
  reflection: 'reflection',
  'next up': 'nextUp',
  next: 'nextUp',
  tip: 'tips',
  tips: 'tips',
  hint: 'tips',
  hints: 'tips',
  'why this matters': 'objective',
};

function normalizeHeaderLabel(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[*_`]/g, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function resolveSectionFromLabel(label: string): StepInstructionSection | null {
  const normalized = normalizeHeaderLabel(label);
  return HEADER_TO_SECTION[normalized] ?? null;
}

function detectSectionHeader(line: string): DetectedHeader | null {
  const trimmedLine = line.trim();
  if (!trimmedLine) return null;

  const withoutMarkdownHeading = trimmedLine.replace(/^#{1,6}\s*/, '').trim();
  let labelCandidate = withoutMarkdownHeading;
  let trailingContent = '';

  const boldHeaderMatch = withoutMarkdownHeading.match(/^(?:\*\*|__)(.+?)(?:\*\*|__)\s*:?\s*(.*)$/);
  if (boldHeaderMatch) {
    labelCandidate = boldHeaderMatch[1];
    trailingContent = boldHeaderMatch[2] ?? '';
  } else {
    const inlineHeaderMatch = withoutMarkdownHeading.match(/^([A-Za-z][A-Za-z\s]{1,40}?)(?:\s*[:\-])\s*(.*)$/);
    if (inlineHeaderMatch) {
      labelCandidate = inlineHeaderMatch[1];
      trailingContent = inlineHeaderMatch[2] ?? '';
    } else {
      labelCandidate = withoutMarkdownHeading.replace(/[:\-]\s*$/, '').trim();
      trailingContent = '';
    }
  }

  const section = resolveSectionFromLabel(labelCandidate);
  if (!section) return null;

  const content = trailingContent.trim();
  return {
    section,
    content: content.length > 0 ? content : null,
  };
}

function cleanSection(lines: string[]): string | undefined {
  if (lines.length === 0) return undefined;

  let start = 0;
  let end = lines.length - 1;

  while (start <= end && lines[start].trim() === '') start += 1;
  while (end >= start && lines[end].trim() === '') end -= 1;

  if (start > end) return undefined;
  return lines.slice(start, end + 1).join('\n').trim();
}

export function parseStepInstructions(instructionMarkdown: string | null | undefined): ParsedStepInstructions {
  const markdown = (instructionMarkdown ?? '').replace(/\r\n/g, '\n');
  if (!markdown.trim()) return {};

  const lines = markdown.split('\n');
  const sectionLines: Record<StepInstructionSection, string[]> = {
    objective: [],
    actions: [],
    deliverable: [],
    checklist: [],
    tips: [],
    successSignal: [],
    reflection: [],
    nextUp: [],
  };
  const prefaceLines: string[] = [];

  let activeSection: StepInstructionSection | null = null;
  let foundAnyHeader = false;

  for (const line of lines) {
    const detectedHeader = detectSectionHeader(line);
    if (detectedHeader) {
      foundAnyHeader = true;
      activeSection = detectedHeader.section;
      if (detectedHeader.content) {
        sectionLines[activeSection].push(detectedHeader.content);
      }
      continue;
    }

    if (activeSection) {
      sectionLines[activeSection].push(line);
    } else {
      prefaceLines.push(line);
    }
  }

  if (!foundAnyHeader) {
    return { actions: markdown.trim() };
  }

  const parsed: ParsedStepInstructions = {};
  for (const sectionName of Object.keys(sectionLines) as StepInstructionSection[]) {
    const cleaned = cleanSection(sectionLines[sectionName]);
    if (cleaned) parsed[sectionName] = cleaned;
  }

  const preface = cleanSection(prefaceLines);
  if (preface) {
    parsed.actions = parsed.actions ? `${preface}\n\n${parsed.actions}` : preface;
  }

  return parsed;
}

/**
 * Which participant-facing surfaces a step should render.
 *
 * A gallery step is stripped down deliberately: its prompt lives on the shared
 * projected wall, so the phone/laptop shows only the title and the image
 * submission control. Everything else on the step would compete with the room's
 * attention or send the participant out to another tab mid-collection.
 *
 * The `showResponseField` rule is the legacy one, kept verbatim: an explicit
 * `true` shows the field, an explicit `false` hides it, and `undefined` falls
 * back to "required step or last step" for steps authored before the flag
 * existed.
 */
export interface StepLayout {
  /** Instruction sections, prompt blocks, AI-tool button, objective header card. */
  showGuidedContent: boolean;
  /** The standard free-text + optional image submission card. */
  showResponseField: boolean;
  /** The image-first gallery submission card. */
  showGallerySubmission: boolean;
}

export function getStepLayout(
  step: {
    is_required?: boolean;
    show_response_field?: boolean;
    is_gallery_step?: boolean;
  } | null | undefined,
  isLastStep: boolean
): StepLayout {
  if (!step) {
    return { showGuidedContent: false, showResponseField: false, showGallerySubmission: false };
  }

  if (step.is_gallery_step === true) {
    return { showGuidedContent: false, showResponseField: false, showGallerySubmission: true };
  }

  const showResponseField =
    step.show_response_field === true ||
    (step.show_response_field !== false && (Boolean(step.is_required) || isLastStep));

  return { showGuidedContent: true, showResponseField, showGallerySubmission: false };
}

export function parseChecklistItems(checklist: string | undefined): string[] {
  if (!checklist) return [];

  const items = checklist
    .split('\n')
    .map((line) =>
      line
        .replace(/^\s*(?:[-*]\s*\[[xX ]\]\s*|[-*]\s+|\d+[.)]\s+)/, '')
        .trim()
    )
    .filter(Boolean);

  if (items.length > 0) return items;

  const fallback = checklist.trim();
  return fallback ? [fallback] : [];
}
