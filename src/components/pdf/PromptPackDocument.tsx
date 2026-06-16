/* eslint-disable jsx-a11y/alt-text */

import React from 'react';
import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from '@react-pdf/renderer';
import type { PromptPackData, PromptPackEntry } from '@/lib/types';
import { formatPromptPackInstructionSections } from '@/lib/utils/prompt-pack';

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
    textTransform: 'uppercase',
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
    fontStyle: 'italic',
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
  promptBlockTitle: {
    fontSize: 10,
    fontWeight: 700,
    marginBottom: 3,
  },
  muted: {
    color: '#6B7280',
  },
  body: {
    whiteSpace: 'pre-wrap',
  },
});

function groupEntriesByModule(entries: PromptPackEntry[]) {
  const groups: { moduleTitle: string; moduleObjective: string | null; entries: PromptPackEntry[] }[] = [];
  for (const entry of entries) {
    const last = groups[groups.length - 1];
    if (last && last.moduleTitle === entry.moduleTitle) {
      last.entries.push(entry);
    } else {
      groups.push({ moduleTitle: entry.moduleTitle, moduleObjective: entry.moduleObjective, entries: [entry] });
    }
  }
  return groups;
}

export function PromptPackDocument({ data }: { data: PromptPackData }) {
  const moduleGroups = groupEntriesByModule(data.entries);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.cover}>
          <Text style={styles.eyebrow}>Workshop Prompt Pack</Text>
          <Text style={styles.title}>{String(data.workshopName)}</Text>
          <Text style={styles.subtitle}>Prepared for {String(data.participantName)}</Text>
          <Text style={styles.subtitle}>{String(data.organizationName)}</Text>
          <Text style={styles.subtitle}>Completed {String(data.sessionDate)}</Text>
        </View>

        {moduleGroups.map((group, groupIndex) => (
          <View key={`module-${groupIndex}`}>
            <View style={styles.chapterHeader}>
              <Text style={styles.chapterTitle}>
                Chapter {groupIndex + 1}: {String(group.moduleTitle)}
              </Text>
              {group.moduleObjective && (
                <Text style={styles.chapterObjective}>{String(group.moduleObjective)}</Text>
              )}
            </View>

            {group.entries.map((entry, index) => {
              const instructionSections = formatPromptPackInstructionSections(entry.stepInstructions);

              return (
                <View key={`${entry.moduleTitle}-${entry.stepTitle}-${index}`} style={styles.section} wrap={false}>
                  <Text style={styles.stepTitle}>{String(entry.stepTitle)}</Text>

                  {instructionSections.length > 0 && (
                    <View style={styles.card}>
                      <Text style={styles.cardTitle}>Activity Instructions</Text>
                      {instructionSections.map((section) => (
                        <View key={section.label} style={{ marginBottom: 5 }}>
                          <Text style={styles.promptBlockTitle}>{String(section.label)}</Text>
                          <Text style={styles.body}>{String(section.content)}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {entry.promptBlocks.length > 0 && (
                    <View style={styles.card}>
                      <Text style={styles.cardTitle}>Prompt Blocks</Text>
                      {entry.promptBlocks.map((block, blockIndex) => (
                        <View key={`${block.title}-${blockIndex}`} style={{ marginBottom: blockIndex === entry.promptBlocks.length - 1 ? 0 : 6 }}>
                          <Text style={styles.promptBlockTitle}>{String(block.title)}</Text>
                          <Text style={styles.body}>{String(block.content)}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  <View style={[styles.card, styles.responseCard]}>
                    <Text style={styles.cardTitle}>Your Response</Text>
                    {entry.participantResponse?.content ? (
                      <Text style={styles.body}>{String(entry.participantResponse.content)}</Text>
                    ) : (
                      <Text style={styles.muted}>
                        No saved text response for this step. The instructions and prompts above are included for reuse later.
                      </Text>
                    )}
                    {entry.participantResponse?.imageUrl && (
                      <View style={{ marginTop: 8 }}>
                        <Text style={[styles.muted, { marginBottom: 4 }]}>Your submitted image:</Text>
                        <Image src={String(entry.participantResponse.imageUrl)} style={{ maxWidth: 300, maxHeight: 200, objectFit: 'contain' }} />
                      </View>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        ))}
      </Page>
    </Document>
  );
}
