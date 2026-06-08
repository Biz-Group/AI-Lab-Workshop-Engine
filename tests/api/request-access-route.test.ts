import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const createServerClientMock = vi.fn();
const createServiceClientMock = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: createServerClientMock,
  createServiceClient: createServiceClientMock,
}));

describe('/api/auth/request-access', () => {
  const originalAllowlist = process.env.ACCESS_REQUEST_ALLOWED_ORG_IDS;

  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    process.env.ACCESS_REQUEST_ALLOWED_ORG_IDS = originalAllowlist;
  });

  it('returns no organizations when allowlist is empty', async () => {
    process.env.ACCESS_REQUEST_ALLOWED_ORG_IDS = '';

    createServerClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null })),
      },
    });

    const facilitatorLookup = {
      select: vi.fn(() => facilitatorLookup),
      eq: vi.fn(() => facilitatorLookup),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    };

    createServiceClientMock.mockResolvedValue({
      from: vi.fn().mockImplementationOnce(() => facilitatorLookup),
    });

    const { GET } = await import('@/app/api/auth/request-access/route');
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.organizations).toEqual([]);
  });

  it('rejects POST when organization is not allowlisted', async () => {
    process.env.ACCESS_REQUEST_ALLOWED_ORG_IDS = 'org-allowed';

    createServerClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null })),
      },
    });

    const facilitatorLookup = {
      select: vi.fn(() => facilitatorLookup),
      eq: vi.fn(() => facilitatorLookup),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    };

    createServiceClientMock.mockResolvedValue({
      from: vi.fn().mockImplementationOnce(() => facilitatorLookup),
    });

    const { POST } = await import('@/app/api/auth/request-access/route');
    const response = await POST(
      new NextRequest('http://localhost/api/auth/request-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organization_id: '11111111-1111-1111-1111-111111111111',
          display_name: 'Alex',
        }),
      })
    );
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.success).toBe(false);
  });
});

