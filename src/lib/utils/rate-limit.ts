import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

/**
 * Shared rate limiter backed by Postgres RPC.
 * Works across multiple serverless instances.
 */

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * Check if a request is allowed under the rate limit.
 * @param key Unique identifier (e.g., participantId + endpoint)
 * @param maxRequests Maximum requests allowed in the window
 * @param windowMs Time window in milliseconds (default: 60s)
 */
export async function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number = 60_000
): Promise<RateLimitResult> {
  const fallback = {
    allowed: true,
    remaining: maxRequests,
    resetAt: Date.now() + windowMs,
  };

  try {
    const supabase = await createServiceClient();
    const { data, error } = await supabase.rpc('consume_rate_limit', {
      p_key: key,
      p_max: maxRequests,
      p_window_seconds: Math.max(1, Math.floor(windowMs / 1000)),
    });

    if (error || !Array.isArray(data) || data.length === 0) {
      console.error('Rate limit RPC error:', error);
      return fallback;
    }

    const row = data[0] as {
      allowed: boolean;
      remaining: number;
      reset_at: string;
    };

    return {
      allowed: row.allowed,
      remaining: Number.isFinite(row.remaining) ? row.remaining : 0,
      resetAt: new Date(row.reset_at).getTime(),
    };
  } catch (error) {
    console.error('Rate limit check failed:', error);
    return fallback;
  }
}

/**
 * Create a rate-limited NextResponse for 429 Too Many Requests.
 */
export function rateLimitResponse(resetAt: number) {
  const retryAfter = Math.ceil((resetAt - Date.now()) / 1000);
  return NextResponse.json(
    { success: false, error: 'Too many requests. Please try again later.' },
    {
      status: 429,
      headers: {
        'Retry-After': String(Math.max(1, retryAfter)),
      },
    }
  );
}
