# Security Decisions (2026-06-01)

## Accepted Risk: Email-Based Rejoin Fallback
- Status: accepted for current release.
- Scope: attendee resume flow in `POST /api/sessions/join` can resume by email when cookie/session token is missing.
- Risk: if an attacker knows a participant email + session ID, they may attempt impersonation.
- Compensating controls now in place:
  - Shared distributed rate limits on join paths (IP, session+IP, session+email keys).
  - Structured warning log when email fallback is used without a matching existing cookie token.
  - Join analytics payload includes `resumeMethod` + `ip` for investigation.

## Required Monitoring
- Alert when `429` responses spike on:
  - `/api/sessions/join`
  - `/api/sessions/verify`
  - `/api/pdf/generate`
  - `/api/email/prompt-pack`
- Alert on repeated email-fallback resumes for the same participant within short windows.
- Alert on repeated webhook failures in `POST /api/email/prompt-pack`.

## Recommended Future Closure
- Replace email-only resume fallback with OTP verification:
  1. User enters email on resume attempt.
  2. Backend issues short-lived OTP challenge.
  3. User proves inbox control by submitting OTP.
  4. Resume only after OTP verification succeeds.

