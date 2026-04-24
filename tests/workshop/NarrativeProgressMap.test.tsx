// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NarrativeProgressMap } from '@/components/workshop/NarrativeProgressMap';

const modules = [{ title: 'Module 1', objective: 'Objective 1' }];

describe('NarrativeProgressMap', () => {
  it('shows skipped badge and styling for incomplete steps', () => {
    render(
      <NarrativeProgressMap
        modules={modules}
        steps={[
          {
            id: 'step-1',
            title: 'Step 1',
            moduleTitle: 'Module 1',
            moduleIndex: 0,
            status: 'incomplete',
            isFirstInModule: true,
            isLastInModule: false,
            isLastStep: false,
          },
          {
            id: 'step-2',
            title: 'Step 2',
            moduleTitle: 'Module 1',
            moduleIndex: 0,
            status: 'current',
            isFirstInModule: false,
            isLastInModule: false,
            isLastStep: false,
          },
          {
            id: 'step-3',
            title: 'Step 3',
            moduleTitle: 'Module 1',
            moduleIndex: 0,
            status: 'upcoming',
            isFirstInModule: false,
            isLastInModule: true,
            isLastStep: true,
          },
        ]}
      />
    );

    expect(screen.getByText('Come back later')).toBeTruthy();
    expect(screen.getByText('Step 1').className).toContain('text-amber-700');
  });

  it('keeps existing status styles for completed, current, and upcoming', () => {
    render(
      <NarrativeProgressMap
        modules={modules}
        steps={[
          {
            id: 'step-1',
            title: 'Step 1',
            moduleTitle: 'Module 1',
            moduleIndex: 0,
            status: 'completed',
            isFirstInModule: true,
            isLastInModule: false,
            isLastStep: false,
          },
          {
            id: 'step-2',
            title: 'Step 2',
            moduleTitle: 'Module 1',
            moduleIndex: 0,
            status: 'current',
            isFirstInModule: false,
            isLastInModule: false,
            isLastStep: false,
          },
          {
            id: 'step-3',
            title: 'Step 3',
            moduleTitle: 'Module 1',
            moduleIndex: 0,
            status: 'upcoming',
            isFirstInModule: false,
            isLastInModule: true,
            isLastStep: true,
          },
        ]}
      />
    );

    expect(screen.queryByText('Come back later')).toBeNull();
    expect(screen.getByText('Step 1').className).toContain('text-gray-600');
    expect(screen.getByText('Step 2').className).toContain('text-brand-700');
    expect(screen.getByText('Step 3').className).toContain('text-gray-400');
  });
});
