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
  - Disable: follows **Supabase's AAL2 model — no password**. `mfa.unenroll`
    requires an AAL2 session; the middleware already forces AAL2 to reach the
    account page, so disable is normally a single confirm. If the session is AAL1
    (rare), the panel asks for the current authenticator code and steps up to AAL2
    via `challengeAndVerify` before unenrolling. This works for **email/password,
    Google OAuth, and future SSO** — the only credential is the TOTP code (or an
    already-AAL2 session), never the account password (which OAuth/SSO users don't
    have). The AAL2 requirement is enforced, never bypassed.
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
- **Password recovery + MFA (AAL2 step-up):** the emailed recovery link only
  establishes an AAL1 session, and Supabase refuses `updateUser({ password })` on
  AAL1 when the user has enrolled MFA ("AAL2 session is required…"). So the
  reset-password flow (`app/auth/reset-password/page.tsx` + `updatePassword` in
  `app/auth/actions.ts`) detects a verified TOTP factor on an AAL1 session, asks
  for the current authenticator code, elevates the SAME client's session to AAL2
  via `mfa.challengeAndVerify`, and only then updates the password. The AAL2
  requirement is **enforced, never bypassed** — a missing/invalid code stops the
  update and re-prompts. The elevation runs on the same client instance so the
  update uses the elevated token. The code is never logged.

### Bot protection (Cloudflare Turnstile — Supabase-native verification)

**Verification is Supabase-native.** The widget produces a single-use token; the
token is forwarded to the Supabase Auth SDK via the supported `captchaToken`
option, and **Supabase verifies it server-side** against the Turnstile secret
configured in the Supabase dashboard (Authentication → Bot & Abuse Protection).
The app does **not** call Cloudflare siteverify itself — a Turnstile token is
single-use, so redeeming it app-side consumes it and Supabase then rejects the
request with *"captcha protection: request disallowed (no captcha_token found)"*.
Verification lives in exactly one place: Supabase.

> Note: an earlier revision of this slice did app-side siteverify; that was
> replaced once Supabase-native captcha protection was enabled, because the two
> approaches both try to redeem the same single-use token. The app-side
> `verifyTurnstileToken` was removed.

- Widget `features/auth/TurnstileWidget.tsx` on **sign-up, sign-in, and
  forgot-password**. It surfaces the token to the form (`onVerify`), disables the
  submit button until a token exists, clears it on expiry/error, and **mints a
  fresh token after a failed submit** (single-use). The token travels in the
  `cf-turnstile-response` field; the server actions (`app/auth/actions.ts`) read it
  (`readCaptchaToken`) and pass it to `signUp` / `signInWithPassword` /
  `resetPasswordForEmail` as `options.captchaToken`. `services/security/turnstile.ts`
  now holds only the field name + widget-configured helper.
- **Every captcha-gated auth flow is covered.** The Supabase SDK exposes
  `captchaToken` on exactly the surfaces GoTrue gates: `signUp`,
  `signInWithPassword`, and `resetPasswordForEmail` — all wired. `signInWithOAuth`
  (Google) has **no** `captchaToken` option and is not captcha-gated (the
  `/authorize` redirect isn't a protected endpoint), so the Google button is
  correctly left untouched. The MFA methods (`mfa.enroll/challenge/verify`) also
  have no `captchaToken` and are not gated, so account-page MFA enrollment is
  unaffected.
- **Config:** the app only needs `NEXT_PUBLIC_TURNSTILE_SITE_KEY`; the secret lives
  in the Supabase dashboard. When the site key is unset the widget is hidden and no
  token is sent (correct for dev, where Supabase captcha is off).

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
2. **Cloudflare Turnstile:** create a Turnstile site. Set
   `NEXT_PUBLIC_TURNSTILE_SITE_KEY` in the app env, AND enable Turnstile with the
   matching **secret** in the Supabase dashboard (Authentication → Bot & Abuse
   Protection). Both must be on together: the app-side widget needs the site key,
   and Supabase needs the secret to verify the token. The app never reads the
   secret (see `.env.example`).
3. **Support runbook:** document the support-assisted MFA-removal procedure
   (service-role admin unenroll) for the recovery path above.

## Verification baseline

Unit tests: Turnstile token wiring (`readCaptchaToken` / widget-configured helper),
`mfaChallengeGuard` decisions, MFA service rules, and MFA + login-challenge routes
(auth gate, no-leak, status mapping). Auth-action tests assert the `captchaToken` is
forwarded to the Supabase SDK on sign-up / sign-in / password reset. See the batch's
slice report for the exact `tsc`/`lint`/`test` results — this doc does not assert a
command was run that wasn't.

**Not covered here:** a live end-to-end MFA login against a real Supabase project
(needs a project with a test user + authenticator) and a live Turnstile challenge
(needs the keys). Both are owner-setup-gated and should be run once keys exist.
