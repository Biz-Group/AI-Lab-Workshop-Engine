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

  // Protected admin routes require authentication
  if (request.nextUrl.pathname.startsWith('/admin')) {
    // If no auth cookie, redirect to login
    if (!hasAuthCookie) {
      const loginUrl = new URL('/auth/login', request.url);
      loginUrl.searchParams.set('redirect', request.nextUrl.pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // Presenter routes also require authentication
  if (request.nextUrl.pathname.includes('/presenter')) {
    if (!hasAuthCookie) {
      const loginUrl = new URL('/auth/login', request.url);
      loginUrl.searchParams.set('redirect', request.nextUrl.pathname);
      return NextResponse.redirect(loginUrl);
    }
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
