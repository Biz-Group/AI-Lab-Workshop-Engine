import { createClient } from '@/lib/supabase';

/**
 * Facilitator-only pages (the presenter console, the projection wall) are
 * meant to stay open for an entire session -- sometimes hours (a "Full Day"
 * event runs 6-8h). The browser Supabase client's access-token refresh runs
 * on its own internal background timer, which browsers throttle on an
 * unfocused/backgrounded tab -- exactly what these views often are (the wall
 * projected on a second display while the facilitator works from their own
 * screen, or either tab just sitting idle while participants work through a
 * step). When the token goes stale, every admin PATCH/DELETE from that tab
 * 401s with no way to recover short of a disruptive full reload/re-login
 * mid-presentation.
 *
 * Refresh once and retry before giving up, so a facilitator action taken
 * hours into a session behaves the same as one taken in the first minute.
 */
export async function authFetch(input: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, init);
  if (res.status !== 401) return res;

  const { error } = await createClient().auth.refreshSession();
  if (error) return res;

  return fetch(input, init);
}
