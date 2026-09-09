import { type NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function proxy(request: NextRequest) {
  // Update Supabase session
  const response = await updateSession(request);

  // Check if user is authenticated by looking for Supabase session cookies
  const cookieStore = request.cookies;
  const hasAuthCookie = Array.from(cookieStore.getAll()).some(
    cookie => cookie.name.includes('sb-') && cookie.name.includes('auth-token')
  );

  const { pathname } = request.nextUrl;

  // Admin and every facilitator-facing session surface (/presenter, /gallery,
  // /present) require authentication.
  //
  // Matched with startsWith('/session/'), NOT includes('/session'): the matcher
  // below does not exclude /api/sessions/state, which every participant polls
  // every 5s. A substring test would redirect that poll to the login page, and
  // participants would silently lose status and timer updates.
  //
  // This is only a cheap cookie-presence check -- it never validates the token.
  // Each page still verifies the facilitator's org membership server-side.
  const requiresFacilitatorAuth =
    pathname.startsWith('/admin') || pathname.startsWith('/session/');

  if (requiresFacilitatorAuth && !hasAuthCookie) {
    const loginUrl = new URL('/auth/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (public folder)
     * - api routes that handle their own auth (skip middleware auth.getUser() overhead)
     */
    '/((?!_next/static|_next/image|favicon.ico|api/analytics|api/questions|api/submissions|api/feedback|api/sessions/join|api/sessions/verify|api/pdf|api/email|api/webhooks|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
