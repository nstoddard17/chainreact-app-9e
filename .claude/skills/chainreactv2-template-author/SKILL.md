---
name: chainreactv2-template-author
description: Use whenever Marcus asks to add, audit, or maintain official ChainReact workflow templates in ChainReactV2, or to ship another official-template seed batch. This is the repeatable, now-locked operational procedure (established by seed batches 1 and 2): official templates are seeded through data-only, forward-only, idempotent SQL migrations as source='official', account_id NULL, created_by_user_id NULL, creator_display_name_snapshot='ChainReact', visibility='public', with empty node configs, validated by tests against the live discovery registry. No second catalog. No tokens, secrets, emails, or account/user/credential/provider-resource ids ever appear. Local-only commit, no push, no db:push.
---

# ChainReactV2 Official Template Author

The repeatable procedure for growing the official ChainReact workflow-template catalog in
safe seed batches. It encodes the pattern that seed batch 1 (5 templates) and batch 2 (45
templates, commit `4a4155758`) locked in, so a future session can add, audit, or maintain
official templates without re-deriving the rules.

This is the **operational "how to ship a batch" procedure**. It composes with
[`chainreactv2-official-template-builder`](../chainreactv2-official-template-builder/SKILL.md)
(the conceptual contract for what an official template is and why the spine is safe). When
that skill and this one overlap, this skill's concrete locked pattern (data-only migration,
empty configs, aggregate-all-seed-files tests) is the current reality. It also inherits
[`chainreactv2-local-slice-executor`](../chainreactv2-local-slice-executor/SKILL.md)
(local-only, inspect-before-change, reuse-before-add, real-backend-only) and the no-leak
defaults of [`chainreactv2-security-review`](../chainreactv2-security-review/SKILL.md).
When `CLAUDE.md` or an explicit Marcus instruction conflicts with this skill, they win.

> **Context first.** Before gathering repo/project context, follow
> [`chainreactv2-mcp-context`](../chainreactv2-mcp-context/SKILL.md): use the read-only MCP to
> orient (project memory, provider manifests, which provider/action/trigger ids are real), then
> read the actual files below. Repo files and the live registry are the source of truth, never a
> closeout doc.

---

## 1. Purpose

- Official, ChainReact-made workflow-template authoring (the "By ChainReact" marketplace tab).
- Repeatable seed batches that grow the catalog without new infrastructure or a second catalog.
- Templates that are marketplace-safe, account-portable, and fully credential-free: the graph
  shape is prebuilt and every account-specific field stays blank for the builder/setup UI to
  collect after use/fork.

---

## 2. Required startup reads

Read these before authoring or auditing anything (cite what you actually inspect):

- [`docs/PROJECT_MEMORY.md`](../../../docs/PROJECT_MEMORY.md) — current status + durable decisions.
- [`CLAUDE.md`](../../../CLAUDE.md) — root rules (V2 provider authoring rules, account model).
- [`docs/slices/phase-4/workflows/workflow-templates-marketplace-closeout.md`](../../../docs/slices/phase-4/workflows/workflow-templates-marketplace-closeout.md)
  — the marketplace/template spine + "official seed catalog" track.
- [`contracts/workflowTemplate.ts`](../../../contracts/workflowTemplate.ts) — `TemplateDefinitionSchema`
  (strict node/edge whitelist), `TemplateSource`, `TemplateVisibility`, the public-safe
  `MarketplaceTemplateSummary` (omits `accountId` / `createdByUserId`).
- [`contracts/workflowDefinition.ts`](../../../contracts/workflowDefinition.ts) — `WorkflowDefinitionSchema`
  graph invariants the `/use` route re-validates (≤1 trigger, edge endpoints exist, no
  self-loops, no duplicate `(from,to,label)` edges).
- [`repositories/workflowTemplates.ts`](../../../repositories/workflowTemplates.ts) — service-role
  repo; official = `account_id` NULL + `source='official'`; the marketplace listing filter
  `.or("source.eq.official,visibility.eq.public")`.
- [`services/workflows/templateManagement.ts`](../../../services/workflows/templateManagement.ts)
  — `createWorkflowFromTemplate` (use), `forkTemplateToAccount`, access resolver (official/public
  reachable by any authed user).
- Existing official-seed migrations: `supabase/migrations/*_seed_official_templates*.sql`
  (batch 1 `20260618000000_seed_official_templates.sql`; batch 2
  `20260708000000_seed_official_templates_batch_2.sql`). These ARE the catalog and the format
  template for a new batch.
- [`tests/unit/migrations/seedOfficialTemplates.test.ts`](../../../tests/unit/migrations/seedOfficialTemplates.test.ts)
  — static seed guard (aggregates all seed files; count, unique ids, no-leak, valid graphs,
  node allowlist).
- [`tests/structure/official-template-node-registration.test.ts`](../../../tests/structure/official-template-node-registration.test.ts)
  — validates every node `provider:type` against the LIVE discovery registry.
- [`tests/unit/services/workflows/templateUseFork.test.ts`](../../../tests/unit/services/workflows/templateUseFork.test.ts)
  — proves every seeded official instantiates a credential-free workflow.
- Discovery metadata + `*.meta.ts`: [`services/discovery/_registry.ts`](../../../services/discovery/_registry.ts)
  (`getActionMeta`, `getTriggerMeta`, `listActionMetasForProvider`, `listTriggerMetasForProvider`),
  [`services/discovery/_metaInventory.ts`](../../../services/discovery/_metaInventory.ts), and the
  per-provider `integrations/**/actions|triggers/**/*.meta.ts`. This is the ONLY source of real
  `provider:type` keys and field names.

---

## 3. Locked authoring pattern

The seed mechanism is **decided**. Do not re-litigate it or invent an alternative.

- **Use the existing template system only. Do not invent a second template catalog** (no static
  TS catalog, no parallel table, no JSON sidecar). Officials are real `workflow_templates` rows.
- **Add new officials through a forward-only, idempotent data-only SQL migration** under
  `supabase/migrations/`, named `<timestamp>_seed_official_templates_batch_N.sql`. Keep going
  with batches unless the repo later establishes a different official seed source.
- **Never edit a prior seed migration** (migration rule). A new batch is a new file.
- **Every row carries the platform-owned invariants:** `source='official'`, `account_id` NULL,
  `created_by_user_id` NULL, `creator_display_name_snapshot='ChainReact'`, `visibility='public'`,
  `schema_version=1` (mirrors `EXPORT_SCHEMA_VERSION`). The DB CHECK enforces official ⇒
  `account_id` NULL; a mismatch is rejected.
- **Use fixed UUIDs** continuing the existing sequence (batch 2 ended at
  `c0ffee00-0000-4000-8000-000000000032`). Fixed ids are what makes the seed idempotent.
- **Use `ON CONFLICT (id) DO NOTHING`** so a re-run or `db:push` replay is safe and never
  duplicates or mutates earlier rows.
- **Keep node configs empty `{}`.** Prefer safe partial templates: the graph shape (trigger +
  actions + edges) is the value; the builder collects account-specific fields after use/fork.
  Only set a config value if it is universally safe, non-secret, non-recipient-specific, and
  already accepted by the existing pattern (none have been, so the default is `{}`). If you ever
  set a non-empty config, its keys MUST be real field `name`s from the node's meta, and the
  node-registration test's config-key check enforces that.
- **Every `provider:type` must come from registered metadata.** Confirm each via `getActionMeta`
  (actions) / `getTriggerMeta` (triggers), or by extracting `key:` from the `*.meta.ts` files.
  A trigger node uses a registered TRIGGER key; an action node uses a registered ACTION key.
- **Never guess** provider ids, action/trigger types, config field names, or enum values. If it
  is not in the registry, it does not exist.
- **Skip unsupported ideas and document why** (missing provider/trigger/action), rather than
  fabricating a node to make a template "work." A smaller real template beats a fake rich one.
- Graph shape: exactly one trigger per template (the tests assert this); 1 to 3 nodes is the
  norm; lay out positions sanely (trigger at `{x:400,y:100}`, actions at `y:280`, `y:460`, ...).
  Each definition is a single-line `'{...}'::jsonb` literal (the test regex
  `/'(\{.*?\})'::jsonb/g` requires one line, no apostrophes inside the JSON).

---

## 4. Safety rules (no-leak, non-negotiable)

The definition and every surfaced DTO must contain **none** of:

- Tokens, secrets, API keys, OAuth values, refresh tokens, signing/webhook secrets,
  credential ids, integration ids.
- Account ids, user ids (`created_by_user_id` stays NULL), provider account ids/labels, emails.
- Provider-resource ids of any kind: Slack channel ids, Teams ids, Discord ids, Trello
  board/list/card ids, spreadsheet/sheet ids, calendar ids, file/folder ids, Stripe ids,
  Shopify ids, HubSpot ids, Notion ids, Airtable base/table ids, etc.
- Raw provider wire-format (no provider request bodies baked into config).
- **No hidden defaults** for recipient-visible, billing/payment, customer-facing, destructive,
  or high-blast-radius fields. Empty `{}` is the safe default; do not pre-fill these.
- No fake providers, fake actions, fake triggers, fake config keys, or fake UI assumptions.

The structural guarantee is: empty configs + real registered node ids + the strict
`TemplateDefinitionSchema` whitelist + the `MarketplaceTemplateSummary` projection that omits
account/user ids. The seed migration is hand-authored credential-free (there is no real workflow
to sanitize), and the tests prove no credential/identity material appears. Keep template names
and descriptions free of `@`, token shapes (`xox...`, `sk_...`, `whsec_`), and any id.

---

## 5. Batch workflow

1. **Inspect the current catalog + tests.** Read every `*_seed_official_templates*.sql` and the
   three template tests; note the last used UUID and which categories already exist.
2. **Pick a focused category batch.** The catalog spans Sales/CRM, Ecommerce/Payments,
   Marketing/Growth, Team operations, Project/Engineering, File/Document, Personal productivity.
   Aim for breadth across real providers; avoid near-duplicate graphs.
3. **Extract registered `provider:type` keys from live metadata** (grep `key:` across
   `integrations/**/*.meta.ts`, and confirm trigger-vs-action by folder/meta). Build your
   working list of real keys before drafting.
4. **Draft templates by category**, each as a one-line `'{...}'::jsonb` definition with empty
   configs, fixed UUIDs continuing the sequence, and `source='official' / 'public' / 'ChainReact'`.
5. **Validate each graph shape**: exactly one trigger, edges reference existing node ids, no
   self-loops, no duplicate edges. (The tests re-check, but draft it right.)
6. **Add/update tests if coverage must expand.** Keep the seed + node-registration tests
   aggregating ALL `*_seed_official_templates*.sql` files (do not hard-code one filename). Expand
   the explicit node allowlist in `seedOfficialTemplates.test.ts` to include any new
   `provider/type` pairs, and bump the minimum-count assertion to match the new total.
7. **Run focused tests first**, then typecheck, structure lint, migration lint (see section 6).
8. **Commit locally only after verification passes.** Clear `feat(templates): ...` message.
9. **Do not push, deploy, or `db:push` unless Marcus explicitly asks.** The migration is
   forward-only and idempotent, so a later approved `db:push` seeds it safely.

---

## 6. Required verification

Run from the ChainReactV2 repo, focused first then broad:

- `npx jest tests/unit/migrations/seedOfficialTemplates.test.ts` (seed static guard).
- `npx jest tests/structure/official-template-node-registration.test.ts` (live-registry node check).
- `npx jest tests/unit/services/workflows/templateUseFork.test.ts` (credential-free use/fork).
- Relevant marketplace/template tests:
  `npx jest tests/unit/repositories/workflowTemplates.test.ts tests/unit/services/workflows/createTemplateFromWorkflow.test.ts tests/unit/services/workflows/templateManagement.test.ts tests/unit/services/workflows/templateReplace.test.ts tests/unit/features/templates`.
- `npm run typecheck`.
- `npm run lint:structure`.
- `npm run lint:migrations`.
- Broader `npm run lint` / full `npm test` only when the touched files justify it.

Report results honestly: if a command was not run, say so; never claim a green that you did not
observe.

---

## 7. Closeout report format

```
**Commit:** <hash> (local, not pushed)
**Files changed:** <list, grouped by area>
**Templates added this batch:** <count>
**Total official templates after batch:** <count>
**Categories covered:** <list>
**Providers used:** <list of provider:type or providers>
**Skipped ideas + reasons:** <idea → missing provider/trigger/action; NONE invented>
**Tests / verification run:** <exact commands + pass/fail>
**Pre-existing unrelated failures:** <list, or none>
**Push status:** Local only. Nothing pushed, no deploy, no db:push.
```

---

## Hard boundaries

- **Do not create fake provider / action / trigger ids**, config keys, enum values, or node shapes.
- **Do not invent a second catalog** or change the seed mechanism.
- **Do not modify the template schema** (`contracts/workflowTemplate.ts` / the table) unless the
  locked pattern genuinely cannot be expressed without it, and then only with Marcus's approval.
- **Do not add credentials** or any account/provider-resource detail to a template.
- **Do not add UI** unless Marcus asks (the official badge already keys off `source`).
- **Do not `git push`, deploy, or run `db:push`** unless Marcus explicitly asks.
- **Do not touch V1** (`chainreact-app-9e`); this skill is ChainReactV2-only.

See [checklist.md](../chainreactv2-official-template-builder/checklist.md) (in the builder skill)
for the shared pre-commit no-leak gate.
