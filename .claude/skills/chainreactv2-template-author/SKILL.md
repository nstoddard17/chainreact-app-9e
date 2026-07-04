---
name: chainreactv2-template-author
description: Use whenever Marcus asks to add, audit, or maintain official ChainReact workflow templates in ChainReactV2, or to ship another official-template seed batch. The repeatable, locked operational procedure (established by seed batches 1–4, 90 templates total): official templates are seeded through data-only, forward-only, idempotent SQL migrations as source='official', account_id NULL, created_by_user_id NULL, creator_display_name_snapshot='ChainReact', visibility='public'. Favor complete 5–8 node business-process templates. Node configs are empty by default, OR carry safe variable-only portable prewiring ({{trigger.x}} / {{nodeId.field}}) ONLY when verified against the declared trigger payloadShape / action OutputMeta via the canonical resolver. No second catalog. No tokens, secrets, emails, or account/user/credential/provider-resource ids ever appear; marketplace cards/details hide raw {{...}}. Local-only commit, no push, no db:push.
---

# ChainReactV2 Official Template Author

The repeatable procedure for growing the official ChainReact workflow-template catalog in
safe seed batches. It encodes the pattern that seed batches 1–4 locked in (5 + 45 + 25 + 15 =
**90 official templates**; batch 2 commit `4a4155758`, batch 4 the complex-template batch), so a
future session can add, audit, or maintain official templates without re-deriving the rules.

This is the **operational "how to ship a batch" procedure**. It composes with
[`chainreactv2-official-template-builder`](../chainreactv2-official-template-builder/SKILL.md)
(the conceptual contract for what an official template is and why the spine is safe). When
that skill and this one overlap, this skill's concrete locked pattern (data-only migration,
empty-or-prewired configs, aggregate-all-seed-files tests) is the current reality. It also inherits
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
  shape is prebuilt, account-specific fields stay blank for the builder/setup UI to collect after
  use/fork, and any prewired config value is a **verified, portable variable reference or a safe
  non-account-specific static label** — never seeded account data.
- Favor **complete business-process templates** (capture → enrich → record → hand off → notify)
  over shallow two-node integration demos. See §4.

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
- [`contracts/actionMeta.ts`](../../../contracts/actionMeta.ts) + [`contracts/triggerMeta.ts`](../../../contracts/triggerMeta.ts)
  — `OutputMeta` (action `outputs[]`) and trigger `payloadShape[]`: the **only** authority for which
  `{{...}}` reference paths exist. Prewiring references MUST resolve against these.
- [`repositories/workflowTemplates.ts`](../../../repositories/workflowTemplates.ts) — service-role
  repo; official = `account_id` NULL + `source='official'`; the marketplace listing filter
  `.or("source.eq.official,visibility.eq.public")`.
- [`services/workflows/templateManagement.ts`](../../../services/workflows/templateManagement.ts)
  — `createWorkflowFromTemplate` (use), `forkTemplateToAccount`, access resolver (official/public
  reachable by any authed user).
- Existing official-seed migrations: `supabase/migrations/*_seed_official_templates*.sql`
  (batch 1 `20260618000000`; batch 2 `20260708000000`; batch 3 `20260709000000`; batch 4
  `20260710000000` — the complex 5–8 node batch). These ARE the catalog and the format template.
- Prewiring migrations (variable-only portable config, UPDATE-only): `*_prewire_official_templates*.sql`
  (`20260711000000` prewired the first 3 complex templates, commit `2bcf41575`;
  `20260712000000_prewire_official_templates_batch_4_remaining.sql` prewired the remaining 12,
  commit `e2352d212`). These are the **format template for any future prewiring** — see §5 and §7.
- [`tests/unit/migrations/seedOfficialTemplates.test.ts`](../../../tests/unit/migrations/seedOfficialTemplates.test.ts)
  — static seed guard (aggregates all seed files; count, unique ids, no-leak, valid graphs,
  node allowlist).
- [`tests/unit/migrations/prewireOfficialTemplates.test.ts`](../../../tests/unit/migrations/prewireOfficialTemplates.test.ts)
  + [`tests/unit/migrations/prewireOfficialTemplatesBatch4Remaining.test.ts`](../../../tests/unit/migrations/prewireOfficialTemplatesBatch4Remaining.test.ts)
  — the prewiring guards (guarded UPDATE-only, real meta fields, declared-output paths, resolver
  resolves every expression, no leaks, account fields blank, card hides `{{...}}`).
- [`tests/structure/official-template-node-registration.test.ts`](../../../tests/structure/official-template-node-registration.test.ts)
  — validates every node `provider:type` against the LIVE discovery registry.
- [`tests/unit/services/workflows/templateUseFork.test.ts`](../../../tests/unit/services/workflows/templateUseFork.test.ts)
  — proves every seeded official instantiates a credential-free workflow.
- Variable + resolver helpers used to VERIFY prewiring (never guess a path):
  [`core/workflows/variableReferences.ts`](../../../core/workflows/variableReferences.ts) (`parseReferences`),
  [`workflow-engine/variables/resolveValue.ts`](../../../workflow-engine/variables/resolveValue.ts)
  (`resolveStrict` — the canonical resolver),
  [`core/workflows/configFieldClassification.ts`](../../../core/workflows/configFieldClassification.ts)
  (the builder's prefilled-vs-needs-setup classifier), and
  [`core/workflows/templateCardMeta.ts`](../../../core/workflows/templateCardMeta.ts)
  (`deriveTemplateCardMeta` — proves cards/details never expose raw `{{...}}`).
- Discovery metadata + `*.meta.ts`: [`services/discovery/_registry.ts`](../../../services/discovery/_registry.ts)
  (`getActionMeta`, `getTriggerMeta`, `listActionMetasForProvider`, `listTriggerMetasForProvider`),
  [`services/discovery/_metaInventory.ts`](../../../services/discovery/_metaInventory.ts), and the
  per-provider `integrations/**/actions|triggers/**/*.meta.ts`. This is the ONLY source of real
  `provider:type` keys, field names, action `outputs[]`, and trigger `payloadShape[]`.

---

## 3. Locked authoring pattern

The seed mechanism is **decided**. Do not re-litigate it or invent an alternative.

- **Use the existing template system only. Do not invent a second template catalog** (no static
  TS catalog, no parallel table, no JSON sidecar). Officials are real `workflow_templates` rows.
- **Add new officials through a forward-only, idempotent data-only SQL migration** under
  `supabase/migrations/`, named `<timestamp>_seed_official_templates_batch_N.sql`. Keep going
  with batches unless the repo later establishes a different official seed source.
- **Never edit a prior seed (or prewire) migration** (migration rule). A new batch / prewiring is a
  new file. See §7.
- **Every row carries the platform-owned invariants:** `source='official'`, `account_id` NULL,
  `created_by_user_id` NULL, `creator_display_name_snapshot='ChainReact'`, `visibility='public'`,
  `schema_version=1` (mirrors `EXPORT_SCHEMA_VERSION`). The DB CHECK enforces official ⇒
  `account_id` NULL; a mismatch is rejected.
- **Use fixed UUIDs** continuing the existing sequence (`c0ffee00-0000-4000-8000-...`; batch 4
  ended at `...00000000005a`). Fixed ids are what makes the seed idempotent.
- **Use `ON CONFLICT (id) DO NOTHING`** so a re-run or `db:push` replay is safe and never
  duplicates or mutates earlier rows.
- **Node configs: empty `{}` by default, OR safe variable-only prewiring per §5.** The graph shape
  (trigger + ordered actions + edges) is always the core value; account-specific fields stay blank
  for the builder to collect. A config value may be non-empty ONLY when it is (a) a verified
  portable `{{...}}` variable reference (§5), or (b) a universally safe, non-secret,
  non-account-specific static label (an internal artifact title / note body / channel text). Any
  config key MUST be a real field `name` from the node's meta — the prewire + node-registration
  tests enforce this.
- **Every `provider:type` must come from registered metadata.** Confirm each via `getActionMeta`
  (actions) / `getTriggerMeta` (triggers), or by extracting `key:` from the `*.meta.ts` files.
  A trigger node uses a registered TRIGGER key; an action node uses a registered ACTION key.
- **Never guess** provider ids, action/trigger types, config field names, enum values, or variable
  reference paths. If it is not in the registry / declared output contract, it does not exist.
- **Skip unsupported ideas and document why** (missing provider/trigger/action, or no safe
  mapping), rather than fabricating a node or a variable path to make a template "work." A smaller
  real template beats a fake rich one.
- Graph shape: exactly one trigger per template (the tests assert this). Aim for **5–8 nodes for a
  complete business process** (§4); simple integration examples may be smaller. Lay out positions
  sanely (trigger at `{x:400,y:100}`, actions at `y:260`, `y:420`, ...). Each definition is a
  single-line `'{...}'::jsonb` literal (the test regex requires one line, no apostrophes inside the
  JSON).

---

## 4. Template quality standard

Quality is "does this model a real outcome a user wants," not "how many integrations did I wire."

- **Prefer complete business-process templates over shallow integration demos.** A template should
  carry a recognizable end-to-end process: capture → enrich → record → hand off → notify.
- **Complex templates should usually be 5–8 nodes when the process justifies it.** Batch 4 is the
  reference set (e.g. "Support escalation from email", "Lead intake to sales handoff", "Customer
  onboarding"). Don't pad to hit a number, and don't cram unrelated steps to look rich.
- **Every node must contribute to the outcome.** If a step can be removed without weakening the
  process, remove it.
- **No padding with redundant notifications.** One Slack/Teams/email notification at the natural
  point in the flow — not a notify after every step.
- **No duplicate tracker fan-out** (e.g. create a Trello card AND a monday item AND a Notion page
  for the same record) unless there is a real, stated business reason.
- **Skip ideas that need capabilities the engine/registry doesn't support** — branching, loops,
  delays, conditions, fan-in/fan-out, or any invented output path. Document them as skipped (§7),
  never fake them with a node that doesn't do it.
- **Breadth, not near-duplicates.** Avoid templates whose graph is a trivial relabel of an existing
  one. Cover real provider combinations across the catalog's categories.

---

## 5. Variable-only prewiring policy

Official template configs MAY carry portable variable expressions so a complex template lands
substantially wired — but ONLY under these rules. This is what `20260711000000` /
`20260712000000` implemented; their migrations + tests are the canonical example.

- **Allowed expressions:** credential-free `{{trigger.<path>}}` and `{{<upstreamNodeId>.<path>}}`
  references, plus safe non-account-specific static labels. Example safe references:
  `{{trigger.subject}}`, `{{a1.email}}`, `{{a3.boardId}}`.
- **Every expression MUST be verified against the declared output contract** — the trigger's
  `payloadShape[]` or the upstream action's `OutputMeta` `outputs[]`. The first path segment must
  be a declared output of the referenced node.
- **Use the canonical resolver to validate.** A reference is only safe if `resolveStrict`
  (`workflow-engine/variables/resolveValue.ts`) resolves it against representative upstream outputs
  with no `MissingVariableError`. Tokenize with `parseReferences`. **Never guess a path.**
- **Never seed a literal account-specific provider resource ID.** No literal channel, board, list,
  group, folder, calendar, spreadsheet, range, repo, database, audience, pipeline/stage, property,
  team, order, customer, payment, or product id.
- **Never seed** credential ids, integration ids, account ids, user ids, emails, or provider
  account ids — as literals anywhere (config, name, or description).
- **Variable references to a provider object ID are allowed ONLY when** the id is *produced by an
  upstream node* AND *immediately required by the downstream action that consumes it*. Canonical
  examples: monday `create_subitem.boardId`/`parentItemId` ← the parent `create_item` outputs;
  google-drive `get_file_metadata.fileId` ← the `file_changed` trigger's declared `fileId`. Never
  use a variable reference as a shortcut around a missing output contract.
- **Account-resource selectors stay blank** (the user picks them after use/fork). The builder now
  renders a "Choose your &lt;field&gt;" hint for these (commit `9edd9eead`) — blank is correct, not a
  gap.
- **Recipient-visible fields stay blank** unless there is a verified, safe, internal-only reason
  (e.g. an internal note/summary body or an internal channel message). Never prefill customer-facing
  email/message bodies. Email drafts (`create_draft`) stay blank.
- **Consent / status / notify / visibility toggles stay blank** unless explicitly safe and
  non-customer-facing (e.g. Mailchimp `add_subscriber.status` is a consent field — never default it;
  Calendar `sendNotifications` / guest-visibility toggles stay blank).
- **Static-label defaults (D)** are allowed only for safe internal artifact text: item/card/document
  titles, task subjects, internal note bodies, internal channel messages. They must be generic and
  account-agnostic (no names, ids, emails).
- **Document unsupported mappings as `U` gaps — never force them.** When an upstream output is
  opaque (e.g. Shopify `body` / Stripe `data` carry no flat declared scalar), or a field is a
  consent/account selector with no safe value, leave it blank and record the gap (§6, §7).

---

## 6. Complex / prewired template audit table

For every complex and/or prewired template, produce a per-template audit so the safety reasoning is
explicit and reviewable. Use this record format (one block per template; a markdown table with these
columns is equivalent):

| Field | Content |
|-------|---------|
| **Title** | Template name. |
| **Outcome** | The end-to-end business result in one line. |
| **Trigger** | `provider:type` + why it starts the process. |
| **Ordered actions** | `a1..aN` as `provider:type`, in execution order. |
| **Node count** | Total nodes (trigger + actions). |
| **Required fields** | Per node, the required field names (from meta). |
| **Classification** | Each required field tagged **A / V / D / U** (legend below). |
| **Mappings added** | Exact `field = {{path}}` (V) and `field = "label"` (D) values seeded. |
| **Fields left blank** | The A/U fields intentionally left empty. |
| **Unsupported contract gaps** | The U fields + WHY no safe mapping exists. |
| **Safety notes** | Confirmation: no literal ids/emails/secrets; recipient/consent/visibility blank; any provider-object-id reference is upstream-produced + immediately required. |

**Classification legend:**
- **A** = account / resource / user-selected field → leave blank.
- **V** = safe variable-derived field, verified against the declared output contract.
- **D** = universal non-secret static default (safe internal label).
- **U** = unsupported / unmappable contract gap → leave blank + document.

Coverage rule: every complex template in a batch must be either safely prewired or explicitly
documented with its U gaps. (The batch-4 prewiring closeouts are the worked example.)

---

## 7. Migration rules

Two distinct migration shapes — never mix them, never edit an applied one.

- **New templates → INSERT-only seed migration.** `<timestamp>_seed_official_templates_batch_N.sql`,
  `INSERT ... ON CONFLICT (id) DO NOTHING`, fixed UUIDs, all platform invariants (§3). Data-only.
- **Prewiring already-applied official templates → a NEW forward-only, guarded UPDATE migration.**
  `<timestamp>_prewire_official_templates*.sql`. Because the rows were already inserted (and the
  insert migration is applied), you cannot edit the insert — you add a new file that UPDATES only
  the `definition` jsonb.
  - **Guard every statement** by `id = '<fixed official UUID>' AND source = 'official' AND
    account_id IS NULL`. This makes it impossible to touch `source='user'` / community templates.
  - SET the `definition` to a **fixed** value so the UPDATE is idempotent (re-run / `db:push` replay
    converges to the same state).
- **Never edit an already-applied migration** (seed or prewire). Roll forward with a new file.
- **Preflight before `db:push`** — confirm the migration is:
  - UPDATE-only (for prewiring) or INSERT-only (for seeding); no other DML.
  - guarded to fixed official UUIDs, `source='official'`, `account_id IS NULL` (prewiring).
  - data-only: **no DDL, no RLS / GRANT / POLICY changes, no schema change.**
  - idempotent; no `UPDATE` without an id guard.
- **Apply with `npm run db:push` ONLY when Marcus explicitly asks** AND the preflight above passes.
  `db:push` is never automatic in this skill.

---

## 8. Safety rules (no-leak, non-negotiable)

The definition and every surfaced DTO must contain **none** of:

- Tokens, secrets, API keys, OAuth values, refresh tokens, signing/webhook secrets,
  credential ids, integration ids.
- Account ids, user ids (`created_by_user_id` stays NULL), provider account ids/labels, emails.
- Provider-resource ids of any kind: Slack channel ids, Teams ids, Discord ids, Trello
  board/list/card ids, spreadsheet/sheet ids, calendar ids, file/folder ids, Stripe ids,
  Shopify ids, HubSpot ids, Notion ids, Airtable base/table ids, etc. — **as literals**. The ONLY
  id-shaped values allowed are upstream-produced variable references per §5.
- Raw provider wire-format (no provider request bodies baked into config).
- **No hidden defaults** for recipient-visible, billing/payment, customer-facing, consent, or
  high-blast-radius fields (§5). Empty is the safe default; do not pre-fill these.
- No fake providers, fake actions, fake triggers, fake config keys, fake variable paths, or fake UI
  assumptions.

The structural guarantee is: registered node ids + configs that are empty or verified-safe + the
strict `TemplateDefinitionSchema` whitelist + the `MarketplaceTemplateSummary` projection that omits
account/user ids + `deriveTemplateCardMeta` stripping `{{...}}` from cards/details. The migrations
are hand-authored credential-free, and the tests prove no credential/identity material appears and
no raw `{{...}}` reaches a marketplace surface. Keep template names and descriptions free of `@`,
token shapes (`xox...`, `sk_...`, `whsec_`), and any id.

---

## 9. Batch workflow

1. **Inspect the current catalog + tests.** Read every `*_seed_official_templates*.sql` and
   `*_prewire_official_templates*.sql`, plus the template tests; note the last used UUID and which
   categories already exist.
2. **Pick a focused category batch.** The catalog spans Sales/CRM, Ecommerce/Payments,
   Marketing/Growth, Team operations, Project/Engineering, File/Document, Personal productivity.
   Aim for **complete business processes** (§4) and breadth across real providers; avoid
   near-duplicate graphs.
3. **Extract registered `provider:type` keys AND output contracts from live metadata** (grep `key:`
   across `integrations/**/*.meta.ts`; read action `outputs[]` / trigger `payloadShape[]` for any
   field you intend to prewire). Build your working list of real keys + outputs before drafting.
4. **Draft templates by category**, each as a one-line `'{...}'::jsonb` definition, fixed UUIDs
   continuing the sequence, and `source='official' / 'public' / 'ChainReact'`. Default configs to
   `{}`; add variable-only prewiring (§5) only where verified.
5. **Validate each graph shape**: exactly one trigger, edges reference existing node ids, no
   self-loops, no duplicate edges. (The tests re-check, but draft it right.)
6. **If prewiring, build the §6 audit** and verify every `{{...}}` with `parseReferences` +
   `resolveStrict` against the declared outputs. Prewiring of already-applied rows goes in a
   separate guarded UPDATE migration (§7).
7. **Add/update tests** (§10). Keep the seed + node-registration tests aggregating ALL
   `*_seed_official_templates*.sql` files (never hard-code one filename); extend the node allowlist
   for any new `provider/type` pairs; **deliberately bump the minimum-count floor** to the new total.
   For prewiring, extend/clone the prewire test for the new migration.
8. **Run focused tests first**, then typecheck, structure lint, migration lint (see §10).
9. **Commit locally only after verification passes.** Clear `feat(templates): ...` message.
10. **Do not push, deploy, or `db:push` unless Marcus explicitly asks.** Migrations are forward-only
    and idempotent, so a later approved `db:push` applies them safely (preflight per §7 first).

---

## 10. Required verification

Run from the ChainReactV2 repo, focused first then broad. Pick the set that proves the change:

- `npx jest tests/unit/migrations/seedOfficialTemplates.test.ts` — seed static guard (count floor,
  unique ids, no-leak, valid graphs, **`provider:type` registration** allowlist).
- `npx jest tests/structure/official-template-node-registration.test.ts` — every node `provider:type`
  against the LIVE discovery registry.
- `npx jest tests/unit/services/workflows/templateUseFork.test.ts` — **instantiation / use / fork**
  produces a credential-free workflow.
- For prewiring: `npx jest tests/unit/migrations/prewireOfficialTemplates.test.ts
  tests/unit/migrations/prewireOfficialTemplatesBatch4Remaining.test.ts` (or the new prewire test) —
  guarded UPDATE-only, **variable-reference paths validated against metadata**, **canonical resolver
  resolves every expression**, **no-leak**, account-resource / recipient / consent fields blank, and
  **marketplace card/detail hides raw `{{...}}`**.
- Builder setup-UX coverage (when prewiring lands in the builder):
  `npx jest tests/unit/core/workflows/configFieldClassification.test.ts
  tests/unit/features/workflow-builder/config-modal/fields` — prefilled-vs-required classification +
  "Pre-filled from earlier step" / "Choose your &lt;field&gt;" hints render correctly.
- Relevant marketplace/template tests:
  `npx jest tests/unit/repositories/workflowTemplates.test.ts tests/unit/services/workflows/createTemplateFromWorkflow.test.ts tests/unit/services/workflows/templateManagement.test.ts tests/unit/services/workflows/templateReplace.test.ts tests/unit/features/templates tests/unit/core/workflows/templateCardMeta.test.ts`.
- `npm run typecheck`.
- `npm run lint:structure`.
- `npm run lint:migrations`.
- Broader `npm run lint` / full `npm test` only when the touched files justify it.

Whenever a batch changes the catalog size, **update the minimum-count floors deliberately** (and say
so) — never let a stale floor pass a smaller-than-intended catalog.

Report results honestly: if a command was not run, say so; never claim a green that you did not
observe. Report unrelated parallel-session failures separately.

---

## 11. When to stop adding templates

Raw template count is not the goal — a usable catalog is. **Stop adding templates and instead invest
in setup UX, prewiring, discovery, or matching** when the catalog's usefulness is limited by the
setup experience, discoverability, or how well templates match user intent — not by how many
templates exist. A smaller catalog of complete, well-prewired, easy-to-finish templates beats a
larger one of shallow demos users abandon at setup. Surface this to Marcus rather than reflexively
shipping another batch.

---

## 12. Closeout report format

```
**Commit:** <hash> (local, not pushed)
**Files changed:** <list, grouped by area>
**Templates added this batch:** <count>            (omit for a prewiring-only slice)
**Templates prewired this slice:** <count>          (for prewiring slices)
**Total official templates after batch:** <count>
**Categories covered:** <list>
**Providers used:** <list of provider:type or providers>
**Per-template audit:** <the §6 table for complex / prewired templates>
**Variable/static mappings added:** <field = {{path}} (V) and field = "label" (D)>
**Fields left blank:** <account-resource / recipient / consent fields>
**Unsupported contract gaps (U):** <field → why no safe mapping; NONE invented>
**Skipped ideas + reasons:** <idea → missing provider/trigger/action/capability; NONE faked>
**Tests / verification run:** <exact commands + pass/fail>
**Pre-existing unrelated failures:** <list, or none>
**db:push result:** <applied + output, only if Marcus asked and preflight passed; else "not run">
**Push status:** Local only. Nothing pushed, no deploy.
```

---

## Hard boundaries

- **Do not create fake provider / action / trigger ids**, config keys, enum values, node shapes, or
  variable reference paths.
- **Do not invent a second catalog** or change the seed mechanism.
- **Do not modify the template schema** (`contracts/workflowTemplate.ts` / the table) unless the
  locked pattern genuinely cannot be expressed without it, and then only with Marcus's approval.
- **Do not add credentials** or any account/provider-resource detail (literal) to a template.
- **Do not seed a variable reference as a shortcut around a missing output contract** — verify every
  path against `payloadShape` / `OutputMeta` first (§5).
- **Do not add UI** unless Marcus asks (the official badge already keys off `source`).
- **Do not edit an already-applied migration.** Roll forward with a new guarded file (§7).
- **Do not `git push`, deploy, or run `db:push`** unless Marcus explicitly asks.

See [checklist.md](../chainreactv2-official-template-builder/checklist.md) (in the builder skill)
for the shared pre-commit no-leak gate.
