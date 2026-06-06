# 4.ACCOUNT-SETTINGS-BILLING-CLOSEOUT — Account Settings + Billing Overview Closeout

**Type:** Closeout / handoff. Docs only — no source, migrations, tests, or UI.
**Date:** 2026-06-05
**Branch:** `builder-ui-v1-audit-1`

---

## 1. Summary

- Account Settings now has a real, design-aligned **settings shell + left sidebar**.
- **Profile**, **Notifications**, **Security & access**, **Password change**,
  **Plan & billing**, and **Danger zone** have real, backend-backed behavior where
  V2 supports it.
- Unsupported areas remain **honest "Coming soon" rows** — never fake toggles,
  inputs, keys, invoices, or meters.
- User-facing account labels say **Business** (internal `organization`), never
  "Organization" — including the desktop/mobile/Team account switchers.
- **Plan & billing is read-only and truthful** (real task usage + limits); no
  Stripe, checkout, portal, invoice, or payment-method UI.

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
| ACCOUNT-SETTINGS-CLOSEOUT | `77a3b3476` | Account Settings closeout (docs) |
| ACCOUNT-SETTINGS-BILLING-1 | `ab72179f2` | Plan & billing **plan** (docs) |
| ACCOUNT-MODEL-BUSINESS-LIMIT-1 | `13ba61960` | Business member cap = 25 |
| ACCOUNT-LABELS-1 | `81d97724f` | Business label consistency (switchers) |
| ACCOUNT-SETTINGS-BILLING-2 / BILL-1 | `90e998743` | Read-only Plan & billing overview |

(Built atop the owner-transfer/leave-team Team UI at `e14a14ec2`.)

---

## 3. Current Account Settings behavior

- **`/account`** is reachable from the **UserMenu** ("Account settings").
- **Left settings nav** (grouped Personal / Workspace / Account control):
  Profile · Account · Notifications · Security & access · Plan & billing ·
  API & webhooks · Danger zone. Client section state; `?section=<id>` deep-links.

**Profile** — read-only email; editable **display name** (`user_profiles.display_name`,
trim/clear/max-80); avatar coming soon.

**Account** — active-account overview (name / type label / role); Team/Business
pointer to `/team` for shared accounts.

**Notifications** — user-scoped boolean prefs (auto-save on toggle): product
updates, workflow alerts, team & member activity.

**Security & access** (per-user) — email + **Verified/Unverified** badge;
sign-in method ("Email & password"); password status ("Set"); **password change
flow**; 2FA / sessions & devices / connected accounts coming soon.

**Plan & billing** (active-account scoped, read-only) — **Free / Team / Business**
tier label; **real task usage** from `account_billing` (used / limit + period
start, or "Usage unavailable"); **member limit/count** for Team/Business; **folder
limit**; "billed as one account — members don't need Pro" copy; payment method /
invoices / upgrade-change-plan / next-billing-date coming soon; frozen accounts
render a read-only pending-deletion warning.

**Danger zone** — personal-account **deletion request** (typed phrase `delete my
account` + password re-auth); pending/frozen state with purge date; **cancel
deletion**; **owned Team/Business blocker** (`ACCOUNT_HAS_OWNED_TEAMS`) with the
Business label + `/team` link.

---

## 4. Billing model captured

- **No ChainReact Stripe billing exists yet** (Stripe is only a workflow
  integration provider).
- **`account_billing`** is the current account-scoped quota root (tasks
  limit/used/reserved, default 100), flat 1-task/run via `executionBillingGate`,
  atomically enforced. **`getUsage(accountId)`** provides real task usage.
- **Team/Business are account-level plans, not per-seat** subscriptions.
- **Team members do not need their own Pro.**
- **Business member cap is now 25** (incl. owner); **Team 5**; **Personal 1**.
- **Business** is the user-facing label for the internal `organization` type.
- No plan/tier metadata, no `contracts/billing.ts` — tier is derived from account
  `type` (personal → Free, team → Team, organization → Business).

---

## 5. Security / data behavior

- **Password change** reuses the shared `verifyPasswordReauth` as the
  current-password step-up, then `auth.updateUser` on the session client (no
  service-role admin update; no password logged/returned; no fake "last changed").
- **Display name** uses `user_profiles.display_name`.
- **Notification preferences** use additive `user_profiles` booleans:
  `notify_product_updates`, `notify_workflow_alerts`, `notify_team_activity`
  (own-row RLS; self-scoped).
- **Billing overview** reads existing `account_billing` (`getUsage`) + the central
  `memberLimits`/`folderLimits` helpers (resolved server-side and passed as props,
  since `features/` can't import `services/` values per the client/server boundary).
- **No** Stripe, plan metadata, pricing, checkout, invoices, payment method,
  account-scoped URL, credential, workflow, or folder behavior changed.

---

## 6. Pending migration note

- The notification-preferences migration
  `supabase/migrations/20260605000002_user_profiles_notification_preferences.sql`
  exists from `7079f033b` and is validated by `lint:migrations` + a static test.
- It has **not** been applied via `db:push` in any prior slice report (the script
  auto-applies *all* pending migrations against the shared dev DB — outward-facing
  and deferred to a deliberate deploy step).
- **Before live/manual Account Settings testing, run `npm run db:push`** — the
  Notifications section reads/writes the three new columns at runtime and will
  error against a DB that hasn't applied this migration. (BILL-1 and the other
  sections do **not** depend on it.)

---

## 7. Deferred / known limitations

- No avatar upload.
- No username / handle system.
- No email change (email read-only).
- No 2FA / MFA.
- No session / device management; no "sign out everywhere".
- No OAuth / SSO.
- No Stripe / checkout / portal / invoices / payment methods.
- No Pro plan metadata.
- No Team → Business upgrade flow.
- No Personal-Pro → Free downgrade flow.
- No API key / webhook management yet.

---

## 8. Verification baseline (latest, as of BILL-1 `90e998743`)

- **Full Jest:** `15679 passed / 0 failed` (1384 suites passed, 27 skipped).
- **`npm run typecheck`:** clean.
- **`npm run lint`:** 0 errors (17 pre-existing warnings, none in this arc).
- **`npm run lint:migrations`:** OK (notification-prefs migration).
- Targeted Account Settings / Profile / Notifications / Security / Password /
  Billing / Danger-zone tests: green. Account deletion + transfer-ownership
  re-auth tests: green (shared `verifyPasswordReauth` untouched).

---

## 9. Recommended next tracks

**First (launch hygiene):** run `npm run db:push` for the pending notification-
preferences migration, then re-run the full local baseline.

**Then, candidate tracks:**
- **A. API & webhooks settings planning** — scope the programmatic-access surface
  (the last placeholder Account-settings section).
- **B. Plan metadata / Stripe billing planning** — `plan` + per-tier limits +
  Stripe customer/subscription on `account_billing`; checkout/portal; the
  Personal-Pro → Free downgrade guard; Team → Business in-place upgrade.
- **C. Explicit credential sharing / workflow-creator reassignment** —
  collaboration completeness (the gap creator-pinned execution leaves on
  leave/transfer).
- **D. Final Phase 4 local-readiness closeout** — phase-level bundle + push/PR prep.
- **E. 2FA / session future security planning** — TOTP enroll/verify, real session
  list, "sign out everywhere" (see SEC plan future arcs).

**Suggested priority by goal:**
- **Launch hardening:** `db:push` → full local baseline → final Phase 4 local-
  readiness closeout (D).
- **Settings completeness:** API & webhooks settings planning (A).
- **Monetization:** plan metadata / Stripe billing planning (B).
- **Collaboration completeness:** explicit credential sharing / creator
  reassignment (C).

---

## Report summary

The Account Settings + read-only Plan & billing arc is complete on
`builder-ui-v1-audit-1`: a design-aligned settings shell with functional Profile
(display name), Notifications (user-scoped prefs), Security & access (read-only
facts + password change reusing the shared re-auth), read-only Plan & billing
(real `account_billing` usage + member/folder limits, Free/Team/Business labels),
and the Danger-zone deletion lifecycle — honest "coming soon" everywhere V2 has no
backend, Business labels (never "Organization"), and no Stripe/payment fake UI.
The only pending operational step is applying migration `20260605000002` via
`npm run db:push` before live testing.
