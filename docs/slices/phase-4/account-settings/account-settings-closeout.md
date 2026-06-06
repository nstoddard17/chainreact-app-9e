# 4.ACCOUNT-SETTINGS-CLOSEOUT — Account Settings Closeout

**Type:** Closeout / handoff. Docs only — no source, migrations, tests, or UI.
**Date:** 2026-06-05
**Branch:** `builder-ui-v1-audit-1`

---

## 1. Summary

- Account Settings now has a real **settings shell + left sidebar** based on the
  `Account Settings.html` design.
- **Profile**, **Notifications**, **Security & access**, and **Danger zone** have
  real, backend-backed behavior where V2 supports it.
- Unsupported areas (billing, API keys, 2FA, sessions, avatar, etc.) remain
  **honest "Coming soon" rows** — never fake toggles, inputs, or fabricated data.
- User-facing account-type labels use **Team / Business** (internal
  `organization` → "Business"); "Organization" is never shown as a tier.

---

## 2. Completed commit chain

| Slice | Commit | What landed |
|---|---|---|
| ACCOUNT-SETTINGS-1 | `e25e73d47` | Account Settings page + personal deletion UI |
| ACCOUNT-SETTINGS-2 | `04b877242` | Design-faithful settings shell + section nav |
| ACCOUNT-SETTINGS-3 | `ea9227272` | Profile basics / display name |
| ACCOUNT-SETTINGS-4 | `7079f033b` | Notification preferences |
| ACCOUNT-SETTINGS-5 | `5d702e7a5` | Security & access **plan** (docs) |
| ACCOUNT-SETTINGS-6 / SEC-1 | `7ed3e1e2b` | Read-only Security & access |
| ACCOUNT-SETTINGS-7 / SEC-2 | `1c1cba1a1` | Password change |

(Built atop the owner-transfer/leave-team Team UI at `e14a14ec2`.)

---

## 3. Current behavior

- **`/account`** is reachable from the **UserMenu** ("Account settings" → `/account`).
- **Left settings nav** (grouped: Personal / Workspace / Account control):
  - Profile
  - Account
  - Notifications
  - Security & access
  - Plan & billing
  - API & webhooks
  - Danger zone
- Section state is client-side; `?section=<id>` deep-links (unknown → default
  Account). On narrow viewports the nav stacks above the content column.

**Profile**
- Read-only email.
- Editable **display name** (`user_profiles.display_name`) — trim, clear-to-blank,
  max 80, inline save with success/error.
- Avatar — coming soon.

**Account**
- Active-account overview (name / type label / role).
- **Team/Business pointer** to `/team` when the active account is shared (no
  shared-account delete here).

**Notifications** (user-scoped boolean preferences, auto-save on toggle)
- Workflow alerts
- Team & member activity
- Product updates

**Security & access** (per-user, identical for personal / Team / Business)
- Email + **Verified / Unverified** badge (`email_confirmed_at`).
- Sign-in method ("Email & password").
- Password status ("Set").
- **Password change flow** (current / new / confirm).
- 2FA, Sessions & devices, Connected accounts — coming soon.

**Danger zone**
- Personal-account **deletion request** (typed phrase `delete my account` +
  password re-auth).
- Pending/frozen state with the grace-window purge date.
- **Cancel deletion**.
- **Owned Team/Business blocker** (`ACCOUNT_HAS_OWNED_TEAMS`) listing owned
  accounts with the Business label + a `/team` link.

---

## 4. Security behavior

- Password change **reuses `verifyPasswordReauth`** (the shared step-up service
  also used by account delete + transfer ownership) — no second re-auth path.
- The **current password is verified before** `supabase.auth.updateUser` runs; a
  failed step-up never reaches the update.
- Update runs on the **session client** — **no service-role admin** password
  update.
- **No passwords logged or returned**; the failing factor (email vs current
  password) is never disclosed (generic `REAUTH_FAILED`).
- **No fake "password last changed"** metadata.
- **2FA / session management intentionally deferred** (see plan `5d702e7a5`).

---

## 5. Data / model behavior

- Display name uses the existing `user_profiles.display_name` column (no schema
  change in this arc for Profile).
- Notification preferences use **additive `user_profiles` boolean columns**
  (migration `20260605000002`):
  - `notify_product_updates` (default **false** — opt-in news)
  - `notify_workflow_alerts` (default **true**)
  - `notify_team_activity` (default **true**)
- Notification preferences (and display name) are **self-scoped** via the existing
  `user_profiles` own-row RLS (`user_profiles_{select,update}_own`,
  `auth.uid() = id`). The session user id always comes from the verified session,
  never request input.
- Password change touches `auth.users` (Supabase), not `user_profiles`.
- **No account / team / workflow ownership changes** anywhere in this arc.

---

## 6. Deferred / known limitations

- No avatar upload.
- No username / handle system.
- No email change (email stays read-only).
- No 2FA / MFA.
- No session / device management.
- No "sign out everywhere".
- No OAuth / SSO.
- No billing / Stripe management.
- No API key / webhook management.
- No Team/Business account-deletion UI (shared accounts are managed from `/team`).
- No personal-deletion lifecycle surface beyond the current Danger-zone route if
  richer lifecycle UI is wanted later.

---

## 7. Migration note

- The notification-preferences migration
  `supabase/migrations/20260605000002_user_profiles_notification_preferences.sql`
  was **created** in `7079f033b`.
- It was **not** run via `db:push` in that slice's report (outward-facing,
  hard-to-reverse; deferred to a deliberate deploy step). It is validated by
  `npm run lint:migrations` + a static migration test.
- **Before live/manual testing or a final push baseline, run `npm run db:push`**
  if following the current V2 migration workflow — the Notifications section reads
  and writes the three new columns at runtime, so the section will error against a
  DB that hasn't applied this migration.

---

## 8. Verification baseline (latest, as of SEC-2 `1c1cba1a1`)

- **Full Jest:** `15659 passed / 0 failed` (1382 suites passed, 27 skipped).
- **`npm run typecheck`:** clean.
- **`npm run lint`:** 0 errors (17 pre-existing warnings, none in this arc's files).
- **`npm run lint:migrations`:** OK.
- Targeted Account Settings / Profile / Notifications / Security / Password tests:
  green.
- Account **deletion** and **transfer-ownership re-auth** tests: green (shared
  `verifyPasswordReauth` untouched).

---

## 9. Recommended next tracks

**First (launch hygiene):** run `npm run db:push` for the pending notification-
preferences migration, then re-run the verification baseline.

**Then, candidate tracks:**
- **A. Phase 4 final closeout + push / PR prep** — bundle the branch, write the
  phase-level closeout, prep the PR.
- **B. Plan & billing settings planning** — make the Billing section real (read
  current plan/usage); precede any Stripe work with a plan.
- **C. API keys / webhooks planning** — scope programmatic-access surface.
- **D. 2FA / session / security future planning** — TOTP enroll/verify, real
  session list, "sign out everywhere" (see SEC plan future arcs).
- **E. Explicit credential sharing / workflow-creator reassignment** —
  collaboration completeness (the gap creator-pinned execution leaves on leave/
  transfer).
- **F. Paid Teams / Business / Enterprise billing** — monetization.

**Suggested priority by goal:**
- **Launch hardening:** `db:push` → final baseline → Phase 4 closeout / push prep (A).
- **Account-settings completeness:** Plan & billing planning next (B).
- **Collaboration completeness:** explicit credential sharing / creator
  reassignment (E).

---

## Report summary

The Account Settings arc (SETTINGS-1 → SETTINGS-7) is complete on
`builder-ui-v1-audit-1`: a real settings shell with Profile (display name),
Notifications (user-scoped prefs), Security & access (read-only facts + password
change reusing the shared re-auth), and the Danger-zone deletion lifecycle —
honest "coming soon" everywhere V2 has no backend, and Team/Business labels (never
"Organization"). The only pending operational step is applying migration
`20260605000002` via `npm run db:push` before a final baseline.
