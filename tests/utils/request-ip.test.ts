import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { getTrustedClientIp } from '@/lib/server/request-ip';

describe('getTrustedClientIp', () => {
  it('prefers trusted provider headers over x-forwarded-for', () => {
    const request = new NextRequest('http://localhost/api/test', {
      headers: {
        'x-vercel-ip': '1.2.3.4',
        'x-forwarded-for': '8.8.8.8',
      },
    });

    expect(getTrustedClientIp(request)).toBe('1.2.3.4');
  });

  it('returns unknown when only spoofable headers are present', () => {
    const request = new NextRequest('http://localhost/api/test', {
      headers: {
        'x-forwarded-for': '8.8.8.8',
      },
    });

    expect(getTrustedClientIp(request)).toBe('unknown');
  });
});

