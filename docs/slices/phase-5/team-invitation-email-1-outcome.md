# TEAM-INVITATION-EMAIL-1 — Team invitation email delivery (outcome)

> **Superseded in part by
> [`team-invitation-lifecycle-2-outcome.md`](./team-invitation-lifecycle-2-outcome.md)
> (2026-07-25):** invitations no longer expire (the 7-day TTL and all its
> wording are removed), and pending invites gained in-place role change +
> replace-on-email-change management. Delivery/transport/security content
> below remains accurate.

**Status:** LIVE IN PRODUCTION and delivery-verified. Pushed to `v2-main` and
deployed 2026-07-25 with Marcus's explicit approval; a real production
invitation email was delivered the same day (see
[Production verification](#production-verification-2026-07-25)).
**Scope:** invitation email delivery + acceptance-flow verification. Builds on
4.ACCOUNT-MODEL-15 (invitation backend), 4.TEAM-PAGE-1 (invite UI), 5.ONBOARD-4
(accept page). No migration.

## What shipped

1. **System-email foundation** — `services/email/`:
   - `transport.ts` — message + typed `EmailDeliveryResult`
     (`sent | failed | not_configured`; `failed` carries a FIXED reason code,
     never provider text).
   - `transports/resend.ts` — Resend HTTP transport. 10s request timeout, ONE
     bounded retry for transient failures only (network error / timeout /
     provider 5xx); permanent 4xx is never retried. Never throws. The API key,
     recipient, and body never appear in results, errors, or logs.
   - `sendTransactionalEmail.ts` — the seam feature services call. Structured
     `console.warn` on failure with SAFE metadata only (template + opaque ids).
   - `templates/teamInvitation.ts` — branded HTML + plain-text invitation:
     team name, inviter identity (display name → session email → generic),
     plain-language role, Accept button + visible URL fallback, 7-day expiry
     note, "sign in or create an account with this address" note, and an
     ignore-if-unexpected security note. All dynamic values HTML-escaped;
     subject control-char-stripped (no header injection). No member lists,
     workflow, or billing data.
   - `appOrigin.ts` — emailed links are built from `NEXT_PUBLIC_APP_URL`
     (the same canonical-origin contract as billing redirects), never
     `request.url` / Host headers / client input.
   - This is ChainReact's OWN transactional channel — it never uses a
     user-connected Gmail/Outlook integration and never uses Supabase Auth
     invite APIs (ChainReact owns its invitation lifecycle).

2. **Invitation creation now delivers** (`services/accounts/invitations.ts`,
   route `app/api/accounts/[id]/invitations`):
   - Persist first, email second. A provider failure never deletes/revokes the
     invitation and never turns the response into a 5xx (which would push the
     UI into a retry that trips the duplicate-pending rule).
   - Response contract adds `emailDelivery: { status }` alongside the existing
     `invitation` / `acceptToken` / `acceptPath` (backward compatible).
   - Works whether or not the invitee has an account; an existing user still
     ALSO gets the in-app notification.
   - The route resolves the inviter's display identity from the verified
     session + their own RLS-gated profile row — never from request input.

3. **Durable send throttle** (`rate_limited` → HTTP 429
   `INVITE_RATE_LIMITED`): counts `account_invitations` rows created in the
   rolling 60-minute window — ≥10 per inviter or ≥20 per account refuses
   BEFORE any row/email exists. The invitation rows themselves are the counter
   (DB-backed, cross-instance safe; no in-memory limiter). This closes the
   long-standing pre-launch rate-limit TODO for the invite surface. The
   duplicate-pending unique index remains the per-address backstop.

4. **Invite UI** (`features/team/InviteBar.tsx`): email is now the primary
   channel ("Send invite"). Distinct outcomes, all retaining the one-time copy
   link, with an `aria-live` announcement:
   - `sent` → "Invitation emailed to …" + role/expiry + backup link.
   - `failed` → warning: invitation exists, email didn't go out, share the
     link manually, and DON'T resubmit (duplicate-pending would refuse).
   - `not_configured` → neutral local/dev wording, same manual-link path.

5. **Acceptance flow verified end-to-end** (existing implementation audited —
   unchanged): accept stays an explicit POST (GETs/scanners/previews never
   consume the single-use token — structurally pinned by test), the accept
   page reveals nothing before the authenticated email-match gate, and
   `returnTo` survives accept → sign-in → sign-up → OTP verify → back to the
   exact invitation URL, sanitized by `safeReturnPath` at every hop (no open
   redirect). New tests pin the sign-in ⇄ sign-up carry.

## Environment contract

| Var | Meaning |
| --- | --- |
| `RESEND_API_KEY` | Resend secret key (server-only). |
| `TRANSACTIONAL_EMAIL_FROM` | Verified sender, e.g. `ChainReact <invites@chainreact.app>`. |
| `NEXT_PUBLIC_APP_URL` | Existing canonical origin — used for emailed links. |

BOTH email vars must be set or the transport reports `not_configured`; the
invitation + copy link still work (this is the intended local-dev behavior).

## Owner setup — COMPLETE (2026-07-25)

Marcus configured `RESEND_API_KEY` + `TRANSACTIONAL_EMAIL_FROM` in the Vercel
Production scope on 2026-07-25 (values never inspected or logged by tooling).
Historical note: the `RESEND_API_KEY` that sat in `.env.local` on 2026-07-24
was invalid — a live probe returned Resend `validation_error: "API key is
invalid"` (that probe also confirmed the transport's typed, non-retried
handling of a permanent 4xx against the real provider). Local dev remains
`not_configured` unless both vars are set locally, which is the intended
copy-link fallback mode.

Test-mode delivery without customer addresses (repeatable): sign in as the
production smoke account, create a disposable smoke-prefixed team, invite an
owner-controlled address, read `emailDelivery.status` from the create
response, then REVOKE the invitation (the emailed link then renders the
friendly revoked page). Never log the `acceptToken`/`acceptPath`.

## Failure semantics (what the inviter sees)

Email down ≠ invite broken: the invite is created, the UI says the email
could not be sent, and leads with the copyable link plus explicit don't-resubmit
guidance. A structured `email.transactional.delivery_failed` warn line (opaque
ids only) is the operator signal. Raw tokens, full accept URLs, addresses,
subjects, bodies, and the API key never appear in logs, errors, or responses.

## Security rationale (durable)

- **POST-only acceptance:** invite tokens are single-use; mail scanners, link
  previewers, and prefetchers issue GETs. Accepting on GET would let a scanner
  burn the invite before the human clicks — so render is side-effect-free and
  only the explicit POST mutates.
- **Hash-only storage / no resend of the old token:** only the SHA-256 hash is
  stored; the raw token exists once, in the create response. A future "Resend
  invitation" must therefore revoke + reissue, never recover the old token.
  (No resend control exists in the UI today; none was added.)

## Verification actually run (2026-07-24)

- `npx tsc --noEmit` — clean.
- `npm run lint` — no errors (pre-existing warnings only) ·
  `npm run lint:structure` — OK · `npm run lint:migrations` — OK (no migration).
- Targeted Jest (12 suites / 130 tests, all green): email template + transport
  (mocked provider HTTP only), invitation service (delivery semantics, throttle,
  no-token-in-logs), invitation + accept routes, accept page (GET-never-consumes
  pinned), AcceptInvitationCard, client wrappers, InviteBar delivery states,
  new `invitationReturnTo` sign-in ⇄ sign-up carry suite, `safeReturnPath`.
  Full `npm test` was NOT run this batch (owner instruction).
- New Playwright spec `tests/e2e/team-invitation-new-user-journey.spec.ts`
  (brand-new-user journey: signed-out link → returnTo round trip → scanner-GET
  safety → explicit accept → membership + activation) is **written but was not
  executed**: the local Docker/Supabase e2e stack was down (web server
  fail-closed). Run with
  `npx playwright test tests/e2e/team-invitation-new-user-journey.spec.ts --workers=1`
  once `supabase start` is healthy.
- Live provider delivery (2026-07-24 attempt): blocked by the then-invalid
  local API key — superseded by the production verification below.

## Production verification (2026-07-25)

Pushed `e2347bd29..7cf122d16` to `origin/v2-main` (12-commit stack including
this slice; Marcus explicitly approved pushing everything). Pre-push: `npx tsc
--noEmit` clean on HEAD; CD-2's `analytics_provider_rate_limits` table
confirmed present on the live DB (read-only probe) before deploying its code.

- **Deploy:** confirmed live via the stack's new public `/help` route going
  404 → 200 on chainreact.app (~4 min after push).
- **Public smoke:** `playwright.smoke.config.ts --project public` — 14/14
  passed against the deployed app.
- **Authenticated smoke sign-in caveat:** the form-based `auth-setup` project
  currently FAILS against production — Cloudflare Turnstile does not issue a
  token to the automated browser (headless or headed), so the submit button
  never enables. Worked around (no app change) with the same technique as
  `tests/e2e/helpers/supabaseAdmin.ts`: service-role `generateLink(recovery)`
  driven through the app's own `/auth/callback`.
- **Real production delivery: PROVEN.** As the smoke account: created a
  disposable "Smoke Test Invite Team" (201), invited an owner-controlled
  address (201) — **`emailDelivery.status: "sent"`** (production Resend
  accepted the message; the email arrived from the configured sender). The
  invitation was then revoked (200) so the emailed link renders the friendly
  revoked page, and the smoke account's personal account was re-activated
  (200). Residue: the smoke-prefixed team row remains on the smoke account;
  the invited address received one real email + one in-app notification.
- The new-user Playwright journey spec remains **not executed** (local
  Docker/Supabase e2e stack down); unchanged from the local-batch report.
