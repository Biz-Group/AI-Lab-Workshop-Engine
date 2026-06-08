import { beforeEach, describe, expect, it, vi } from 'vitest';

const createServiceClientMock = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: createServiceClientMock,
}));

describe('checkRateLimit', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('uses shared rpc result when available', async () => {
    const rpcMock = vi.fn(async () => ({
      data: [{ allowed: false, remaining: 0, reset_at: '2030-01-01T00:00:00.000Z' }],
      error: null,
    }));

    createServiceClientMock.mockResolvedValue({ rpc: rpcMock });

    const { checkRateLimit } = await import('@/lib/utils/rate-limit');
    const result = await checkRateLimit('join:ip:1.2.3.4', 10, 60_000);

    expect(rpcMock).toHaveBeenCalledWith('consume_rate_limit', {
      p_key: 'join:ip:1.2.3.4',
      p_max: 10,
      p_window_seconds: 60,
    });
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.resetAt).toBe(new Date('2030-01-01T00:00:00.000Z').getTime());
  });

  it('fails open when rpc errors', async () => {
    createServiceClientMock.mockResolvedValue({
      rpc: vi.fn(async () => ({ data: null, error: { message: 'db down' } })),
    });

    const { checkRateLimit } = await import('@/lib/utils/rate-limit');
    const result = await checkRateLimit('key-1', 3, 10_000);

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(3);
  });
});

