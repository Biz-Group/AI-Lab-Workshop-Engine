// ============================================================================
// Stub AI Provider
// No-op implementation for v1 (no actual AI calls)
// Users copy/paste to ChatGPT manually
// ============================================================================

import type {
  AIProvider,
  ChatMessage,
  CompletionOptions,
  CompletionResponse,
  PromptSuggestion,
  PromptCluster,
  SessionSummary,
} from '../types';
import { AIProviderNotAvailableError } from '../types';

/**
 * Stub provider that doesn't make any AI calls
 * All methods return mock data or throw NotAvailable errors
 */
export class StubAIProvider implements AIProvider {
  readonly name = 'stub';

  isAvailable(): boolean {
    // Stub is always "available" but returns mock data
    return true;
  }

  async complete(
    _messages: ChatMessage[],
    _options?: CompletionOptions
  ): Promise<CompletionResponse> {
    void _messages;
    void _options;
    // TODO: In v2, replace with actual AI provider call
    throw new AIProviderNotAvailableError(this.name);
  }

  async suggestPromptImprovements(
    prompt: string
  ): Promise<PromptSuggestion[]> {
    // TODO: In v2, use AI to analyze and suggest improvements
    // For now, return basic static suggestions
    const suggestions: PromptSuggestion[] = [];

    // Check for common issues
    if (prompt.length < 50) {
      suggestions.push({
        original: prompt,
        improved: prompt + '\n\nPlease provide specific details and examples.',
        explanation: 'Adding more context helps the AI understand your needs better.',
        category: 'specificity',
      });
    }

    if (!prompt.includes('?') && !prompt.toLowerCase().includes('please')) {
      suggestions.push({
        original: prompt,
        improved: 'Please ' + prompt.charAt(0).toLowerCase() + prompt.slice(1),
        explanation: 'Starting with "Please" makes the request clearer.',
        category: 'clarity',
      });
    }

    return suggestions;
  }

  async clusterPrompts(
    prompts: string[]
  ): Promise<PromptCluster[]> {
    // TODO: In v2, use embeddings + clustering algorithm
    // For now, return all prompts in a single cluster
    return [
      {
        name: 'All Submissions',
        description: 'All participant submissions',
        prompts,
        count: prompts.length,
      },
    ];
  }

  async generateSessionSummary(
    submissions: string[],
    context: {
      sessionName: string;
      participantCount: number;
    }
  ): Promise<SessionSummary> {
    // TODO: In v2, use AI to generate meaningful summary
    // For now, return basic statistics
    return {
      totalParticipants: context.participantCount,
      completionRate: submissions.length / Math.max(context.participantCount, 1),
      topThemes: ['Prompt Engineering', 'AI Assistance', 'Workflow Optimization'],
      highlights: [
        `${submissions.length} prompts submitted`,
        `Workshop: ${context.sessionName}`,
      ],
      recommendations: [
        'Review participant submissions for common patterns',
        'Consider follow-up sessions for advanced topics',
      ],
    };
  }
}
