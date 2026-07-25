# TEAM-INVITATION-LIFECYCLE-2 — Non-expiring invitations + pending-invite management (outcome)

**Status:** implemented and locally verified (2026-07-25). Local commit only —
nothing pushed. Supersedes the expiry behavior described in
[`team-invitation-email-1-outcome.md`](./team-invitation-email-1-outcome.md).

## Locked product rules shipped

1. **Pending invitations never expire.** The seven-day auto-expiry is removed
   everywhere: schema (migration `20260804000000` — `expires_at` DROP NOT
   NULL; pending rows NULLed), service (no TTL computed, no accept-time expiry
   check, no expiry marking), email template, and all UI wording. A pending
   invite stays active until accepted, canceled, or replaced by an email
   change. Historical `expired`/`revoked`/`accepted` rows stay historical —
   the accept path still refuses any non-pending status, so nothing is
   reactivated.
2. **Role change is IN PLACE** (`changeInvitationRole`, PATCH
   `/api/accounts/[id]/invitations/[invitationId]` with `{ role }`): same
   invitation id, email, token hash, and link; **no new email**. Acceptance
   applies the role stored on the invitation at accept time.
3. **Email change REPLACES the invitation ATOMICALLY** (LIFECYCLE-2A:
   `replaceInvitationEmail` → the `replace_account_invitation` RPC, migration
   `20260805000000`): the revoke of the old invite and the insert of the new
   one (fresh token, **same role** — preserved server-side, new address)
   happen in ONE database transaction. Either both commit or neither does —
   there is never a committed state where the old invite is revoked with no
   replacement, and the old token stays active until the replacement commits.
   A duplicate-pending clash on the new address rolls everything back (proven
   against the real DB in the dev-DB suite). The new invitation email is sent
   only after the transaction commits; delivery failure leaves the new
   invitation valid (persist-first). A same-email "change" is refused
   (`INVITATION_SAME_EMAIL`) so a working link is never killed as a no-op.
   The RPC is service-role-only EXECUTE (also test-asserted).
4. **Cancel revokes immediately** (existing DELETE route, unchanged; UI label
   is now "Cancel").
5. **Unchanged security invariants:** POST-only acceptance, session-email
   match, single-use tokens, member limits + frozen-account checks at both
   create and accept, GET/scanner/preview never consumes, hash-only token
   storage, owner/admin-only management, account-scoped invitation ids.

## UI

`PendingInvites` rows now carry: a role selector (in-place change, confirmed
with "the existing invitation link is still active — no new email was sent"),
a Change email flow (warns FIRST that the old link will stop working, then
shows the new copyable link + delivery status), and Cancel. Rows say "active
until accepted or canceled" — no expiry anywhere. `InviteBar` panels and the
transactional email likewise state the invitation stays active until accepted
or canceled. Outcomes are announced via `aria-live`.

## Migration

`20260804000000_account_invitations_non_expiring.sql` — applied to the V2 DB
via `npm run db:push` on 2026-07-25 with local/remote history in sync
beforehand (verified via `supabase migration list`), so ONLY this migration
was applied — no concurrent-work migrations were dragged in. Post-apply
validation against the real DB: all pending rows have `expires_at IS NULL`;
historical rows keep their recorded expiry. Forward-only; `expires_at` is kept
(nullable) for audit.

## Disposable test account deleted

`chainreactapp@gmail.com` (Marcus-authorized): read-only audit first —
exactly 1 auth user matched; personal account only (no team/org ownership);
plan `free`, no Stripe customer/subscription; 0 workflows/runs/folders/
integrations/API keys/invitations/notifications; only membership = owner of
its own personal account; distinct from the production smoke user. All checks
passed → deleted via the canonical purge order (RESTRICT children → account
row cascade → auth user). Post-verified: `find_user_id_by_email` → null, 0
owned accounts — the address can complete a completely fresh signup.

## Verification actually run (2026-07-25)

- Targeted Jest only (NO full suite, per instruction): 9 suites / 115 tests
  green — invitation service (non-expiry incl. legacy past `expires_at`
  accepting, historical `expired` still refused, accept-time role, role-change
  in-place/no-email, email-replace revoke+reissue/same-role/failure-tolerant/
  same-email guard), member-limit suite, email template (no expiry wording
  asserted), invitations + accept routes (PATCH mappings incl. 400 both/none,
  404/400/409/429), InviteBar (no expiry wording), new PendingInvites controls
  suite, accept page (GET-never-consumes pinned).
- `npx tsc --noEmit` clean; eslint clean on changed files;
  `npm run lint:migrations` OK.
- Playwright new-user journey spec UPDATED to the lifecycle-2 scenario
  (invite `chainreactapp@gmail.com` as member → no revoke → new account via
  the emailed link → owner changes role to admin pre-accept → ORIGINAL link
  accepts → joins as admin) but **not executed** — the local Docker engine is
  returning 500s, so the local Supabase e2e stack is unavailable. Run with
  `npx playwright test tests/e2e/team-invitation-new-user-journey.spec.ts --workers=1`
  once Docker is healthy.

## Follow-ups

- No "resend invitation" control exists yet. If added, a same-address resend
  must revoke + reissue a fresh token (hash-only storage is unchanged — the
  old raw token is unrecoverable by design); the new email-change flow already
  implements exactly that pattern for a different address.
- The dev-DB integration test (`tests/integration/migrations/
  account-invitations.dev.test.ts`) now inserts without `expires_at`,
  doubling as a probe that the migration applied; it runs only with
  `ALLOW_DB_INTEGRATION_TESTS`.
