# 4.WORKFLOW-TEMPLATES-MARKETPLACE-7 / CS-XT-9 — Template Feature-Flag Activation Readiness Audit

**Type:** Readiness / hardening audit. **No source, migration, test, or UI changes — verdict
is READY-TO-FLIP, no code change required this slice. Nothing pushed.**
**Date:** 2026-06-07
**Branch:** `builder-ui-v1-audit-1`

**Verdict:** ✅ **Ready to flip `ENABLE_WORKFLOW_TEMPLATES`** from a correctness + no-leak
standpoint. One **non-blocking** hardening observation (§4); no true launch blockers found.

**Source of truth (each file inspected this session, cross-checked against the commits below):**
[use/route.ts](../../../../app/api/workflow-templates/[templateId]/use/route.ts) ·
[fork/route.ts](../../../../app/api/workflow-templates/[templateId]/fork/route.ts) ·
[marketplace/route.ts](../../../../app/api/workflow-templates/marketplace/route.ts) ·
[accounts/[id]/workflow-templates/route.ts](../../../../app/api/accounts/[id]/workflow-templates/route.ts) ·
[…/[templateId]/route.ts](../../../../app/api/accounts/[id]/workflow-templates/[templateId]/route.ts) ·
[services/workflows/templateManagement.ts](../../../../services/workflows/templateManagement.ts) ·
[repositories/workflowTemplates.ts](../../../../repositories/workflowTemplates.ts) ·
[features/templates/*](../../../../features/templates/) · [app/templates/page.tsx](../../../../app/templates/page.tsx) ·
migrations `20260616/17/18000000_*.sql`.

**Arc closed out by:** [workflow-templates-marketplace-closeout.md](./workflow-templates-marketplace-closeout.md)
(`be69ccea0`…`1f113e0db`) + official seed `92ae0e92e`.

---

## 1. Marketplace page / listing UX — PASS

- `GET /api/workflow-templates/marketplace` is **flag-gated** (404 when off) and **auth-required**
  (401) — verified ([marketplace/route.ts:16-21](../../../../app/api/workflow-templates/marketplace/route.ts)).
- The repo query is `.or("source.eq.official,visibility.eq.public")` — officials + public user
  templates only; **unlisted is excluded from listings** (link-access only) and **private is never
  listed** ([repositories/workflowTemplates.ts](../../../../repositories/workflowTemplates.ts)).
- Officials render under **"By ChainReact"** (`isOfficial` filter); community = non-official public.
- The marketplace DTO (`MarketplaceTemplateSummary`) **omits `account_id`, `created_by_user_id`,
  and `definition`** — asserted by [marketplace-route.test.ts](../../../../tests/unit/app/api/workflow-templates/marketplace-route.test.ts)
  (response text contains no `account_id`/`createdByUserId`/`definition`).
- Empty / loading / error: SSR first paint (no loading state needed); empty + toast states in the
  dashboard. Official badge driven by `isOfficial`.

## 2. Use-template path — PASS

- Flag-gated + auth-required. `resolveTemplateForAccess` grants official/public/unlisted to any
  authed user; **private → owning-account members only**, and an inaccessible/missing id collapses
  to the **same 404** (`template_not_found`) — **no existence oracle**.
- **Target-account membership required** before creation; the workflow is created through the **RLS
  client** (`workflowsRepo.create`), so `workflows_insert_account_member` **double-enforces** target
  membership at the DB. The created workflow lands in the **resolved active account** and opens in
  the builder at `/workflows/{workflowId}`.
- The template definition is validated against `WorkflowDefinitionSchema` before persistence
  (invalid → 422). It carries the **sanitized graph with `__REDACTED__` markers** (empty configs for
  officials), so **missing provider connections are handled by the existing reconnect/credential UX**
  — no template-specific credential hacks.
- A `used_to_create_workflow` **usage event** is recorded with `template_id` + `target_account_id` +
  `created_workflow_id`.

## 3. Fork path — PASS

- Forking an official sets **`forked_from_template_id` to the official's real DB row id** (the seed
  rows are real, so the FK resolves — this is exactly why the seed is DB-backed, not static).
- The fork is **`source='user'`** (never inherits `official`), **`account_id = target account`**,
  **`created_by_user_id = actor`** — account/user-owned. The **official source row is never mutated**
  (fork only INSERTs a new row).
- Fork requires target **owner/admin** + custom-template **capability** + **tier limit**; a `forked`
  usage event records `created_template_id`. RLS/access unchanged.

## 4. Security / data-leak check — PASS (one non-blocking observation)

- **No credential exposure:** template definitions are the export sanitizer's output (redacts
  tokens/secrets/emails/webhook secrets/OAuth material + whitelists node/edge fields); officials use
  empty configs. No `integrations` / `workflow_node_credentials` reads. The seed migration's static
  test asserts no `xoxb-`/`access_token`/`sk_`/`whsec_`/email patterns.
- **Platform vs tenant ownership:** the `account_id ↔ source` CHECK invariant guarantees
  `official ⇒ account_id NULL` and `user ⇒ account_id NOT NULL`. Officials are immutable via the
  account PATCH/DELETE routes (those scope by the URL's `account_id`; an official's NULL account
  matches none → 404).
- **Anon:** no `anon` GRANT on `workflow_templates` or `workflow_template_usage_events`; the
  marketplace policy requires `auth.uid() IS NOT NULL`. **No anonymous marketplace access.**
- **Authenticated direct writes:** there is **no authenticated INSERT/UPDATE/DELETE policy or
  GRANT** — all writes are service-role only, behind the route's role/tier/creator gates.
- **Usage ledger** is service-role only (no authenticated/anon GRANT) — internals never reach a
  client; the only public counters are the denormalized `usage_count`/`fork_count`.
- **Client DOM:** `toMyTemplateItem` drops `createdByUserId` → `canManage` boolean before render;
  the dashboard renders no account/user id (asserted in
  [TemplatesDashboard.test.tsx](../../../../tests/unit/features/templates/TemplatesDashboard.test.tsx)).

> **Non-blocking hardening observation (NOT a launch blocker):** `GET
> /api/accounts/[id]/workflow-templates` returns `AccountTemplateSummary[]`, which still includes
> the raw `created_by_user_id` of EACH template (incl. co-members'). This JSON reaches the client on
> the dashboard's post-fork `refreshMine()` refetch — but it is **never rendered** (mapped to
> `canManage` first), the route is **membership-gated** (only co-members of the same account receive
> it), and a user id is **not** a credential/token/email/label/scope. It is a within-account
> teammate id, not a cross-account or anon leak. **Recommended future hardening (deferred):** map
> the GET route + its client helper to return `canManage` server-side (drop `createdByUserId` from
> the wire), mirroring the SSR page's `toMyTemplateItem`. Cheap, but it touches the route + lib
> helper + dashboard + types, so it's out of scope for this "no-redesign" readiness pass.

## 5. Feature-flag behavior — PASS

- **OFF (default):** every template API route returns **404**; `/templates` renders the
  **coming-soon** panel with **no data fetch**; the Templates nav item is shown but its route
  **always resolves** (coming-soon), so there is **no dead link / no 404**.
- **ON:** the page SSR-fetches marketplace + the active account's own templates and renders the
  dashboard; routes are coherent and reachable. Flipping the flag requires no code change.

## 6. Tests / verification (run this session)

- **Template unit suites — 127 passed / 12 suites** (`templateManagement`, `templateUseFork`,
  `workflow-templates-route`, `workflow-template-detail-route`, `marketplace-route`, `use-fork-route`,
  `workflowTemplates` repo, `seedOfficialTemplates`, `TemplatesDashboard`, `lib/api/workflowTemplates`,
  the two migration guards).
- **Gated DB suites — 12 passed / 2 suites** (`ALLOW_DB_INTEGRATION_TESTS=true`):
  `workflow-templates-rls` (member-sees / non-member + anon don't / no-write-grant / cascade /
  marketplace public+official visibility / private isolation / usage-ledger denial / counter
  trigger) + `official-templates-seed` (≥5 platform-owned officials, marketplace RLS read,
  anon-blocked).
- Full `npx jest` **not re-run this session** — inherits the official-seed slice baseline
  (`92ae0e92e`: 16,677 passed / 0 failed; typecheck clean; lint 0 errors; lint:structure OK).
- **No migration in this slice.** No `db:push`.

---

## 7. What did NOT change (preserved invariants)

- No template backend/schema/route/UI change; no new flag; no `db:push`.
- `ENABLE_WORKFLOW_TEMPLATES` / `ENABLE_EXPORT_TIER_GATING` remain **default OFF**.
- No import/upload, no rewards, no moderation/reporting, no public anonymous marketplace, no
  billing/Stripe, no new template schema.
- `created_by_user_id` not rewritten; no co-member credential fallback added; service-role-only
  writes preserved.

## 8. Recommended next step

Flip `ENABLE_WORKFLOW_TEMPLATES` in a staged rollout (it's ready). Optionally land the §4 hardening
(canManage-on-the-wire for the account-templates GET) as a small follow-up before/after the flip —
not required for launch.

**Docs-only. Nothing pushed.**
