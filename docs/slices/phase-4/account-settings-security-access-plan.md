# 4.ACCOUNT-SETTINGS-5 — Security & Access Plan

**Type:** Planning / design only. No source, migrations, tests, or UI in this slice.
**Date:** 2026-06-05
**Branch:** `builder-ui-v1-audit-1`

**Source of truth (verified current state):**
[app/auth/actions.ts](../../../app/auth/actions.ts) ·
[services/accounts/accountDeletionReauth.ts](../../../services/accounts/accountDeletionReauth.ts) ·
[repositories/authReauth.ts](../../../repositories/authReauth.ts) ·
[app/api/account/delete/route.ts](../../../app/api/account/delete/route.ts) ·
[app/api/accounts/[id]/transfer-ownership/route.ts](../../../app/api/accounts/[id]/transfer-ownership/route.ts) ·
[features/account/AccountSections.tsx](../../../features/account/AccountSections.tsx) (`SecuritySection`) ·
[features/account/AccountSettings.tsx](../../../features/account/AccountSettings.tsx) ·
design `Account Settings.html` → `src/settings-cards.jsx` (`SecurityCard`), `src/settings-sections.jsx` (`SecuritySection`).

> **Headline:** V2 auth is **email + password only** today — no OAuth, no MFA, no
> user-facing session API. Password change **is** feasible now (`auth.updateUser`)
> and should reuse the existing password re-auth as a current-password step-up.
> 2FA and session/device management are **not** safely implementable today and
> stay "coming soon". Ship a **read-only** Security & access section first
> (SEC‑1), then password change (SEC‑2). No fake toggles.

---

## 1. Context

The Account Settings shell ([04b877242]) ships a grouped settings surface; Profile
basics ([ea9227272]) and Notification preferences ([7079f033b]) are the first two
functional sections. **Security & access** is still an honest placeholder
(read-only email + `Password` / `Two-factor authentication` / `Active sessions`
"coming soon" rows in `AccountSections.tsx:SecuritySection`).

This plan decides exactly what is real today so the next implementer does **not**
(a) build a 2FA toggle or session list that can't actually work, or (b) introduce
a second, divergent re-auth/step-up path that conflicts with the deletion +
transfer model.

> **Note (carried from 4.ACCOUNT-SETTINGS-4):** the notification-preferences
> migration `20260605000002_user_profiles_notification_preferences.sql` exists but
> was **not** applied to the dev DB. Security & access needs **no migration**, so
> it is unaffected — but a password-change "last changed" timestamp is one thing
> we deliberately do **not** add a column for (see §6 / §14).

---

## 2. Current auth / re-auth model (verified)

- **Auth methods:** email + password only. [app/auth/actions.ts](../../../app/auth/actions.ts)
  `signUp` → `supabase.auth.signUp`, `signIn` → `supabase.auth.signInWithPassword`,
  `signOut` → `supabase.auth.signOut`. The file comment states *"Email + password
  is the Slice 1 floor. SSO providers … are a later slice."* A repo-wide search
  finds **no** `signInWithOAuth`, `signInWithOtp`, `auth.mfa.*`, or `user.identities`
  usage. **Every current user therefore has a password.**
- **Re-auth (step-up) primitive:** [repositories/authReauth.ts](../../../repositories/authReauth.ts)
  `verifyPasswordCredential(email, password)` signs in on a **throwaway, session-less**
  client (`persistSession:false`, `autoRefreshToken:false`), discards the minted
  tokens (best-effort `signOut`), and returns a boolean — so the check never
  mutates the caller's live session.
- **Re-auth service:** [services/accounts/accountDeletionReauth.ts](../../../services/accounts/accountDeletionReauth.ts)
  `verifyPasswordReauth(email, password) → { ok, reason? }` (`invalid_credentials`
  / `misconfigured` / `no_email`). Guards env presence; owns the business reasoning.
- **Consumers (already standardized on this one service):**
  - `POST /api/account/delete` — typed-phrase + password step-up before a
    destructive request.
  - `POST /api/accounts/[id]/transfer-ownership` — owner gate + password step-up.
  - Both already document the OAuth-only gap: *"a passwordless (OAuth-only) caller
    cannot complete it until SSO step-up lands"* → `verifyPasswordReauth` returns
    `no_email`/`invalid_credentials` and the route answers `401 REAUTH_FAILED`.
- **Self-scoping pattern:** account routes resolve the user id from the verified
  session via `requireAuthedUserId()` ([app/api/account/_shared.ts](../../../app/api/account/_shared.ts)),
  never from the body. Security writes MUST follow this.

**Implication:** there is already **one** re-auth service. Password change must
reuse it for "verify current password", not invent a second path.

---

## 3. Design sections to adopt / defer

The design's Security surface spans two files:

| Design element (file) | Real today? | Decision |
|---|---|---|
| Email address + **Verified** badge (`SecurityCard`) | Yes — `user.email` + `user.email_confirmed_at` from `getUser()` | **Adopt** (read-only; verified badge from `email_confirmed_at`) |
| Password row with **"Last changed 4 months ago"** (`SecurityCard`) | No — Supabase exposes no password-changed timestamp | **Adopt the row, DROP the fake timestamp.** Show "Set" + a Change action (SEC‑2). Never fabricate "last changed". |
| **Two-factor authentication** toggle (`SecurityCard`) | No — MFA unconfigured/unwired | **Defer** → "Coming soon" (no toggle) |
| **Active sessions** list + revoke (`SecuritySection`) | No — no user-facing session API | **Defer** → "Coming soon" |
| **Connected identity providers** (`SecuritySection`) | No — no OAuth | **Defer** → "Coming soon" (revisit after SSO) |
| Sign-in method (implicit) | Yes — derivable | **Adopt** ("Email & password") |

---

## 4. Recommended launch scope

**SEC‑1 (read-only) first, then SEC‑2 (password change).** Concretely:

- **SEC‑1 — read-only Security & access** (no writes):
  - Signed-in **email** (read-only).
  - **Email verification status** — "Verified" / "Unverified" from `email_confirmed_at`.
  - **Sign-in method** — "Email & password".
  - **Password** — status "Set" (every user has one today). Change CTA can render
    disabled with "coming soon" if SEC‑2 hasn't shipped, or enabled once it has.
  - **Two-factor authentication** — "Coming soon" (no toggle).
  - **Sessions & devices** — "Coming soon".
- **SEC‑2 — password change** (separate slice; feasible + testable): a real change
  flow gated by current-password step-up. See §6.
- **No fake toggles, no fabricated metadata** (no "last changed N months ago").
- Standardized copy for the (future) OAuth-only case lives in one place (§7).

---

## 5. Password change feasibility — **FEASIBLE NOW**

- **Mechanism:** `supabase.auth.updateUser({ password })` on the session
  (SSR cookie client) updates the logged-in user's password. Supported in the
  current client setup.
- **Critical caveat:** `updateUser` does **not** verify the *current* password —
  it trusts the session. For a sensitive change we MUST add our own **current-password
  step-up** by reusing `verifyPasswordReauth(email, currentPassword)` before
  calling `updateUser`. This matches the deletion/transfer posture and defends an
  unattended session.
- **Validation:** enforce an app-level **minimum length (recommend 8)** and a
  new ≠ current check; surface a typed `VALIDATION` error. (Supabase project
  settings also enforce a floor — align, don't undercut.)
- **OAuth-only:** blocked with clear copy (N/A today since all users have passwords;
  future-proofed via the `hasPassword` capability in §7).
- **Shape:** new server route `PATCH /api/account/password` (or a server action)
  mirroring the profile/notification routes: `requireAuthedUserId` → validate →
  `verifyPasswordReauth(currentPassword)` → `auth.updateUser({password})` →
  `{ ok: true }`. Never returns whether the email/current-password was the failing
  factor beyond a generic `REAUTH_FAILED`.

**Recommendation:** implement in **SEC‑2** (kept separate from SEC‑1 so the
read-only section ships without blocking on the step-up form + rate-limit thought).

---

## 6. OAuth-only step-up handling

- **Today:** not applicable — there are no OAuth-only users (password-only signup).
  Password step-up is universally valid right now.
- **Capability check (introduce a small helper):** `getSignInMethods(user)` /
  `userHasPassword(user)` derived from `user.identities` (an `email` provider
  identity ⇒ has password) and `user.app_metadata.providers`. Lets the UI and the
  step-up routes branch cleanly when SSO lands.
- **Future (when SSO ships):** OAuth-only users cannot do password step-up →
  branch to provider re-auth / email OTP. This is a cross-cutting change touching
  **delete, transfer, and password-change** simultaneously — which is the argument
  for standardizing step-up (§ below + §11). Until then, surface the documented
  `REAUTH_FAILED` and one canonical copy string: *"Password confirmation is
  required for this action."*

---

## 7. 2FA feasibility — **DEFER**

- The `@supabase/supabase-js` client exposes `auth.mfa.*` (enroll / challenge /
  verify / listFactors), but the project is **not configured for MFA** and nothing
  in the app wires it. A real launch needs: project MFA enablement, an enroll
  (TOTP QR) flow, challenge/verify on sign-in, recovery codes, and a factor-list
  UI — plus interaction with the step-up model.
- **Decision:** "Coming soon" row, no toggle. Own dedicated slice later
  (SEC‑FUTURE‑2FA). Out of scope for SEC‑1/2.

---

## 8. Session / device management feasibility — **DEFER**

- The standard client has **no** user-facing "list my sessions/devices" API.
  Session/refresh-token administration lives under `auth.admin.*` (service-role,
  not a per-user device list with metadata). So a truthful session list/revoke
  UI is **not** implementable today.
- **The one supported action:** `auth.signOut({ scope: 'global' })` revokes all
  of the user's refresh tokens ("sign out everywhere"). It also ends the current
  session (→ redirect to login). This is feasible and safe, but it's a blunt
  instrument, not a device list.
- **Decision:** "Sessions & devices — Coming soon" for SEC‑1. Treat **"Sign out
  everywhere"** as a small optional follow-up (SEC‑FUTURE‑SIGNOUT‑ALL), not part
  of the read-only launch — gated on a product decision about the post-action UX.

---

## 9. UI behavior

- **Scope is per-user, NOT per-account.** Security & access is about the signed-in
  identity's credentials. It renders **identically regardless of the active
  account** (personal vs Team/Business). Do **not** gate any row on active-account
  type or role. (Per-account security/SSO policy is a far-future, separate concern.)
- **Read-only rows (SEC‑1):** use the existing settings primitives
  (`Panel` / `SettingRow`) and the same "coming soon" pill the other placeholder
  sections use — so deferred rows are visibly non-interactive (no `Switch`, no
  input). Email + verification + sign-in-method + password-status are real values.
- **Change Password (SEC‑2):** an inline expanding form (consistent with the
  Profile/Danger-zone inline pattern — there is no modal primitive): current
  password, new password, confirm; Save with busy/disabled, success + inline
  error; fields cleared on success. Reuses the `REAUTH_FAILED` message for a wrong
  current password.
- **Honesty rules:** no fabricated "last changed" date; no enabled control that
  doesn't perform a real, backed action.

---

## 10. API / client / service changes needed

**SEC‑1 (read-only):** likely **zero new backend**. The page already resolves the
session user; pass `email` + `emailVerified` (`user.email_confirmed_at != null`)
+ a derived `signInMethod` into the shell → `SecuritySection`. Optionally add a
pure helper `getSignInMethods(user)` (no I/O). No route, no migration.

**SEC‑2 (password change):**
- **Route:** `app/api/account/password/route.ts` — `PATCH`, `requireAuthedUserId`,
  Zod body `{ currentPassword, newPassword }` (min length on `newPassword`), step-up
  via `verifyPasswordReauth`, then `supabase.auth.updateUser({ password })` on the
  SSR session client. Returns `{ ok: true }` / typed 400 / 401.
- **Service:** `services/accounts/passwordChange.ts` (`changeOwnPassword`) — owns
  the order (re-auth → update) + validation; mirrors `userProfile.ts`.
- **Client:** `changePassword({ currentPassword, newPassword })` in
  `lib/api/accounts.ts` (throws `AccountApiError`; `VALIDATION`/`UNAUTHENTICATED`).
- **No new schema.** `auth.updateUser` lives in `auth.users`, not `user_profiles`.

**Standardization (SEC‑3, optional):** keep `verifyPasswordReauth` as the single
re-auth service (already shared). Optionally extract a reusable **client**
step-up password field/dialog used by delete (danger zone), transfer (team), and
password-change — a quality refactor, not a behavior change.

---

## 11. Should re-auth be standardized + a reusable StepUpAuth exist?

- **Service layer: already standardized** — `verifyPasswordReauth` is the one
  step-up authority; SEC‑2 must reuse it. **Do not** add a second verifier.
- **Client layer: recommend a reusable step-up password component** (e.g.
  `StepUpPasswordField` / dialog) as an **optional SEC‑3** consolidation. Today
  delete and transfer each render their own inline password field; password-change
  would be a third. Extracting one shared control reduces drift. Low priority —
  not required to ship SEC‑1/2.

---

## 12. Team/Business vs personal behavior

Security & access does **not** vary by active account. It always reflects the
signed-in user's credentials. No per-account rows, no role gating. (Contrast with
the Account section, which *does* show active-account name/type/role + a Team
pointer.) Document this explicitly so nobody adds account-scoped security later by
reflex.

---

## 13. Safe UI rows to implement immediately (SEC‑1)

1. **Email** — read-only (`user.email`). No edit (email change is out of scope).
2. **Email status** — "Verified" / "Unverified" (`email_confirmed_at`).
3. **Sign-in method** — "Email & password".
4. **Password** — "Set" + a Change action (disabled "coming soon" until SEC‑2).
5. **Two-factor authentication** — "Coming soon" (no toggle).
6. **Sessions & devices** — "Coming soon".

---

## 14. Sections omitted / deferred

- Password "last changed" timestamp — **dropped** (no source; would be fake).
- 2FA enable/disable — **deferred** (SEC‑FUTURE‑2FA).
- Active session/device list + revoke — **deferred** (no API).
- "Sign out everywhere" — **deferred/optional** (SEC‑FUTURE‑SIGNOUT‑ALL).
- Connected identity providers — **deferred** (revisit post-SSO).
- Email change — **out of scope** (hard boundary; email stays read-only).

---

## 15. Test plan (for the implementation slices)

**SEC‑1:**
- `SecuritySection` renders email + verified/unverified + sign-in method + password
  "Set".
- Coming-soon rows expose **no** working controls (no `switch`/`textbox`/enabled
  button) — same assertion style as the other placeholder sections.
- Verified vs unverified branch (with/without `email_confirmed_at`).
- Renders identically for a Team/Business active account (no account gating).

**SEC‑2 (password change):**
- Route: 401 unauthenticated; 400 short/missing new password; 401 `REAUTH_FAILED`
  on wrong current password (service mocked); 200 happy path calls
  `updateUser({password})` with the **session** user (never the body); new ≠ current.
- Service: re-auth-before-update ordering; rejects when re-auth fails (no update).
- Client: `changePassword` wire shape + error mapping.
- Component: current/new/confirm gating, success + error states, OAuth-only copy
  branch (future-proofed; trivially true today).
- **Regression:** existing delete + transfer step-up tests stay green (shared
  `verifyPasswordReauth` untouched).

---

## 16. Implementation slice breakdown

- **SEC‑1 — Read-only Security & access** (no backend; UI + page plumbing + tests).
  *Smallest, safe, ships immediately.*
- **SEC‑2 — Password change** (route + service + client + inline form + tests;
  reuses `verifyPasswordReauth`; `auth.updateUser`). *Feasible now.*
- **SEC‑3 — Step-up consolidation** *(optional quality)* — extract one reusable
  client step-up password control shared by delete / transfer / password.
- **SEC‑FUTURE‑SIGNOUT‑ALL** *(optional)* — "Sign out everywhere" via global
  `signOut`; needs a post-action UX decision.
- **SEC‑FUTURE‑2FA** — TOTP enroll/challenge/verify + recovery codes (own arc;
  requires project MFA config).
- **SEC‑FUTURE‑SESSIONS** — real session/device list (blocked on a supported API).
- **SEC‑FUTURE‑SSO** — OAuth providers + connected-identities row + provider/OTP
  step-up branch across delete/transfer/password.

---

## 17. Risks / open questions

- **`updateUser` skips current-password verification** → we MUST add our own
  current-password re-auth. The re-auth signs in on a throwaway client →
  **rate-limit / lockout** exposure on repeated wrong attempts; consider light
  client-side throttling + relying on Supabase's own limits.
- **No password-changed timestamp** → resist re-adding the design's "last changed"
  line; don't add a `user_profiles` column just to fake it.
- **Min length** must align with the Supabase project Auth setting; pick app min
  (recommend 8) and document.
- **"Sign out everywhere" ends the current session** → redirect-to-login UX must
  be intentional if we ship it.
- **Future OAuth-only** rewrites step-up for delete + transfer + password at once —
  standardizing now (one service) keeps that change small.
- **Email verification copy** — if `email_confirmed_at` is null for a legitimately
  signed-in user (e.g. confirmations disabled in dev), "Unverified" must read as
  informational, not alarming.

---

## 18. Acceptance criteria (for this planning slice)

- A committed planning doc at this path; **no** source, migration, test, or UI
  changes; nothing pushed.
- States unambiguously: V2 is **email/password only**; **password change is
  feasible now** (reusing `verifyPasswordReauth` as current-password step-up);
  **2FA + session/device management are deferred** (not safely implementable
  today); re-auth is **already standardized** on one service and must stay so;
  Security & access is **per-user, not per-account**.
- Gives a concrete slice breakdown (SEC‑1 read-only → SEC‑2 password change →
  optional SEC‑3 + future arcs) and the exact safe rows for SEC‑1.

---

## Report summary

- **Auth today:** email + password only — no OAuth, no MFA, no user session API.
  All current users have a password.
- **Re-auth:** one shared service (`verifyPasswordReauth`, throwaway session-less
  client) already used by delete + transfer. Reuse it; do not fork it.
- **Recommended launch scope:** SEC‑1 read-only Security & access (email,
  verification status, sign-in method, password "Set", 2FA + sessions "coming
  soon"), then SEC‑2 password change.
- **Password change:** feasible via `auth.updateUser`; gate behind current-password
  step-up + min length. Implement in SEC‑2.
- **OAuth-only step-up:** N/A today; add a `hasPassword` capability + canonical
  copy now so the future SSO branch (delete/transfer/password together) is small.
- **2FA / sessions:** deferred — SDK surface exists but is unconfigured/absent;
  "Sign out everywhere" is the only supported session action, optional + later.

[04b877242]: ../../../  "Account Settings shell + section nav"
[ea9227272]: ../../../  "Profile basics / display name"
[7079f033b]: ../../../  "Notification preferences"
