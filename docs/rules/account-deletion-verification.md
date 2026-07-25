# Rule: Account-Deletion Verification (Universal Email Code)

**Slice:** ACCOUNT-DELETION-UNIVERSAL-VERIFICATION-1
**Status:** implemented, local-only (not pushed / not deployed at time of writing)

This is the contract for **how a user proves they may delete their ChainReact
account**. It replaces the password re-auth that used to guard
`POST /api/account/delete`.

It governs the **authorization** step only. The account-deletion **lifecycle** —
freeze, grace window, billing wind-down, purge ordering, ledger anonymization — is
unchanged and documented in
[`docs/slices/phase-4/account-deletion-flow-plan.md`](../slices/phase-4/account-deletion-flow-plan.md)
and [`account-deletion-flow-closeout.md`](../slices/phase-4/account-model/account-deletion-flow-closeout.md).

---

## 1. Account deletion never assumes the user has a password

**The rule:** no deletion surface may require a ChainReact password, a
provider-specific reauthentication, a provider-specific button, or any credential
that only some identities possess.

**Why:** V2 signup is no longer email + password only. A user who created their
account with Google, with an email OTP, or (later) with SSO may have **no
ChainReact password at all**. The old password step-up therefore made the single
irreversible action in the product *unreachable* for those users — the account
could be created but never deleted.

**Consequence:** `services/accounts/accountDeletionReauth.ts` (password re-auth) is
**not** part of the deletion path. It survives only for password change and
Team/Business ownership transfer, where the caller has a password by construction.
Do not reintroduce it here.

## 2. Every auth provider uses the same verified-email code flow

One flow, no branches:

1. Open **Delete account** → the consequences are stated up front.
2. **Send verification code** → a six-digit code goes to the **verified email on
   the caller's auth identity**, resolved server-side.
3. The UI shows only a **masked** destination (`c••••••••@gmail.com`).
4. Enter the code → verified.
5. Type the exact word **`DELETE`** → confirm.
6. The existing deletion lifecycle runs.

`features/account/AccountDeletionVerification.tsx` takes **no provider input** and
contains no provider conditional. That is deliberate: there is nothing that could
behave differently per identity. Password, Google-only, email-OTP, and
multi-identity accounts all render the same component and hit the same routes.

**The destination is never client-supplied.** The send/verify request bodies are
`.strict()` and carry no address — a client that sends one gets a 400. The server
reads the address from the verified session (`user.email` + `email_confirmed_at`).

**No verified email ⇒ fail closed.** `409 NO_VERIFIED_EMAIL` with support guidance;
no code is minted and no email is attempted.

## 3. The challenge is purpose-bound, session-bound, short-lived, attempt-limited, single-use

Stored in `public.sensitive_action_challenges`
(`supabase/migrations/20260806000000_sensitive_action_challenges.sql`).

| Property | Value | Enforced by |
|---|---|---|
| Purpose | `delete_account` only | DB `CHECK` + re-checked on verify/consume |
| Bound to | user id · auth `session_id` · verified email | keyed digests, compared constant-time |
| Code | 6 digits, `crypto.randomInt` (rejection-sampled, unbiased) | `core/security/sensitiveActionChallenge.ts` |
| Lifetime | 10 minutes | `expires_at` |
| Attempts | 5, then permanently locked | `attempt_count` / `max_attempts` |
| Resend | 60 s minimum between sends | `last_sent_at` |
| Send cap | 10 per user per rolling 24 h, **durable** | `countSendsSince` (DB, not memory) |
| Post-verification window | 5 minutes to spend the authorization | `verification_expires_at` |
| Reuse | none — atomic compare-and-set on `consumed_at` | conditional `UPDATE … RETURNING` |

**Storage.** The plaintext code is **never** persisted, returned, or logged. What is
stored is `HMAC-SHA256(server pepper, "<purpose>:<user>:<challenge id>:<code>")`.

A six-digit code carries ~20 bits of entropy, so a **plain unsalted SHA-256 would be
reversible in microseconds from a database leak** — which is why the API-key
convention (bare SHA-256 of a ≥256-bit secret, `core/apiKeys/keys.ts`) is *not*
reused here. The server-only pepper, which never touches the database, is what makes
the digest safe to store; binding purpose/user/challenge into the MAC means a stolen
row is worthless anywhere else.

The session id and the email are likewise stored only as **keyed digests**, so a
database dump yields neither a live session identifier nor a user's address.

**Requesting a new code invalidates every previous open code** for that
(user, purpose) before the new one is written.

**An undeliverable email creates no authorization.** If the transactional-email seam
does not report `sent`, the just-written challenge is immediately invalidated and the
route answers `502 EMAIL_UNAVAILABLE` — there is never a live code that nobody
received.

**The email changes ⇒ the challenge dies.** The email digest is re-derived from the
*current* verified address at verify and consume time; a mismatch refuses.

### Required environment variable

`SENSITIVE_ACTION_CHALLENGE_KEY` — server-only, 32 bytes base64.

- **Fails closed** when missing: the deletion challenge routes answer
  `503 VERIFICATION_UNAVAILABLE` rather than storing a brute-forceable digest.
  **Self-serve account deletion does not work until it is set.**
- Never logged, never returned, never in a client bundle.
- Rotating it invalidates outstanding codes (users request a new one). Documented in
  `.env.example`.

## 4. MFA assurance is preserved *in addition to* the code

The email code is layered **on top of** the existing destructive-action contract, not
instead of it. When the user has a verified TOTP factor and the session is still
`aal1`, every deletion route answers `403 MFA_REQUIRED` before doing anything. The
middleware already diverts MFA users to the challenge page for the settings UI; the
routes repeat the check so a direct API call cannot skip it.

If no `session_id` claim can be read, the routes answer `401 SESSION_UNAVAILABLE`
rather than issue an unbound challenge.

## 5. Verification authorizes the existing lifecycle — it never bypasses it

A verified challenge is an **authorization to ask**, not a deletion. The final
request still runs the canonical `requestAccountDeletion`, so every existing
protection stands, re-evaluated at deletion time:

- sole-owner guard (owning a Team/Business still blocks personal deletion);
- billing wind-down + honest partial-failure reporting;
- the freeze-first, 30-day grace window — **the code authorizes scheduling deletion,
  it does not force an immediate purge**;
- purge ordering, ledger anonymization, and the renewable-subscription fail-closed
  guard in the purge cron.

**Ordering: consume, then transition.** The authorization is spent *before* the
lifecycle call. A replay therefore finds nothing to spend, and the account can never
be marked "scheduled" while the challenge still looks unused. The cost — a failed
deletion burns the code — is the correct trade: a burned code is an inconvenience, a
replayable one is a vulnerability.

**Verification alone never deletes.** The typed `DELETE` is still required, exact and
case-sensitive.

### Billing retry is a separate route

`POST /api/account/delete/retry-billing` re-runs only the idempotent Stripe
cancellation on an **already-frozen** account, and refuses (`409
NOT_PENDING_DELETION`) otherwise. It needs no code and no password because there is
no destructive transition left to authorize — demanding a fresh emailed code to
recover from *our* Stripe failure would be friction with no security value.

## 6. Team memberships are removed at purge; other people's teams are not

Unchanged contract, re-proved in this slice:

- a deleted user who was only a **member** of someone else's team loses that
  membership (`account_memberships.user_id → auth.users ON DELETE CASCADE`), which
  frees their seat;
- the **team survives**, still owned by the same person, with the owner's own
  membership intact;
- an **accepted invitation remains as audit history** with `accepted_by_user_id` set
  to `NULL` (`ON DELETE SET NULL`);
- a user who is the **sole required owner** of a team/organization stays blocked
  until ownership is transferred or the account is deleted.

## 7. Routes

| Route | Method | Purpose |
|---|---|---|
| `/api/account/delete/verification-code` | POST | send / resend the code |
| `/api/account/delete/verification-code/verify` | POST | check the code |
| `/api/account/delete` | POST | consume the authorization + schedule deletion |
| `/api/account/delete/retry-billing` | POST | retry the subscription cancellation |
| `/api/account/delete/cancel` | POST | cancel a pending deletion (unchanged) |

**POST only.** None of these modules exports a `GET`, so no prefetch, link, crawler,
or address-bar visit can send, verify, or consume a code. The code never appears in a
URL, a query parameter, browser storage, analytics, error metadata, or a log line.

Errors are typed and **non-enumerating**: a missing challenge, an unverified one, one
spent already, and one bound to another session all return the single code
`VERIFICATION_REQUIRED`. No raw provider error ever reaches the client.

## 8. The email

`services/email/templates/accountDeletionVerification.ts`, sent through the existing
`sendTransactionalEmail` seam (Resend) — there is **no second email system**.

It carries the code, a clear statement that someone requested **deletion**, the
expiry, a do-not-share warning, and what to do if the request was unexpected. It
contains **no link at all**: a one-click confirmation would turn a forwarded or
leaked message into a deletion authorization. Dynamic content is validated and
HTML-escaped; the subject is control-character-stripped and deliberately distinct
from sign-in and invitation subjects.

---

## Where this is implemented

- `core/security/sensitiveActionChallenge.ts` — pure crypto + policy + state evaluation
- `core/auth/accessTokenClaims.ts` — `session_id` / `aal` claim reader
- `repositories/security/sensitiveActionChallenges.ts` — service-role store, atomic CAS
- `services/accounts/deletionChallenge.ts` — request / verify / consume
- `services/email/templates/accountDeletionVerification.ts` — the email
- `app/api/account/delete/**` — the routes
- `features/account/AccountDeletionVerification.tsx` — the universal UI
- `supabase/migrations/20260806000000_sensitive_action_challenges.sql` — the store
