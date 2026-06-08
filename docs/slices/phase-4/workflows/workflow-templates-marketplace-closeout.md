# 4.WORKFLOW-TEMPLATES-MARKETPLACE-CLOSEOUT — Templates Marketplace + Portability Closeout

**Type:** Closeout / handoff. **Docs-only. No source, migration, test, or UI changes in this
slice. Nothing pushed.**
**Date:** 2026-06-07
**Branch:** `builder-ui-v1-audit-1`

**Scope of this arc:** credential-free workflow export → tier policy → template data model →
marketplace schema + usage ledger → management/marketplace API → use/fork routes → Templates page
UI. Spans the **CS-BD-4** export foundation, the **CS-XT-1…7A** portability/templates arc.

**Plans this closes out:**
[workflow-export-template-tier-policy-plan.md](./workflow-export-template-tier-policy-plan.md)
(the design doc — its §2.2 "templates do not exist" was true at planning time and is superseded
by this closeout) · downgrade-export safety relationship in
[business-downgrade-plan.md](../account-settings/business-downgrade-plan.md) (§8, §13).

---

## 1. Summary

- **CS-BD-4A** (`4225295ce`) — credential-free single-workflow export + the no-leak sanitizer.
- **CS-BD-4B** (`0f0017af3`) — bulk account workflow export (for the destructive downgrade save).
- **CS-XT-1** (`be69ccea0`) — central feature-tier policy seam (`templateLimit` + capabilities) +
  the actual-plan capability resolver + two default-OFF flags.
- **CS-XT-2+3** (`2dbd64c89`) — bulk-export tier gate (flagged) + the downgrade-export bypass.
- **CS-XT-4** (`729db61b1`) — `workflow_templates` table, contract, service-role repository, and
  the sanitizer-enforcing create-from-workflow service.
- **CS-XT-4B** (`5f172b97f`) — marketplace schema expansion (visibility / official / lineage /
  creator snapshot / counters) + the `workflow_template_usage_events` ledger.
- **CS-XT-5A** (`631f8463b`) — account template CRUD + publish/unpublish + marketplace listing API.
- **CS-XT-5B** (`4444542a7`) — use-template (create workflow) + fork/copy routes.
- **CS-XT-7A** (`1f113e0db`) — Templates page UI at `/templates` from the Claude Design handoff.

---

## 2. Completed commit chain

- `4225295ce` — credential-free workflow schema export foundation (CS-BD-4A) _(2026-06-07)_
- `0f0017af3` — account workflow bulk export for downgrade (CS-BD-4B) _(2026-06-07)_
- `30e4e8175` — export + template tier policy **plan** (CS-XT-1 planning, docs-only) _(2026-06-07)_
- `be69ccea0` — feature-tier policy seam for export + templates (CS-XT-1) _(2026-06-07)_
- `2dbd64c89` — tier-gate bulk export + downgrade export bypass (CS-XT-2+3) _(2026-06-07)_
- `729db61b1` — workflow_templates data model + repository (CS-XT-4) _(2026-06-07)_
- `5f172b97f` — templates marketplace schema + usage ledger (CS-XT-4B) _(2026-06-07)_
- `631f8463b` — template management + marketplace API routes (CS-XT-5A) _(2026-06-07)_
- `4444542a7` — use-template + fork/copy routes (CS-XT-5B) _(2026-06-07)_
- `1f113e0db` — Templates marketplace page UI from design (CS-XT-7A) _(2026-06-07)_

This closeout doc is the next local commit on the chain.

---

## 3. Current shipped behavior

- **Single workflow export** exists (`GET /api/workflows/[id]/export`) — credential-free JSON,
  any account member, no tier gate.
- **Bulk account workflow export** exists (`GET /api/accounts/[id]/workflows/export`).
- **Bulk-export tier gate** exists behind `ENABLE_EXPORT_TIER_GATING`: flag OFF preserves today's
  any-member behavior exactly; flag ON tightens shared-account bulk export to owner/admin and
  blocks Free (Pro+ allowed), resolved from the **actual** stored plan.
- **Downgrade export bypass** exists (`?purpose=downgrade`): owner-only, organization-only, gated
  by `ENABLE_BUSINESS_DOWNGRADE`, **bypasses** the tier gate so the destructive-downgrade safety
  save is never blocked by billing tier.
- **`workflow_templates` table** exists.
- **Marketplace schema** exists: `visibility` (private / public / unlisted), `source` (user /
  official), `creator_display_name_snapshot`, `forked_from_template_id`, `usage_count` /
  `fork_count`, plus the `workflow_template_usage_events` usage ledger.
- **Template management API routes** exist: `GET/POST /api/accounts/[id]/workflow-templates`,
  `PATCH/DELETE /api/accounts/[id]/workflow-templates/[templateId]`.
- **Marketplace listing route** exists: `GET /api/workflow-templates/marketplace`.
- **Use template route** exists: `POST /api/workflow-templates/[templateId]/use` → creates a
  workflow.
- **Fork/copy template route** exists: `POST /api/workflow-templates/[templateId]/fork` → creates a
  private copy.
- **Templates page UI** exists at `/templates`; a **Templates nav item** exists in the rail.
- **Flag OFF** → the page shows a safe **coming-soon** state (no data fetch; routes 404).
- **Flag ON** → the page shows the **marketplace** (official + public) + the active account's **own
  templates**, with tabs (All / By ChainReact / Community / Your templates), client search + sort.
- **Official templates** show the **ChainReact** badge; **community** templates show **safe creator
  attribution** (display-name snapshot only).
- **Use** creates a workflow from the template and opens it in the builder.
- **Fork** creates a private copy in the active account and refetches the "Your templates" tab.
- **Publish / unpublish / delete** exist for the viewer's own (creator-authored) templates.

---

## 4. Export / download policy

| Tier | Single export | Bulk export (flag ON) |
|---|---|---|
| Free | ✅ | ❌ |
| Pro | ✅ | ✅ personal-account |
| Team / Business | ✅ | ✅ **owner/admin only** |
| Enterprise | ✅ | ✅ |

- Single export is the universal data-portability floor — never tier-gated.
- Bulk-export role tightening (member → owner/admin on shared accounts) is a **real behavior
  change**, dark behind `ENABLE_EXPORT_TIER_GATING` (default OFF → today's behavior).
- The downgrade safety export is a distinct owner-only path that **skips** the tier gate (§3).
- Folder hierarchy is intentionally omitted from exports (downgrade flattens it); cap is
  `ACCOUNT_WORKFLOW_EXPORT_LIMIT = 200` (→ typed 413 over the cap).

---

## 5. Template tier policy

Custom (user-authored) template caps live in
[core/billing/planPolicy.ts](../../../../core/billing/planPolicy.ts) (`templateLimit`):

| Tier | Custom templates |
|---|---|
| Free | **0** (built-ins/marketplace use allowed; no authoring) |
| Pro | 25 |
| Team | 50 |
| Business | 250 |
| Enterprise | null (unlimited / config) |

- Capability resolution uses the **actual** `account_billing.plan` via
  [services/billing/planCapabilities.ts](../../../../services/billing/planCapabilities.ts)
  (`resolveAccountCapabilities`), fail-closed to Free, never `defaultPlanForAccountType`.
- Authoring (create / fork-save) requires owner/admin on shared accounts; tier limit enforced at
  the create/fork service boundary (count vs `templateLimit`, Enterprise null skips the count).

---

## 6. Marketplace model

- **Visibility:** `private` (default — owning-account members only) · `public` (listed in the
  marketplace) · `unlisted` (link-accessible, not listed).
- **Source:** `user` (account-authored, `account_id` NOT NULL) · `official` (platform-owned,
  `account_id` NULL — enforced by a CHECK invariant). Built-ins are modeled as `official` rows but
  **no official seed catalog is shipped yet**.
- **Marketplace read access is AUTHENTICATED-only** (anon has no GRANT) — no anonymous public web
  browsing.
- Lineage: `forked_from_template_id` (ON DELETE SET NULL) records the parent of a fork/copy; a fork
  survives its parent being deleted.

---

## 7. Official badge / creator attribution behavior

- `isOfficial` (source `official`) → the **ChainReact** sky-accent badge (`OfficialBadge`).
- Public community (user) templates → `CreatorChip` rendering the **safe display-name snapshot**
  (`creator_display_name_snapshot`, set from `user_profiles.display_name` at publish time) with an
  initials avatar — **never** an email or raw user id.
- The viewer's own templates → "By you" + a private/public visibility chip.

---

## 8. Use / fork / copy behavior

- **Use template** → resolves template access (official/public/unlisted → any authed user; private
  → owning-account members only), requires **target-account membership**, validates the sanitized
  graph against the workflow schema, creates a workflow in the target account carrying the
  **sanitized definition with `__REDACTED__` markers** (the user reconnects credentials), and
  records a `used_to_create_workflow` usage event. Editing the new workflow never touches the
  template.
- **Fork/copy** → same source-access resolution, then requires target **owner/admin** + custom-
  template capability + tier headroom; creates a new `source='user'` template with
  `forked_from_template_id` set, default `visibility` private, and records a `forked` event. **The
  original is never mutated** — non-creators always fork rather than edit.
- **Creator-only edit:** only the original author may `PATCH`/`DELETE` their template (the account
  **owner** may additionally delete for moderation); a non-creator owner/admin cannot mutate
  someone else's original.

---

## 9. Usage tracking model

- `workflow_template_usage_events` is the **source of truth** for future contributor rewards/ranking:
  `(template_id CASCADE, actor_user_id SET NULL, target_account_id SET NULL, event_type, created_workflow_id, created_template_id, created_at)`.
- `event_type ∈ { used_to_create_workflow, forked, saved_copy }` (saved_copy reserved; not yet
  emitted).
- `target_account_id` is **SET NULL** (not CASCADE) so reward history outlives a deleted account.
- An AFTER-INSERT trigger bumps the denormalized `usage_count` / `fork_count` on the parent
  template (`forked` → fork_count, else usage_count), keeping the cache consistent without an
  app-side race. The raw ledger is **service-role only** and never reaches a client.

---

## 10. Security / no-leak guarantees

- **Templates are schema-only** — a template's `definition` is the export **sanitizer's** output
  (`sanitizeWorkflowDefinitionForExport`), re-validated against a strict schema. Built from `name`
  + sanitized `draftDefinition` only; the credential-bearing sibling tables (`integrations`,
  `workflow_node_credentials`) are never read → structurally excluded.
- **No OAuth tokens / secrets**, **no provider account labels / emails**, **no credential-ownership
  grants**, **no Stripe ids** ever appear in a template or any template response.
- **Marketplace DTOs omit `account_id` and `created_by_user_id`** — only the safe display-name
  snapshot + official badge + counts.
- **Client UI drops the raw `createdByUserId`** and replaces it with a `canManage` boolean
  (computed against the viewer's id) before reaching the browser; the page renders no raw account/
  user id (asserted in tests).
- **Use/fork never mutate the original template** (copy-on-write semantics).
- **Non-members cannot read private templates** — an inaccessible/missing id resolves to the same
  404 as a nonexistent one (no existence oracle).
- **Usage-ledger internals do not reach clients** — the only public counters are the denormalized
  `usage_count` / `fork_count` on the template.
- **Service-role-only writes** for templates + usage events; `authenticated` has no write GRANT.
  Live RLS proofs (member-sees / non-member + anon don't / no-write-grant / cascade / marketplace
  visibility / counter trigger) ran against the dev DB in CS-XT-4 and CS-XT-4B.

---

## 11. Feature flags and dark-launch state

| Flag | Default | Effect |
|---|---|---|
| `ENABLE_WORKFLOW_TEMPLATES` | **OFF** | All template routes 404; the `/templates` page shows the coming-soon panel. |
| `ENABLE_EXPORT_TIER_GATING` | **OFF** | Bulk export keeps today's any-member behavior; no tier/role tightening. |
| `ENABLE_BUSINESS_DOWNGRADE` | **OFF** | Gates the `?purpose=downgrade` export bypass (dark → 404). |

All three are default OFF. Routes and UI are **dormant/dark** in production until flipped. The
Templates nav item is present, but its route always resolves (coming-soon while the flag is off).
**Nothing has been git-pushed.**

---

## 12. UI behavior

- `/templates` SSR page: auth gate → (flag OFF) coming-soon panel; (flag ON) parallel server fetch
  of marketplace + the active account's own templates → client `TemplatesDashboard`.
- Dashboard: 4 source tabs with counts, client-side search (name/description), sort (Most used /
  Most forked / A–Z), responsive 1/2/3-col card grid, empty + toast states.
- Cards: official badge or creator chip, usage + fork counts, visibility chip (own), and Use / Fork
  actions — plus creator-only Publish/Unpublish + Delete on owned templates.
- **No fake/unsupported controls:** the design's preview drawer and from-scratch create modal were
  intentionally NOT shipped (no backing API); tier/limit errors surface the server's friendly
  message as a toast (no custom billing UI).

---

## 13. Deferred / known limitations

- **No import/upload from file** — export exists; import is net-new and unbuilt.
- **No rewards system** — the usage ledger is the foundation; payout/ranking is deferred.
- **No template moderation / reporting.**
- **No built-in official seed catalog** — the `official` source exists in schema, but no official
  templates are seeded.
- **No advanced Enterprise governance** (approval/private library).
- **No category / publishing controls** beyond basic visibility (private/public/unlisted).
- **No public anonymous marketplace** — authenticated-only at launch.
- **No ZIP / streaming bulk export** — 200-workflow cap with a typed 413.
- **No folder metadata in exports** — downgrade flattens folders, so none is preserved.
- **No template preview drawer** (design element not implemented — no backing data; marketplace DTO
  omits the definition).
- **No from-scratch create modal** (the only create path is from an existing workflow).
- **Feature flags still OFF** — the whole surface is dark until deliberately enabled.

---

## 14. Verification baseline

- **Newly measured this session (CS-XT-7A, `1f113e0db`):** `npx jest` → **16,673 passed / 0 failed**
  (159 skipped); `npm run typecheck` clean; `npm run lint` **0 errors** (18 pre-existing warnings);
  `npm run lint:structure` OK. The UI slice added **no migration**.
- **This closeout slice:** `npm run lint:structure` run this session → OK. Full Jest **not run**
  this session (docs-only; inherits the `1f113e0db` baseline above).
- **Migrations applied to the dev DB** (via `npm run db:push`, both confirmed applied this arc):
  - `20260616000000_workflow_templates.sql` (CS-XT-4)
  - `20260617000000_workflow_templates_marketplace.sql` (CS-XT-4B)
  - No unapplied migrations remain in this arc.

---

## 15. Recommended next tracks

1. **Official seed catalog + import (CS-XT-6 / CS-XT-8).** Seed a few `source='official'` templates
   and build the import/upload-from-file path (the inverse of export; shares the use/fork
   instantiation seam) so the marketplace has content and round-trips.
2. **"Save as template" from the builder/Workflows page.** Wire the existing
   create-from-workflow API into a real affordance (the Templates page intentionally has no
   from-scratch create) so users can populate their library.
3. **Enable the dark flags behind a staged rollout** — `ENABLE_WORKFLOW_TEMPLATES` first (read/use/
   fork), then `ENABLE_EXPORT_TIER_GATING` with the documented bulk-export role-tightening call-out.
4. **Rewards/ranking + moderation** on top of the usage ledger (contributor payouts, report/flag),
   once the marketplace has real public content.

---

## 16. Closeout confirmation

Docs-only. Nothing pushed.
**Doc path:** `docs/slices/phase-4/workflows/workflow-templates-marketplace-closeout.md`.
