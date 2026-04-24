// Keep session-token tests deterministic in all environments.
process.env.SESSION_TOKEN_SECRET ??= 'test-session-token-secret-0123456789';
