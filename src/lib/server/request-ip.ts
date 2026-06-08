import { NextRequest } from 'next/server';

/**
 * Extract a deployment-provider IP header we trust for abuse controls.
 * We intentionally do not trust raw x-forwarded-for values from clients.
 */
export function getTrustedClientIp(request: NextRequest): string {
  const vercelIp = request.headers.get('x-vercel-ip');
  if (vercelIp) return vercelIp;

  const cloudflareIp = request.headers.get('cf-connecting-ip');
  if (cloudflareIp) return cloudflareIp;

  const flyIp = request.headers.get('fly-client-ip');
  if (flyIp) return flyIp;

  return 'unknown';
}
