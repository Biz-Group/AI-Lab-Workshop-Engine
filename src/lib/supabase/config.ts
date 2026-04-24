function readRequiredEnv(label: string, ...values: Array<string | undefined>) {
  for (const value of values) {
    if (value && value.trim().length > 0) {
      return value;
    }
  }

  throw new Error(`Missing required environment variable. Tried: ${label}`);
}

function isServerRuntime() {
  return typeof window === 'undefined';
}

export function getSupabaseUrl() {
  if (isServerRuntime()) {
    return readRequiredEnv(
      'NEXT_PUBLIC_SUPABASE_URL, SUPABASE_URL',
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_URL
    );
  }

  return readRequiredEnv(
    'NEXT_PUBLIC_SUPABASE_URL',
    process.env.NEXT_PUBLIC_SUPABASE_URL
  );
}

export function getSupabasePublishableKey() {
  if (isServerRuntime()) {
    return readRequiredEnv(
      'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_PUBLISHABLE_KEY, SUPABASE_ANON_KEY',
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      process.env.SUPABASE_PUBLISHABLE_KEY,
      process.env.SUPABASE_ANON_KEY
    );
  }

  return readRequiredEnv(
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY, NEXT_PUBLIC_SUPABASE_ANON_KEY',
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

export function getSupabaseServiceRoleKey() {
  return readRequiredEnv(
    'SUPABASE_SERVICE_ROLE_KEY',
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export function getSubmissionImagesPublicBaseUrl() {
  return `${getSupabaseUrl()}/storage/v1/object/public/submission-images`;
}
