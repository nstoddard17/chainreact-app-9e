# 4.API-KEYS-RUN-HISTORY-1 — API Key Trigger Source Plan

**Type:** Planning / design only. **No source, migrations, tests, or UI changes.**
Nothing pushed.
**Date:** 2026-06-05
**Branch:** `builder-ui-v1-audit-1`
**Arc:** API-KEYS-FOUNDATION (FK-1…FK-4) + RATE-LIMIT-1 (shipped) → **this plan** →
implementation slice (future).

**Source of truth (verified current state):**
[engineTypes.ts](../../../services/execution/engineTypes.ts) (`RunTriggerSource`, line 76) ·
[workflowRuns.ts](../../../repositories/workflowRuns.ts) (`WorkflowRunTriggeredBy`, `WorkflowRunRecord`, `RecordRunInput`, `rowToRecord`, `recordRun`) ·
[20260523000000_workflow_runs_test_mode.sql](../../../supabase/migrations/20260523000000_workflow_runs_test_mode.sql) (the `workflow_runs_triggered_by_chk` CHECK) ·
[20260530000001_account_id_foundation.sql](../../../supabase/migrations/20260530000001_account_id_foundation.sql) (`triggered_by_user_id` column, line 50) ·
[enqueue.ts](../../../services/execution/enqueue.ts) (`EnqueueRunInput`) ·
[engine.ts](../../../services/execution/engine.ts) · [runPersistence.ts](../../../services/execution/runPersistence.ts) ·
[trigger route](../../../app/api/v1/workflows/[workflowId]/trigger/route.ts) ·
[verify.ts](../../../services/apiKeys/verify.ts) · [accountApiKeys.ts](../../../repositories/accountApiKeys.ts) (`ApiKeyVerificationRecord`) ·
[app/runs/_shared.ts](../../../app/runs/_shared.ts) (`toRunListItem`) · [account_api_keys migration](../../../supabase/migrations/20260607000000_account_api_keys.sql).

> **Headline:** FK-4 enqueues API-key-triggered runs as `triggeredBy: "manual"` with
> `triggeredByUserId: null`, because the `RunTriggerSource` union + the
> `workflow_runs_triggered_by_chk` CHECK do not yet include `api_key`. This plan
> defines a safe, additive path to make API-key runs **first-class** in run history:
> add `api_key` to the CHECK + the two TS unions, store **non-secret attribution**
> (`triggered_by_api_key_id` nullable FK + a `triggered_by_api_key_prefix` snapshot),
> thread it from the trigger route → engine → persistence, and surface "Triggered via
> API key · `crk_live_…`" in the runs UI. **No billing change. No raw key / hash /
> OAuth-token exposure. Keep `triggered_by_user_id` null.**

---

## 1. Context

RATE-LIMIT-1 made the public trigger endpoint production-ready (durable limiter); the
last gap for **observability** is that API-key runs are indistinguishable from human
manual runs in history. FK-4 deliberately reused `"manual"` to avoid a schema change
mid-arc (the FK-4 commit + closeout both flagged this as the follow-up). This plan is
that follow-up, scoped to run-history attribution only.

---

## 2. Verified current state (answers to the planning questions)

### Q1. Where is `RunTriggerSource` defined?
[`services/execution/engineTypes.ts:76`](../../../services/execution/engineTypes.ts) —
a **closed TS union**: `"manual" | "test" | "webhook" | "scheduled" | "retry" |
"unknown"`. Re-exported through `engine.ts`; consumed by `EnqueueRunInput.triggeredBy`
([enqueue.ts](../../../services/execution/enqueue.ts)). A **second, parallel** union
`WorkflowRunTriggeredBy` lives in
[`repositories/workflowRuns.ts`](../../../repositories/workflowRuns.ts) (with a comment
"Adding a new source = migration + this union edit"). Both must gain `api_key`.

### Q2. Where is the `workflow_runs.triggered_by` CHECK constraint defined?
[`supabase/migrations/20260523000000_workflow_runs_test_mode.sql:22-31`](../../../supabase/migrations/20260523000000_workflow_runs_test_mode.sql)
— constraint `workflow_runs_triggered_by_chk`,
`CHECK (triggered_by IN ('manual','test','webhook','scheduled','retry','unknown'))`.
The migration comment states the expansion path explicitly: *"Adding new sources …
is a migration that drops + recreates this constraint with the expanded set."* No
later migration redefines it.

### Q3. What migrations are needed to add `'api_key'`?
**One** forward-only migration (e.g. `20260609000000_workflow_runs_api_key_source.sql`):
1. `ALTER TABLE public.workflow_runs DROP CONSTRAINT workflow_runs_triggered_by_chk;`
2. re-`ADD CONSTRAINT … CHECK (triggered_by IN (…, 'api_key'));`
3. `ADD COLUMN triggered_by_api_key_id uuid REFERENCES public.account_api_keys(id) ON DELETE SET NULL;`
4. `ADD COLUMN triggered_by_api_key_prefix text;`
   (optional) `ADD COLUMN triggered_by_api_key_name text;` — see Q6.
- New columns are **nullable, default NULL** → existing rows are unaffected, **no
  backfill**. `workflow_runs` already has RLS; no new policy is required (additive
  columns inherit the table's existing policies). The `supabase/migrations` leaf-count
  exemption from RATE-LIMIT-1 means this new file won't trip `lint:structure`.

### Q4. Should `workflow_runs` store `api_key_id`, `api_key_prefix`, or neither?
**Both** (recommended). `triggered_by_api_key_id` (nullable FK) gives live, joinable
attribution; `triggered_by_api_key_prefix` is a **non-secret snapshot** that survives
the key being revoked or deleted (when the FK goes NULL). The prefix is already a
public display token (shown in the management UI), so storing it leaks nothing.

### Q5. Should `api_key_id` be a nullable FK to `account_api_keys`?
**Yes** — `uuid REFERENCES public.account_api_keys(id) ON DELETE SET NULL`. Nullable
because (a) non-API runs have no key, and (b) a deleted key must not cascade-delete or
block run-history rows. `ON DELETE SET NULL` keeps the run row; the prefix snapshot
(Q6) preserves the human-readable attribution.

### Q6. If a key is revoked/deleted, should run history preserve a prefix/name snapshot?
**Yes — snapshot the prefix at enqueue time** (this is the core reason the run row
stores its own `triggered_by_api_key_prefix` rather than always joining the live key
row). Revocation is a soft delete (`revoked_at`) so the FK still resolves, but a future
hard delete would NULL the FK — the snapshot keeps history honest either way.
**Name snapshot is optional**: names are mutable (a key can be renamed), so a run-time
snapshot is the *honest* record of what the key was called when it fired — but it adds
a column and a (rare) staleness question vs. the live name. **Recommend: ship prefix
snapshot now; treat name snapshot as an open decision (§5).**

### Q7. What should run history show?
"**Triggered via API key**" + the **prefix** (e.g. `crk_live_AbCd1234`) as the
attribution token, mirroring how human runs show an actor. If the name snapshot is
adopted, show "Triggered via API key · *CI deploy* (`crk_live_AbCd1234`)". The prefix
is non-secret and already user-visible in the management UI.

### Q8. What should be hidden?
The **raw key**, the **`key_hash`**, and any **OAuth/integration tokens** — none of
which are on the run path today and none of which this feature introduces. Only the
non-secret prefix (+ optional name) is surfaced.

### Q9. Should API-key runs have `triggered_by_user_id` null?
**Yes — keep it null.** There is no human actor; conflating an API key with a user id
would be wrong and could mis-attribute. The new `triggered_by_api_key_id` /
`_prefix` columns carry the attribution instead. (`triggered_by_user_id` is a nullable
FK to `auth.users`; webhook/cron runs already use NULL.)

### Q10. How should API-key usage interact with billing/task usage?
**No change.** Billing stays in-engine via `executionBillingGate`, billed to the
**workflow's owning account**, never an actor (there is none). Adding a source value +
attribution columns does not touch deduction, the gate, or the billing event shape. A
parity test must assert API-key runs bill identically to manual runs (1 task, same
account).

### Q11. What tests are needed?
- **Migration static guard:** CHECK now includes `'api_key'`; the two new columns
  exist with the FK `ON DELETE SET NULL`; nullable/no-backfill.
- **Trigger route:** an allowed API-key trigger enqueues with `triggeredBy:'api_key'`,
  `triggeredByApiKeyId`, `triggeredByApiKeyPrefix` (snapshot), and
  `triggeredByUserId: null`.
- **enqueue/engine/persistence:** the new fields thread through to `recordRun` and the
  inserted row.
- **Repo round-trip:** `rowToRecord` maps the new columns; `WorkflowRunRecord` /
  display projection carry them.
- **Run-history display:** `toRunListItem` / the UI renders "Triggered via API key" +
  prefix; never the raw key or hash.
- **Revoked/deleted key:** a run whose key is later revoked (and FK NULL on hard
  delete) still shows the prefix snapshot.
- **No-leak:** no `key_hash` / raw key / OAuth token anywhere in the run-history
  payload.
- **Billing parity:** API-key run deducts exactly like a manual run (same account, 1
  task); billing path unchanged.
- **Regression:** existing FK-4 trigger tests + the run-history suites stay green
  (FK-4's "enqueues a real manual run" test updates from `manual` → `api_key`).

---

## 3. Recommended direction

**Additive, attribution-by-snapshot.**

- **DB:** drop+recreate the CHECK with `'api_key'`; add `triggered_by_api_key_id uuid
  REFERENCES account_api_keys(id) ON DELETE SET NULL` + `triggered_by_api_key_prefix
  text`. Nullable, no backfill.
- **Types:** add `"api_key"` to `RunTriggerSource` (engineTypes.ts) **and**
  `WorkflowRunTriggeredBy` (workflowRuns.ts) — both unions, kept in lockstep with the
  CHECK.
- **Threading (the full chain):**
  `verifyApiKey` → (surface the matched key's **prefix**) → trigger route →
  `enqueueRun` (`EnqueueRunInput` gains `triggeredByApiKeyId?` + `triggeredByApiKeyPrefix?`)
  → `WorkflowEngine.runWorkflow` (`RunWorkflowInput`) → `runPersistence` → `recordRun`
  (`RecordRunInput` + the `workflow_runs` insert) → `rowToRecord` → `WorkflowRunRecord`
  / `WorkflowRunDisplayRecord` → `RunListItem` (`contracts/workflow.ts`) →
  `app/runs/_shared.ts` `toRunListItem` → runs UI label.
- **Prefix source:** extend `ApiKeyVerificationRecord` +
  `getApiKeyForVerificationByPrefixServiceRole` to **select/return `prefix`**, and have
  `verifyApiKey` include it in its `ok` result. (Alternative: derive the prefix in the
  route from the bearer header via `deriveApiKeyPrefix(parseBearerApiKey(header))` — no
  verify change, but re-parses the header. **Recommend threading through verify** for a
  single source.)
- **Route:** set `triggeredBy: "api_key"`, `triggeredByApiKeyId: verified.keyId`,
  `triggeredByApiKeyPrefix: verified.prefix`, `triggeredByUserId: null`.
- **UI:** render "Triggered via API key · `<prefix>`".
- **Billing:** untouched.

---

## 4. Implementation slice breakdown (for the future build)

- **RH-1 — schema + types.** Migration (CHECK expand + 2 columns) + static migration
  test; add `"api_key"` to both unions. No behavior wired yet.
- **RH-2 — threading + route.** Surface `prefix` from verify; add the optional fields
  to `EnqueueRunInput` / `RunWorkflowInput` / `RecordRunInput` + the insert + mapper;
  set them in the trigger route. Tests: route enqueues with the new provenance; repo
  round-trip; billing parity.
- **RH-3 — run-history display.** Extend `RunListItem` + `toRunListItem` + the runs UI
  label; revoked/deleted-key snapshot test; no-leak test.

> RH-1→RH-2 can ship behind no flag (additive + null-safe); RH-3 is pure display.

---

## 5. Open decisions

- **Name snapshot (`triggered_by_api_key_name`)** — store a run-time name snapshot in
  addition to the prefix, or rely on prefix + a live join for the name? Recommend
  **prefix-only at first**; add the name snapshot if product wants a friendly label in
  history that survives rename/delete.
- **Index on `triggered_by_api_key_id`** — add now (for a future "runs by key" view)
  or defer? Recommend **defer** until that view is actually built.
- **Prefix-source mechanism** — thread `prefix` through `verifyApiKey` (recommended)
  vs. derive in the route from the bearer header. Decide at RH-2.
- **Member visibility** — the prefix is non-secret and already owner/admin-visible;
  confirm it's acceptable to show in run history to all account members who can see
  runs (recommended: yes, it carries no secret).
- **`triggered_by` for future non-public internal API calls** — keep `api_key`
  specifically meaning "public bearer trigger", or generalize later. Out of scope now.

---

## 6. Acceptance criteria (for this planning slice)

- A committed planning doc at `docs/slices/phase-4/api-keys-run-history-plan.md`; **no**
  source, migrations, tests, or UI changes; nothing pushed.
- Answers Q1–Q11 from verified code/migration evidence (the CHECK location, both
  unions, the `triggered_by_user_id` column, the full enqueue→persistence→display
  chain).
- Locks the recommended direction: add `'api_key'` to the CHECK + both unions; store
  `triggered_by_api_key_id` (nullable FK `ON DELETE SET NULL`) + a
  `triggered_by_api_key_prefix` snapshot; keep `triggered_by_user_id` null; surface
  "Triggered via API key · `<prefix>`"; **no billing change**; no raw key / hash /
  OAuth-token exposure.
- Gives an RH-1→RH-3 slice breakdown, a test plan, and the open decisions.

---

## Report summary

- **Current:** FK-4 enqueues API-key runs as `triggeredBy:"manual"`,
  `triggeredByUserId:null` — indistinguishable from human manual runs.
- **`RunTriggerSource`** is a closed union at `services/execution/engineTypes.ts:76`,
  mirrored by `WorkflowRunTriggeredBy` in `repositories/workflowRuns.ts`; the DB CHECK
  `workflow_runs_triggered_by_chk` lives in
  `20260523000000_workflow_runs_test_mode.sql` (drop+recreate to expand).
- **Recommended model:** one additive migration (CHECK + `triggered_by_api_key_id`
  nullable FK `ON DELETE SET NULL` + `triggered_by_api_key_prefix` snapshot), `api_key`
  added to both unions, threaded route→engine→persistence→display, prefix surfaced from
  `verifyApiKey`; `triggered_by_user_id` stays null; billing unchanged; no secret
  exposure.
- **Open decisions:** name snapshot, FK index, prefix-source mechanism, member
  visibility of the prefix, scope of the `api_key` source label.
