# 4.CONN-SHARE — Explicit Private-Connection Sharing — Verification Closeout

**Type:** Verification + closeout (docs-only). Nothing pushed. `db:push` NOT run.
**Date:** 2026-06-12 (flag-on landed 2026-06-12 — see §7)
**Branch:** `builder-ui-v1-audit-1`
**Plan:** [explicit-private-connection-sharing-plan.md](./explicit-private-connection-sharing-plan.md)
(model locked §0; CS-4 audit §14; CS-4a design §15).

> **STATUS: FLAG-ON — `ENABLE_CONNECTION_SHARING` enabled (local runtime via `.env.local`).**
> Migrations confirmed applied; full check set re-run green with the flag live. Code stays
> opt-in (`=== "true"`); production go-live = set the same env var at deploy. See §7. **Not
> pushed/deployed — awaiting Marcus's deploy approval.**

---

## 1. Executive summary — GO (flag enabled; ready for deploy pending approval)

The explicit private-connection sharing feature (CS-1 → CS-5b) is **complete and now
ENABLED** via `ENABLE_CONNECTION_SHARING` (env-var convention). The implementation matches
the locked model: connector-push sharing, ambiguity-aware fail-closed run/edit gate,
node-level connector binding for the 2+-sharer case, a resolver that the gate and the
executor **share** (cannot drift), and a no-leak surface throughout.

All five static checks pass and the **full unit suite is fully green** (17,766 passed / 0
failed). The earlier `features/integrations/ConnectButton` failures were **stale test
assertions** (not jsdom, not CONN-SHARE) and are fixed (`d4a349c36`).

**Recommendation: ready to deploy with the feature live.** Set `ENABLE_CONNECTION_SHARING=true`
in the production environment at deploy. Kill-switch: remove the var / set `=false`.

**Flag-on prerequisites (must hold in the target environment):**
1. Both migrations are applied to the target DB:
   `20260622000000_add_integration_sharing_scope.sql` (column + CHECK) and
   `20260623000000_workflow_node_connector_bindings.sql` (table + RLS + GRANTs). *This
   verification did NOT run `db:push`; application state was not checked against a live DB.*
2. `ENABLE_OPENAI_*`/billing are irrelevant here — CONN-SHARE has **no** AI/MCP/billing
   dependency. The only env input is the flag itself.

---

## 2. What shipped (commit chain, all local, in `a66d0d87e` ancestry)

| Slice | Commit | Content |
|---|---|---|
| CS-1 | `7dd78d1a4` | `integration_sharing_scope` column + CHECK; `ENABLE_CONNECTION_SHARING` flag; pure `sharingScope` helpers (inert) |
| CS-2 | `4b79788c4` | connector-push toggle service + route + repo writes (gated, no runtime wiring) |
| CS-3a | `5479edb02` | ambiguity-aware eligibility computation + shared-connector query (inert, not wired) |
| CS-4a | `d1613b250` | `workflow_node_connector_bindings` table + repo + binding service + routes (gated, inert) |
| CS-4b + CS-3b | `3471e4461` | resolver precedence + ambiguity-aware run/edit gate wired in lockstep; offboarding binding cleanup |
| CS-5a | `5e8bb0a28` | Apps sharing UI + accurate workflow DTO booleans (flag-gated) |
| CS-5b | `b0056ce91` | builder node connector picker for ambiguous shared connections (flag-gated) |

> **Worktree note (shared-tree hazard, per project memory).** During this verification the
> branch HEAD advanced from `b0056ce91` → **`a66d0d87e`** (`fix(ai-diag): AI-DIAG-2-pre …`),
> committed by a **parallel AI chat** sharing this worktree. `a66d0d87e` only re-attributes
> the deterministic 0-credit diagnose telemetry to the workflow-owning account — it touches
> **no CONN-SHARE code**. All CS files are byte-identical between `b0056ce91` and the verified
> tree, so this report is unaffected. The parallel chat also has **in-progress, uncommitted
> AI-DIAG-2a work** in the tree (`lib/api/ai.ts` + untracked `services/ai/diagnostics/explain*`,
> `app/api/workflows/[id]/ai/diagnose/explain/`); that is NOT part of CONN-SHARE and was left
> untouched.

---

## 3. Verification performed

### 3.1 Static checks (all newly run this session — PASS)
- `npm run typecheck` → **0 source errors** (a concurrent build polluted a first run with
  spurious `.next/types/**` TS6053 noise; a clean re-run is 0 errors).
- `npm run lint` → 0 errors (19 pre-existing warnings).
- `npm run lint:structure` → OK.
- `npm run lint:migrations` → OK (RLS + policy + explicit GRANTs present on the new table).
- `npm run build` → Compiled successfully.

### 3.2 Tests (newly run this session)
- Targeted CONN-SHARE suites (12 files): **176/176 pass** — `sharingScope`,
  `sharingEligibility`, `connectionSharing`, `connectionSharingEligibility`,
  `connectionBinding`, `connectionBindingState`, `connectionResolution`,
  `integrations-sharedConnectors`, `workflowNodeConnectorBindings` (repo + migration),
  `integration-sharing.route`, `connector-binding.route`, `connection-runedit-gate`.
- Related suites (Apps DTO/UI, `_shared` gate+DTO, builder, engine, leaveAccount,
  membership, connectorBindings client lib): **103 suites / 1630 pass**.
- **Full `jest`: 17,727 passed, 181 skipped, 2 failed** — the 2 failures are both in
  `tests/unit/features/integrations/ConnectButton.test.tsx`.

### 3.3 The single failing suite is pre-existing and unrelated
`ConnectButton` fails on `mockStartOAuth` / `window.location.assign` not firing inside a
`waitFor` — a **jsdom navigation** limitation. `ConnectButton.tsx` and its test were last
touched at `358f7904a` (an APPS-RECONNECT commit **predating** the CS arc); **no CS commit
touches `ConnectButton`, `startOAuth`, or any shared helper in its render path.** Classified
as environmental / pre-existing, **not** a CONN-SHARE regression. *Honesty note:* I could
not run the clean pre-CS isolation (the shared tree's uncommitted parallel work blocked a
detached checkout), so this rests on code-level evidence, not a bisect.

---

## 4. Behavior verified (code-level audit, every claim tied to a read file)

### 4.1 Flag-OFF regression (matches WF-RUNPERM exactly)
- `setIntegrationSharingScope` returns `not_enabled` with **zero I/O** when OFF
  ([connectionSharing.ts:81](../../../services/integrations/connectionSharing.ts)). Same for
  every binding service entry ([connectionBinding.ts](../../../services/integrations/connectionBinding.ts)).
- Apps DTO `computeSharingFields` returns `not_applicable` / all-false when OFF, so
  `canShare`/`canUnshare`/badge controls never render
  ([app/apps/_shared.ts:88](../../../app/apps/_shared.ts)); AppCard gates on those booleans.
- Run/edit gate + DTO hint: `computeViewerCanRunEdit` flag-OFF branch delegates to the exact
  WF-RUNPERM `viewerMayRunEdit` with **no DB read**
  ([app/api/workflows/_shared.ts:280](../../../app/api/workflows/_shared.ts)).
- Engine builds **no** credential plan when OFF (`sharingOn ? buildWorkflowCredentialPlan : …`),
  preserving the pre-CS `effectiveCredentialOwner` path
  ([engine.ts:403](../../../services/execution/engine.ts)).
- Binding/sharing routes 404 (`workflowNotFoundResponse` / `CONNECTION_SHARING_NOT_ENABLED`)
  when OFF — flag state is not an existence oracle.

### 4.2 Flag-ON behavior (locked model)
- **Share = connector only**; owner/admin cannot silently share a member's identity
  (`isConnector` required for `shared_with_account`)
  ([connectionSharing.ts:115](../../../services/integrations/connectionSharing.ts)).
- **Unshare = connector OR owner/admin**, with a **distinct audit event**
  (`admin_unshared` carries `actorRole`, not user/connector id) for the admin-safety path
  ([connectionSharing.ts:138](../../../services/integrations/connectionSharing.ts)).
- **Account/service providers** → `account_provider_not_shareable`; **disconnected rows** →
  collapsed to `not_found` and never mutated (write guards `disconnected_at IS NULL`).
- **Resolver precedence** (`resolveNodeOwner`): accepted grant → **valid** binding (bound
  connector still in the live shared set) → single-sharer → **creator fallback / fail-closed**
  for unshared or ambiguous-no-binding
  ([sharingEligibility.ts:198](../../../core/integrations/sharingEligibility.ts)). Never picks
  an arbitrary/earliest co-member row (closes the §14.3 silent-wrong-identity risk).
- **Ambiguity-aware gate**: a non-creator is team-runnable only when **every** personal node
  resolves to a specific shared connector (`allTeamRunnable`); the gate consumes the **same**
  `buildWorkflowCredentialPlan` the executor resolves owners from — they cannot drift
  ([connectionResolution.ts](../../../services/integrations/connectionResolution.ts) +
  [engine.ts:562](../../../services/execution/engine.ts)).
- **Multi-sharer + binding** allows run/edit and executes as the **bound** connector;
  **single-sharer fallback** auto-resolves; **multi-sharer without binding blocks**
  (`needs_selection` / fail-closed).
- **Binding authz is structural no-silent-share**: a binding can only point to a connector
  already in `listSharedConnectorUserIdsServiceRole` → unshared identities are unbindable
  (`connector_not_shared`) ([connectionBinding.ts:170](../../../services/integrations/connectionBinding.ts)).
- **Lifecycle / invalidation**: unshare/disconnect/leave drop the connector from the live
  shared set → binding becomes invalid at resolve time (fail-closed, never silent-switch).
  Offboarding additionally **hard-deletes** bindings on member-leave and member-remove
  ([leaveAccount.ts:72](../../../services/accounts/leaveAccount.ts),
  [membership.ts:122](../../../services/accounts/membership.ts)).

### 4.3 No-leak audit (all surfaces)
- **Apps DTO** ([contracts/apps.ts](../../../contracts/apps.ts)): only `sharingStatus` enum +
  `sharedWithAccount`/`canShare`/`canUnshare` booleans + opaque row id + display name. Raw
  `integration_sharing_scope` and `connected_by_user_id` are server-only, never emitted.
- **Workflow DTO**: exposes only `usesPrivateCredential` + `viewerCanRunEdit` booleans; the
  internal owner-by-node map is never serialized.
- **Binding routes + picker**: options are the existing safe `{ userId, displayName, role }`
  shape (display name via the member-identity RPC) — never email / `provider_account_id` /
  token / scope / account metadata.
- **Errors/banners**: all typed codes; `not_enabled`/`not_found`/cross-account/non-member/
  disconnected collapse uniformly (no existence/ownership/state oracle).
- **Audit payloads**: `account.integration.sharing.{shared,unshared,admin_unshared}` and the
  offboarding `*connector_bindings_deleted` events carry ids + provider slug (+ `actorRole`)
  only — no user/connector id, token, label, or raw error.
- **Bounded reads**: `listSharedConnectorUserIdsServiceRole` selects only
  `connected_by_user_id`, filtered `(account, provider, shared, active)`. No token/scope read
  on any CONN-SHARE path.

### 4.4 Performance / DB sanity
- **Workflow list DTO is intentionally conservative**: `toWorkflowListItem` keeps the sync
  `viewerMayRunEdit` (creator-only) even with the flag ON — it never over-permits; a
  non-creator who *can* run a shared workflow sees the conservative chip until they open the
  detail (which is accurate). Per-row `buildWorkflowCredentialPlan` is deliberately avoided
  on the N-row list ([app/api/workflows/_shared.ts:315](../../../app/api/workflows/_shared.ts)).
- **Detail/run/edit reads are bounded**: `buildWorkflowCredentialPlan` runs at most one
  accepted-owners read + one bindings read + one shared-set read **per distinct provider**
  (via `Promise.all`), short-circuiting on creator / no-private with **no DB read**.
- **Flag-OFF avoids all sharing reads** (engine, gate, DTO, Apps) by design.

---

## 5. Known limitations / follow-ups (non-blocking)

- **List-row resolvability batching** (CS-5b follow-up): the list chip is conservative by
  design; a batched resolvability pass would let non-creator-runnable shared workflows show an
  enabled chip without opening detail. Safe to defer — the gate is the real enforcement.
- **Migrations applied** to the V2 dev DB — confirmed 2026-06-12 (see §7.2). Production
  go-live still requires the same two migrations applied to the prod DB.
- **OQ-4a residuals** (plan §15.11): stale-binding rows are left inert (resolve-time recheck
  makes them harmless); multi-node same-provider different-connector is permitted and covered
  by engine parity tests.
- **List-row resolvability batching** (CS-5b follow-up) remains the one deferred polish; the
  run/edit gate is the real enforcement, so the conservative list chip never over-permits.

---

## 6. Result

- **Verification:** PASS (all static checks + 17,766 unit tests green; 0 failures).
- **Bugs found/fixed:** none in CONN-SHARE. The unrelated `ConnectButton` failures were stale
  test assertions (APPS-RECONNECT added a second `startOAuth` arg) — fixed in `d4a349c36`.
- **Flag-on:** **DONE** — `ENABLE_CONNECTION_SHARING` enabled via `.env.local` (env-var
  convention); code stays opt-in; full check set re-run green with the flag live (§7).
- **No push / no deploy / no `db:push`. No AI/MCP/billing/AI-DIAG code changed.**

---

## 7. Flag-on (go-live) — 2026-06-12

### 7.1 Exact flag change
- **Mechanism: env-var enablement** (the dominant convention for these rollout guards —
  `ENABLE_NODE_CREDENTIAL_REASSIGNMENT`, `ENABLE_ACCOUNT_PURGE_CRON`, etc., all
  `process.env[FLAG] === "true"`). Chosen over a code-default opt-out because the CONN-SHARE
  suite encodes **"env unset = OFF / WF-RUNPERM"** as its baseline; an opt-out flip would have
  required rewriting those OFF-path tests. Code stays **unchanged** (`isConnectionSharingEnabled`
  remains `=== "true"`), so the per-test flag contract holds and the suite stays green.
- **Local runtime:** added to **`.env.local`** (gitignored — not committed):
  ```
  ENABLE_CONNECTION_SHARING=true
  ```
- **Kill-switch:** remove that line (or set `=false`) → every path reverts to WF-RUNPERM
  creator-only behavior (the flag is read at call time, so no redeploy needed to flip).
- **Jest is unaffected** by `.env.local` — Jest does not load dotenv (verified: no `dotenv`
  in `jest.config.mjs` / `jest.setup.ts`), and each suite sets the flag per-test.

### 7.2 Migrations (confirmed applied on the V2 dev DB)
Queried `supabase_migrations.schema_migrations` (Session pooler `aws-1-us-east-1.pooler…`):
- `20260622000000_add_integration_sharing_scope.sql` → **APPLIED** (column + CHECK present).
- `20260623000000_workflow_node_connector_bindings.sql` → **APPLIED** (table + RLS policy present).

### 7.3 Checks re-run with the flag live (HEAD at run time `8e090b2f6`)
| Check | Result |
|---|---|
| Targeted: CONN-SHARE + Apps sharing + builder picker + run/edit route + engine cred-resolution + offboarding (19 suites) | ✅ 380/380 |
| `typecheck` | ✅ 0 source errors |
| `lint` | ✅ 0 errors (21 warnings, pre-existing/AI-DIAG) |
| `lint:structure` | ✅ OK |
| `lint:migrations` | ✅ OK |
| `build` | ✅ Compiled successfully, 75/75 static pages |
| full `jest` | ✅ 17,766 passed / 181 skipped / 0 failed |

### 7.4 Push / deploy recommendation
- **Ready to deploy with the feature live.** At deploy, set
  `ENABLE_CONNECTION_SHARING=true` in the **production** environment (host/Vercel env), and
  confirm both migrations §7.2 are applied to the **prod** DB before/with the deploy.
- **Not pushed/deployed** — awaiting Marcus's explicit approval (standing push/deploy policy).
- Post-deploy smoke: share a personal connection from Apps; confirm a non-creator teammate can
  run a single-sharer shared workflow; confirm a 2+-sharer workflow blocks until a connector is
  bound; confirm unshare reverts to creator-only. Kill-switch (`=false`) reverts instantly.
