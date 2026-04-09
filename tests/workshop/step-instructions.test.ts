import { describe, expect, it } from 'vitest';
import { parseChecklistItems, parseStepInstructions } from '@/lib/utils/step-instructions';

describe('parseStepInstructions', () => {
  it('parses a fully structured step with all supported sections', () => {
    const input = `
## Objective
Understand the customer use case.

## Actions
1. Read the brief.
2. Draft your response.

## Deliverable
Submit one polished response.

## Checklist
- Response includes context
- Response has a clear CTA

## Tips
Keep it concise and specific.

## Success Signal
It feels ready to test with a real user.

## Reflect
Notice which detail made your response more useful.

## Next Up
You will refine this into a stronger final version.
`;

    const parsed = parseStepInstructions(input);

    expect(parsed.objective).toContain('Understand the customer use case');
    expect(parsed.actions).toContain('Read the brief');
    expect(parsed.deliverable).toContain('Submit one polished response');
    expect(parsed.checklist).toContain('Response includes context');
    expect(parsed.tips).toContain('Keep it concise and specific');
    expect(parsed.successSignal).toContain('ready to test');
    expect(parsed.reflection).toContain('more useful');
    expect(parsed.nextUp).toContain('stronger final version');
  });

  it('supports mixed alias headers and inline content', () => {
    const input = `
Outcome: Build a stronger first message.
Task - Review the example and rewrite it.
What to Submit: Paste your final message.
Done When:
- It is under 70 words
- It includes one clear ask
Hints: Use plain language.
Reflect: Notice what became clearer.
Next: Use this draft in the next exercise.
`;

    const parsed = parseStepInstructions(input);

    expect(parsed.objective).toBe('Build a stronger first message.');
    expect(parsed.actions).toContain('Review the example and rewrite it.');
    expect(parsed.deliverable).toBe('Paste your final message.');
    expect(parsed.checklist).toContain('It is under 70 words');
    expect(parsed.tips).toBe('Use plain language.');
    expect(parsed.reflection).toBe('Notice what became clearer.');
    expect(parsed.nextUp).toBe('Use this draft in the next exercise.');
  });

  it('falls back to actions for legacy plain text instructions', () => {
    const input = 'Write a draft response and submit it with one screenshot.';
    const parsed = parseStepInstructions(input);

    expect(parsed.actions).toBe(input);
    expect(parsed.objective).toBeUndefined();
    expect(parsed.deliverable).toBeUndefined();
    expect(parsed.checklist).toBeUndefined();
    expect(parsed.tips).toBeUndefined();
  });

  it('returns empty object for blank input', () => {
    expect(parseStepInstructions('   \n  ')).toEqual({});
    expect(parseStepInstructions(null)).toEqual({});
  });
});

describe('parseChecklistItems', () => {
  it('normalizes checklist lines from markdown bullets and numbering', () => {
    const checklist = '- [ ] First item\n* Second item\n3. Third item';
    expect(parseChecklistItems(checklist)).toEqual(['First item', 'Second item', 'Third item']);
  });
});
