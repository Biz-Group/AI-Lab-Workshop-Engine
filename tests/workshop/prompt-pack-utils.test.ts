import { describe, expect, it } from 'vitest';
import {
  buildPromptPackDataFromSource,
  mapPromptPackEntries,
} from '@/lib/utils/prompt-pack';

describe('prompt-pack utils', () => {
  it('includes step instructions and prompt blocks even without a submission', () => {
    const entries = mapPromptPackEntries(
      [
        {
          title: 'Discovery',
          steps: [
            {
              id: 'step-1',
              title: 'Persona Prompt',
              instruction_markdown: 'Objective: Clarify audience\nActions: Describe the audience\nTips: Use concrete detail',
              prompt_blocks: [
                {
                  title: 'Starter Prompt',
                  content_markdown: 'Act as a strategist for...',
                  is_copyable: true,
                },
              ],
            },
          ],
        },
      ],
      []
    );

    const pack = buildPromptPackDataFromSource({
      participantName: 'Alex',
      sessionDate: '04/10/2026',
      organizationName: 'Biz Group',
      workshopName: 'Prompt Lab',
      entries,
    });

    expect(pack.entries).toHaveLength(1);
    expect(pack.entries[0].stepInstructions.objective).toBe('Clarify audience');
    expect(pack.entries[0].promptBlocks[0].title).toBe('Starter Prompt');
    expect(pack.entries[0].participantResponse).toBeNull();
  });
});
