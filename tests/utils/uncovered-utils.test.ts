import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAIProvider, getAvailableProviders, getDefaultAIProvider, isAIAvailable } from '@/lib/ai/aiProvider';
import { StubAIProvider } from '@/lib/ai/providers/stub';
import { AIProviderNotAvailableError } from '@/lib/ai/types';
import {
  deleteModuleFromLibrary,
  getModuleIdFromBlock,
  getModuleIdFromStep,
} from '@/lib/utils/library-sync';
import { getJoinField, getJoinObject } from '@/lib/utils/supabase-join';

describe('supabase join helpers', () => {
  it('reads fields from array and object join shapes', () => {
    expect(getJoinField([{ name: 'Array value' }], 'name')).toBe('Array value');
    expect(getJoinField({ name: 'Object value' }, 'name')).toBe('Object value');
    expect(getJoinField([], 'name')).toBeNull();
    expect(getJoinField(null, 'name')).toBeNull();
  });

  it('returns the first object for array joins and the object for singular joins', () => {
    expect(getJoinObject<{ id: string }>([{ id: 'one' }])).toEqual({ id: 'one' });
    expect(getJoinObject<{ id: string }>({ id: 'two' })).toEqual({ id: 'two' });
    expect(getJoinObject(null)).toBeNull();
  });
});

describe('AI provider utilities', () => {
  const originalOpenAiKey = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    delete process.env.OPENAI_API_KEY;
  });

  afterEach(() => {
    process.env.OPENAI_API_KEY = originalOpenAiKey;
  });

  it('returns singleton stub providers and lists configured providers', () => {
    const first = getAIProvider('stub');
    const second = getAIProvider('stub');

    expect(first).toBe(second);
    expect(getDefaultAIProvider().name).toBe('stub');
    expect(getAvailableProviders()).toEqual(['stub']);
  });

  it('reports OpenAI availability from configuration and rejects unsupported providers', () => {
    expect(isAIAvailable()).toBe(false);
    process.env.OPENAI_API_KEY = 'test-key';
    expect(getAvailableProviders()).toContain('openai');
    expect(() => getAIProvider('anthropic')).toThrow('Anthropic provider not yet implemented');
  });

  it('stub provider returns deterministic suggestions, clusters, and summaries', async () => {
    const provider = new StubAIProvider();

    await expect(provider.complete([])).rejects.toBeInstanceOf(AIProviderNotAvailableError);
    await expect(provider.suggestPromptImprovements('Write copy')).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: 'specificity' }),
        expect.objectContaining({ category: 'clarity' }),
      ])
    );
    await expect(provider.clusterPrompts(['one', 'two'])).resolves.toEqual([
      expect.objectContaining({ count: 2, prompts: ['one', 'two'] }),
    ]);
    await expect(
      provider.generateSessionSummary(['one'], { sessionName: 'Workshop', participantCount: 2 })
    ).resolves.toEqual(expect.objectContaining({ totalParticipants: 2, completionRate: 0.5 }));
  });
});

function createSingleSelectClient(data: unknown) {
  return {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data }),
    })),
  };
}

describe('library sync helpers', () => {
  it('deletes library activity copies by source module id', async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const deleteFn = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ delete: deleteFn }));

    await deleteModuleFromLibrary({ from } as never, 'module-1');

    expect(from).toHaveBeenCalledWith('activity_library');
    expect(deleteFn).toHaveBeenCalledTimes(1);
    expect(eq).toHaveBeenCalledWith('source_module_id', 'module-1');
  });

  it('finds module and organization ids from a step id', async () => {
    const client = createSingleSelectClient({
      module_id: 'module-1',
      module: { template: { organization_id: 'org-1' } },
    });

    await expect(getModuleIdFromStep(client as never, 'step-1')).resolves.toEqual({
      moduleId: 'module-1',
      organizationId: 'org-1',
    });
  });

  it('finds module and organization ids from a prompt block id', async () => {
    const client = createSingleSelectClient({
      step: {
        module_id: 'module-1',
        module: { template: { organization_id: 'org-1' } },
      },
    });

    await expect(getModuleIdFromBlock(client as never, 'block-1')).resolves.toEqual({
      moduleId: 'module-1',
      organizationId: 'org-1',
    });
  });

  it('returns null when lookup rows are missing', async () => {
    const client = createSingleSelectClient(null);

    await expect(getModuleIdFromStep(client as never, 'missing')).resolves.toBeNull();
    await expect(getModuleIdFromBlock(client as never, 'missing')).resolves.toBeNull();
  });
});
