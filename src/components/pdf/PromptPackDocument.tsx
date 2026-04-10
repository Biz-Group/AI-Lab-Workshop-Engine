import React from 'react';
import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
} from '@react-pdf/renderer';
import type { PromptPackData } from '@/lib/types';
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
  section: {
    marginBottom: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  moduleLabel: {
    fontSize: 9,
    color: '#6B7280',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
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

export function PromptPackDocument({ data }: { data: PromptPackData }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.cover}>
          <Text style={styles.eyebrow}>Workshop Prompt Pack</Text>
          <Text style={styles.title}>{data.workshopName}</Text>
          <Text style={styles.subtitle}>Prepared for {data.participantName}</Text>
          <Text style={styles.subtitle}>{data.organizationName}</Text>
          <Text style={styles.subtitle}>Completed {data.sessionDate}</Text>
        </View>

        {data.entries.map((entry, index) => {
          const instructionSections = formatPromptPackInstructionSections(entry.stepInstructions);

          return (
            <View key={`${entry.moduleTitle}-${entry.stepTitle}-${index}`} style={styles.section} wrap={false}>
              <Text style={styles.moduleLabel}>{entry.moduleTitle}</Text>
              <Text style={styles.stepTitle}>{entry.stepTitle}</Text>

              {instructionSections.length > 0 && (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Attendee Prompt</Text>
                  {instructionSections.map((section) => (
                    <View key={section.label} style={{ marginBottom: 5 }}>
                      <Text style={styles.promptBlockTitle}>{section.label}</Text>
                      <Text style={styles.body}>{section.content}</Text>
                    </View>
                  ))}
                </View>
              )}

              {entry.promptBlocks.length > 0 && (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Prompt Blocks</Text>
                  {entry.promptBlocks.map((block, blockIndex) => (
                    <View key={`${block.title}-${blockIndex}`} style={{ marginBottom: blockIndex === entry.promptBlocks.length - 1 ? 0 : 6 }}>
                      <Text style={styles.promptBlockTitle}>{block.title}</Text>
                      <Text style={styles.body}>{block.content}</Text>
                    </View>
                  ))}
                </View>
              )}

              <View style={[styles.card, styles.responseCard]}>
                <Text style={styles.cardTitle}>Participant Response</Text>
                {entry.participantResponse?.content ? (
                  <Text style={styles.body}>{entry.participantResponse.content}</Text>
                ) : (
                  <Text style={styles.muted}>
                    No saved text response for this step. The workshop prompt is still included for reuse later.
                  </Text>
                )}
                {entry.participantResponse?.imageUrl && (
                  <Text style={[styles.muted, { marginTop: 5 }]}>
                    Image submission captured during session: {entry.participantResponse.imageUrl}
                  </Text>
                )}
              </View>
            </View>
          );
        })}
      </Page>
    </Document>
  );
}
