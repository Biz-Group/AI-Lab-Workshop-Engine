// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let pathname = '/admin';

vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
}));

import { Breadcrumbs } from '@/components/admin/Breadcrumbs';

describe('Breadcrumbs', () => {
  beforeEach(() => {
    pathname = '/admin';
  });

  it('does not render on the admin dashboard', () => {
    const { container } = render(<Breadcrumbs />);
    expect(container.textContent).toBe('');
  });

  it('renders known admin path segments as links and current crumb text', () => {
    pathname = '/admin/templates/new';
    render(<Breadcrumbs />);

    expect(screen.getByText('Templates').closest('a')?.getAttribute('href')).toBe('/admin/templates');
    expect(screen.getByText('Create New').closest('a')).toBeNull();
  });

  it('falls back to Detail for uuid path segments', () => {
    pathname = '/admin/sessions/123e4567-e89b-12d3-a456-426614174000';
    render(<Breadcrumbs />);

    expect(screen.getByText('Sessions')).toBeTruthy();
    expect(screen.getByText('Detail')).toBeTruthy();
  });
});
