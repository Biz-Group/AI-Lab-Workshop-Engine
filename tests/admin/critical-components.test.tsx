// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const refreshMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const fetchMock = vi.fn();
global.fetch = fetchMock;

import { AccessRequestForm } from '@/components/admin/AccessRequestForm';
import { TeamManager } from '@/components/admin/TeamManager';
import { FeedbackForm } from '@/components/workshop/FeedbackForm';
import { SessionsTable } from '@/app/admin/sessions/SessionsTable';
import { TemplatesList } from '@/app/admin/templates/TemplatesList';
import toast from 'react-hot-toast';

describe('critical admin and workshop components', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockReset();
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
    vi.stubGlobal('confirm', vi.fn(() => true));
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'generated-id') });
  });

  it('submits an access request after loading organizations', async () => {
    fetchMock
      .mockResolvedValueOnce({
        status: 200,
        json: async () => ({
          success: true,
          data: {
            organizations: [{ id: 'org-1', name: 'Biz Group' }],
            pendingRequestOrgs: [],
          },
        }),
      })
      .mockResolvedValueOnce({
        json: async () => ({ success: true }),
      });

    render(<AccessRequestForm />);

    fireEvent.change(await screen.findByPlaceholderText('Enter your display name'), {
      target: { value: 'Alex Facilitator' },
    });
    fireEvent.click(screen.getByRole('button', { name: /request access/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenLastCalledWith(
        '/api/auth/request-access',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            organization_id: 'org-1',
            display_name: 'Alex Facilitator',
          }),
        })
      );
    });
    expect(await screen.findByText('Request Submitted')).toBeInTheDocument();
    expect(toast.success).toHaveBeenCalledWith('Access request submitted!');
  });

  it('validates and submits workshop feedback', async () => {
    const onFeedbackSubmitted = vi.fn();
    fetchMock.mockResolvedValueOnce({
      json: async () => ({ success: true }),
    });

    render(
      <FeedbackForm
        sessionId="session-1"
        participantId="participant-1"
        participantName="Alex"
        onFeedbackSubmitted={onFeedbackSubmitted}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /save reflection/i }));
    expect(screen.getByText('Please provide a rating')).toBeInTheDocument();
    expect(screen.getByText('Please share your feedback')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Rate 5 out of 5' }));
    fireEvent.change(screen.getByPlaceholderText(/share your thoughts/i), {
      target: { value: 'This was practical and useful.' },
    });
    fireEvent.change(screen.getByPlaceholderText(/specific prompts/i), {
      target: { value: 'Prompt examples' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save reflection/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/feedback',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            sessionId: 'session-1',
            participantId: 'participant-1',
            rating: 5,
            feedback: 'This was practical and useful.',
            mostValuable: 'Prompt examples',
          }),
        })
      );
    });
    expect(onFeedbackSubmitted).toHaveBeenCalledTimes(1);
  });

  it('toggles template publish state and deletes from the templates list', async () => {
    fetchMock
      .mockResolvedValueOnce({ json: async () => ({ success: true }) })
      .mockResolvedValueOnce({ json: async () => ({ success: true }) });

    render(
      <TemplatesList
        templates={[
          {
            id: 'template-1',
            name: 'AI Basics',
            description: null,
            estimated_duration_minutes: 45,
            is_published: false,
            created_at: '2026-01-01T00:00:00Z',
            module_count: 2,
          },
        ]}
      />
    );

    fireEvent.click(screen.getByTitle('More actions'));
    fireEvent.click(screen.getByRole('button', { name: /publish/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/templates/template-1',
        expect.objectContaining({ method: 'PATCH' })
      );
    });
    expect(screen.getByText('Published')).toBeInTheDocument();

    fireEvent.click(screen.getByTitle('More actions'));
    fireEvent.click(screen.getByRole('button', { name: /delete/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete Template' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenLastCalledWith(
        '/api/admin/templates/template-1',
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });

  it('copies, edits, and deletes sessions from the sessions table', async () => {
    fetchMock
      .mockResolvedValueOnce({ json: async () => ({ success: true }) })
      .mockResolvedValueOnce({ json: async () => ({ success: true }) });

    render(
      <SessionsTable
        clients={[]}
        sessions={[
          {
            id: 'session-1',
            join_code: 'ABCD',
            status: 'published',
            created_at: '2026-01-01T00:00:00Z',
            client_name: 'Acme',
            department: 'Sales',
            location: 'Dubai',
            poc_name: 'Ava',
            poc_email: 'ava@example.com',
            event_type: 'keynote',
            event_date: '2026-01-02T00:00:00Z',
            template_id: 'template-1',
            template_name: 'AI Basics',
          },
        ]}
      />
    );

    fireEvent.click(screen.getByTitle('Copy join code'));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('ABCD');

    fireEvent.click(screen.getByTitle('More actions'));
    fireEvent.click(screen.getByRole('button', { name: /edit details/i }));
    fireEvent.change(screen.getByLabelText('Department'), { target: { value: 'Marketing' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/sessions/session-1',
        expect.objectContaining({ method: 'PATCH' })
      );
    });

    fireEvent.click(screen.getByTitle('More actions'));
    fireEvent.click(screen.getByRole('button', { name: /delete/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete Session' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenLastCalledWith(
        '/api/admin/sessions/session-1',
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });

  it('approves team access requests and adds the approved user to members', async () => {
    fetchMock.mockResolvedValueOnce({
      json: async () => ({ success: true }),
    });

    render(
      <TeamManager
        currentUserId="owner-user"
        initialMembers={[]}
        unlinkedUsers={[]}
        initialRequests={[
          {
            id: 'request-1',
            user_id: 'user-1',
            display_name: 'Noor',
            email: 'noor@example.com',
            requested_role: 'facilitator',
            status: 'pending',
            created_at: '2026-01-01T00:00:00Z',
          },
        ]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /approve/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/team',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ request_id: 'request-1', role: 'facilitator' }),
        })
      );
    });
    expect(screen.getByText('Team Members')).toBeInTheDocument();
    expect(screen.getByText('Noor')).toBeInTheDocument();
  });
});
