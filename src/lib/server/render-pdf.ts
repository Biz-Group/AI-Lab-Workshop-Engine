/**
 * Server-only PDF renderer that avoids the dual-React problem.
 *
 * Next.js 16 bundles route handlers with its internal React 19 canary, but
 * @react-pdf/renderer (loaded as a server-external package) resolves to the
 * project's node_modules React 18. The two React instances use different
 * $$typeof Symbols, so elements created by one are "plain objects" to the
 * other – causing React error #31.
 *
 * This module side-steps the issue by:
 *  1. Using createRequire (from node:module) to obtain a require function that
 *     resolves from the project root — bypassing the bundler's static
 *     rewriting of require('react') → next/dist/compiled/react.
 *  2. Building the entire document tree with React.createElement from that
 *     single React 18 instance – no JSX transform involved.
 *  3. Passing the tree to renderToBuffer, which now recognises every element.
 */

import type { PromptPackData, PromptPackEntry, PromptPackStepInstructions } from '@/lib/types';
import { formatPromptPackInstructionSections } from '@/lib/utils/prompt-pack';
import { createRequire } from 'node:module';
import { join } from 'node:path';

// Obtain a require() that resolves from the project root's node_modules,
// NOT from the bundler's module graph (which maps 'react' → React 19 canary).
const nodeRequire = createRequire(join(process.cwd(), 'package.json'));

const React = nodeRequire('react') as typeof import('react');
const {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
  renderToBuffer,
} = nodeRequire('@react-pdf/renderer') as typeof import('@react-pdf/renderer');

const h = React.createElement;

// ─── styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  page: {
    padding: 32,
    fontSize: 10,
    color: '#111827',
    fontFamily: 'Helvetica',
    lineHeight: 1.45,
  },
  cover: {
    paddingBottom: 18,
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#D1D5DB',
  },
  eyebrow: {
    fontSize: 10,
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
    color: '#2563EB',
    marginBottom: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: 700,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 11,
    color: '#4B5563',
    marginBottom: 3,
  },
  chapterHeader: {
    marginTop: 10,
    marginBottom: 14,
    paddingBottom: 8,
    borderBottomWidth: 2,
    borderBottomColor: '#2563EB',
  },
  chapterTitle: {
    fontSize: 16,
    fontWeight: 700,
    color: '#1E3A8A',
    marginBottom: 3,
  },
  chapterObjective: {
    fontSize: 10,
    color: '#4B5563',
    fontStyle: 'italic' as const,
  },
  section: {
    marginBottom: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  stepTitle: {
    fontSize: 15,
    fontWeight: 700,
    marginBottom: 10,
  },
  card: {
    marginBottom: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 6,
    backgroundColor: '#F9FAFB',
  },
  responseCard: {
    backgroundColor: '#EEF2FF',
    borderColor: '#C7D2FE',
  },
  cardTitle: {
    fontSize: 10,
    fontWeight: 700,
    marginBottom: 5,
  },
  blockTitle: {
    fontSize: 10,
    fontWeight: 700,
    marginBottom: 3,
  },
  muted: { color: '#6B7280' },
  body: { whiteSpace: 'pre-wrap' as const },
});

// ─── helpers ─────────────────────────────────────────────────────────────────

function groupByModule(entries: PromptPackEntry[]) {
  const groups: {
    moduleTitle: string;
    moduleObjective: string | null;
    entries: PromptPackEntry[];
  }[] = [];
  for (const entry of entries) {
    const last = groups[groups.length - 1];
    if (last && last.moduleTitle === entry.moduleTitle) {
      last.entries.push(entry);
    } else {
      groups.push({
        moduleTitle: entry.moduleTitle,
        moduleObjective: entry.moduleObjective,
        entries: [entry],
      });
    }
  }
  return groups;
}

function renderInstructionSections(sections: PromptPackStepInstructions) {
  const formatted = formatPromptPackInstructionSections(sections);
  if (formatted.length === 0) return null;

  return h(View, { style: styles.card },
    h(Text, { style: styles.cardTitle }, 'Activity Instructions'),
    ...formatted.map((s) =>
      h(View, { key: s.label, style: { marginBottom: 5 } },
        h(Text, { style: styles.blockTitle }, String(s.label)),
        h(Text, { style: styles.body }, String(s.content)),
      ),
    ),
  );
}

function renderPromptBlocks(blocks: PromptPackEntry['promptBlocks']) {
  if (blocks.length === 0) return null;

  return h(View, { style: styles.card },
    h(Text, { style: styles.cardTitle }, 'Prompt Blocks'),
    ...blocks.map((block, i) =>
      h(View, { key: `${block.title}-${i}`, style: { marginBottom: i === blocks.length - 1 ? 0 : 6 } },
        h(Text, { style: styles.blockTitle }, String(block.title)),
        h(Text, { style: styles.body }, String(block.content)),
      ),
    ),
  );
}

function renderResponse(response: PromptPackEntry['participantResponse']) {
  return h(View, { style: [styles.card, styles.responseCard] },
    h(Text, { style: styles.cardTitle }, 'Your Response'),
    response?.content
      ? h(Text, { style: styles.body }, String(response.content))
      : h(Text, { style: styles.muted },
          'No saved text response for this step. The instructions and prompts above are included for reuse later.',
        ),
    response?.imageUrl
      ? h(View, { style: { marginTop: 8 } },
          h(Text, { style: [styles.muted, { marginBottom: 4 }] }, 'Your submitted image:'),
          h(Image, { src: String(response.imageUrl), style: { maxWidth: 300, maxHeight: 200, objectFit: 'contain' } }),
        )
      : null,
  );
}

function buildDocument(data: PromptPackData) {
  const groups = groupByModule(data.entries);

  return h(Document, null,
    h(Page, { size: 'A4', style: styles.page },
      // Cover
      h(View, { style: styles.cover },
        h(Text, { style: styles.eyebrow }, 'Workshop Prompt Pack'),
        h(Text, { style: styles.title }, String(data.workshopName)),
        h(Text, { style: styles.subtitle }, `Prepared for ${String(data.participantName)}`),
        h(Text, { style: styles.subtitle }, String(data.organizationName)),
        h(Text, { style: styles.subtitle }, `Completed ${String(data.sessionDate)}`),
      ),
      // Module groups
      ...groups.map((group, gi) =>
        h(View, { key: `mod-${gi}` },
          // Chapter header
          h(View, { style: styles.chapterHeader },
            h(Text, { style: styles.chapterTitle },
              `Chapter ${gi + 1}: ${String(group.moduleTitle)}`,
            ),
            group.moduleObjective
              ? h(Text, { style: styles.chapterObjective }, String(group.moduleObjective))
              : null,
          ),
          // Steps
          ...group.entries.map((entry, si) =>
            h(View, {
              key: `${entry.moduleTitle}-${entry.stepTitle}-${si}`,
              style: styles.section,
            },
              h(Text, { style: styles.stepTitle }, String(entry.stepTitle)),
              renderInstructionSections(entry.stepInstructions),
              renderPromptBlocks(entry.promptBlocks),
              renderResponse(entry.participantResponse),
            ),
          ),
        ),
      ),
    ),
  );
}

// ─── public API ──────────────────────────────────────────────────────────────

export async function renderPromptPackPdf(
  data: PromptPackData,
): Promise<Buffer> {
  const element = buildDocument(data);
  const buffer = await renderToBuffer(element as React.ReactElement);
  return Buffer.from(buffer);
}
