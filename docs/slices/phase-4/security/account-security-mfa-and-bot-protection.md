# Account security: MFA + bot protection (SEC-3)

**Status:** implemented locally (not pushed). Enables ChainReact to answer the
Intuit/QuickBooks production-security questionnaire honestly:

- **MFA / multi-factor authentication: supported** — TOTP, self-serve, with an
  enforced login challenge.
- **CAPTCHA / bot protection: supported** — Cloudflare Turnstile on the public
  auth surfaces, verified server-side.

This doc is the honest source of truth for what is and is not implemented. Do not
claim more than this on a questionnaire.

## What was built

### MFA (TOTP via Supabase Auth)

Supabase Auth's native TOTP MFA (`supabase.auth.mfa.*`, supabase-js 2.47). **No DB
migration** — factors live in Supabase-managed `auth.mfa_factors`.

- **Enroll / verify / status / disable** — self-serve from Account → Security &
  access (the previous "coming soon" 2FA row is now real).
  - `features/account/TwoFactorPanel.tsx` (UI) → `lib/api/accounts.ts` (typed
    client) → `app/api/account/mfa/*` (routes) → `services/accounts/mfa.ts`
    (rules) → `repositories/auth/mfa.ts` (the only module touching the MFA API).
  - Enable: enroll → scan QR / enter key → confirm with a 6-digit code. A correct
    code marks the factor verified **and** elevates the session to `aal2`.
  - Disable: **current-password step-up** (the same `verifyPasswordReauth` used by
    delete/transfer/password-change) on top of the already-`aal2` session, then
    remove every factor.
- **Login challenge enforcement** — `utils/supabase/middleware.ts` reads the
  authoritative factor list from `getUser()` and the session's `aal` claim; a user
  with a **verified** factor whose session is still `aal1` is redirected to
  `/auth/mfa` for any protected surface. Decision logic is the pure, unit-tested
  `services/auth/mfaChallengeGuard.ts`. `/auth/mfa` posts to
  `/api/auth/mfa/verify`, which elevates the session.
  - **Zero lockout risk for non-MFA users:** users with no verified factor are
    never challenged. The `/auth/*` and `/api/auth/mfa` prefixes stay reachable at
    `aal1` so a challenged user can complete or abandon (sign out) MFA.
- **Fail-safe:** wrong/expired codes never elevate and never disclose the reason.

### Bot protection (Cloudflare Turnstile)

App-side token verification (chosen over Supabase-native so enforcement lives in
our code and is testable in-repo, and can extend to non-Supabase surfaces later).

- Widget `features/auth/TurnstileWidget.tsx` on **sign-up, sign-in, and
  forgot-password**; the token is verified in the server actions
  (`app/auth/actions.ts`) via `services/security/turnstile.ts` (Cloudflare
  siteverify) before the Supabase call.
- **Posture — fail-closed when configured:** with `TURNSTILE_SECRET_KEY` set, a
  missing/invalid token is rejected; with it unset, verification is skipped and the
  widget is hidden (so local/dev + existing tests run without keys).
- Google OAuth sign-in is not captcha-gated (it hands off to Google immediately;
  Supabase/Google rate-limit that path).

## Security guarantees

- **No secret leakage / no AI exposure.** MFA setup secret, otpauth URI, QR, and
  challenge codes are never logged and are returned only for a one-time in-memory
  render to the enrolling user. All MFA responses are `cache-control: no-store`.
  The Turnstile token is never logged. `no_leak_scanner` / repo grep should find no
  `console.log` of these.
- **User-scoped, no cross-account leak.** MFA is a per-**user** credential resolved
  from the caller's cookie-bound session; a caller can only see/mutate their own
  factors. It renders identically across the user's personal/team/business
  accounts and never crosses to another user.
- **Step-up for disable.** Turning MFA off requires a fresh password even on an
  `aal2` session.
- **Typed, generic errors.** Wrong code / wrong password surface generic messages;
  the failing factor is never disclosed. Reset-flow no-enumeration is preserved
  (the captcha failure message carries no account signal).

## Recovery posture (honest limitation)

**There are no self-serve recovery/backup codes in this slice.** Supabase TOTP does
not generate them and we did not build a separate table. A user who loses their
authenticator recovers via **support-assisted factor removal** — an operator uses a
service-role admin unenroll after verifying identity. The UI states this plainly
(`mfa-recovery-note`) rather than implying a backup that doesn't exist.

**Follow-up (not done):** self-serve one-time recovery codes (hashed at rest, shown
once at enrollment) + a recovery-verify branch on `/auth/mfa`. Requires a new table
+ migration. Tracked as a future SEC slice.

## Owner setup required before "supported" is true in production

1. **Supabase Auth → MFA:** ensure **TOTP** enrollment is enabled for the project
   (Dashboard → Authentication → Providers/MFA). It is on by default for TOTP on
   current projects; confirm it is not disabled.
2. **Cloudflare Turnstile:** create a Turnstile site, then set **both**
   `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` (see `.env.example`).
   Set them together — a secret without the site key hides the widget while still
   requiring a token (lockout).
3. **Support runbook:** document the support-assisted MFA-removal procedure
   (service-role admin unenroll) for the recovery path above.

## Verification baseline

Newly added unit tests (this batch): Turnstile verify (enabled/disabled/fail),
`mfaChallengeGuard` decisions, MFA service rules, and MFA + login-challenge routes
(auth gate, no-leak, status mapping). Auth-action tests extended for the captcha
gate. See the batch's slice report for the exact `tsc`/`lint`/`test` results — this
doc does not assert a command was run that wasn't.

**Not covered here:** a live end-to-end MFA login against a real Supabase project
(needs a project with a test user + authenticator) and a live Turnstile challenge
(needs the keys). Both are owner-setup-gated and should be run once keys exist.
