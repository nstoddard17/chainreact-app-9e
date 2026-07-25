# TEAM-INVITATION-EMAIL-1 — Team invitation email delivery (outcome)

> **Superseded in part by
> [`team-invitation-lifecycle-2-outcome.md`](./team-invitation-lifecycle-2-outcome.md)
> (2026-07-25):** invitations no longer expire (the 7-day TTL and all its
> wording are removed), and pending invites gained in-place role change +
> replace-on-email-change management. Delivery/transport/security content
> below remains accurate.

**Status:** implemented, locally verified (unit layer green; live provider send
was blocked on a then-invalid local key — production delivery has since been
verified; the fuller production-verification narrative lives on the local
docs branch and ships separately).
**Scope:** invitation email delivery + acceptance-flow verification. Builds on
4.ACCOUNT-MODEL-15 (invitation backend), 4.TEAM-PAGE-1 (invite UI), 5.ONBOARD-4
(accept page). No migration. Nothing pushed.

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

## Owner setup still required

1. In Resend: verify the `chainreact.app` sending domain (DNS: SPF + DKIM
   records shown in the Resend dashboard under Domains → Add Domain), then
   create a production API key.
2. Set `RESEND_API_KEY` + `TRANSACTIONAL_EMAIL_FROM` in the Vercel Production
   scope. The `RESEND_API_KEY` currently in `.env.local` is **invalid** — a
   live probe on 2026-07-24 returned Resend `validation_error: "API key is
   invalid"` (that probe also confirmed the transport's typed, non-retried
   handling of a permanent 4xx against the real provider).
3. Test-mode delivery without customer addresses: with any valid key, send
   from Resend's sandbox sender `onboarding@resend.dev` to the Resend account
   owner's own address (no verified domain needed). A ready-made script shape
   for this lives in this slice's history: render `teamInvitation` with a FAKE
   token and call `sendViaResend` directly — no invitation row involved.

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
- Live provider delivery: attempted once via the real transport + template to
  the approved smoke address; blocked by the invalid local API key (above). No
  real email has been delivered yet — do not treat delivery as
  production-verified until the owner-setup steps are done.
