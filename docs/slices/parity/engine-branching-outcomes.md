# Engine Branching slice — outcomes

**Status:** Shipped locally on `v2-provider-port-local`. **Retro.**
**Master plan:** [`docs/slices/phase-2-plan.md`](../phase-2-plan.md).
**Accepted audit:** [`docs/slices/parity/parity-native-nodes.md`](./parity-native-nodes.md) §7 Tier C + §10 LARGE platform gap.
**Implementation plan:** [`docs/slices/parity/engine-branching-plan.md`](./engine-branching-plan.md) (accepted before Commit 1 began, with §3.3 + §3.5 + §6.2 decisions locked).
**Native Slice 1 outcomes:** [`docs/slices/parity/native-nodes-1-tier-a-outcomes.md`](./native-nodes-1-tier-a-outcomes.md).
**Native Slice 2 outcomes:** [`docs/slices/parity/native-nodes-2-tier-b-triggers-outcomes.md`](./native-nodes-2-tier-b-triggers-outcomes.md).
**V2 surface (shipped):** widened [`contracts/workflowDefinition.ts`](../../../contracts/workflowDefinition.ts) (`WorkflowEdge.label?`), widened [`services/execution/handlers/types.ts`](../../../services/execution/handlers/types.ts) (`ActionHandlerResult.branchTaken?`), new failure code in [`services/execution/engine.ts`](../../../services/execution/engine.ts) (`INVALID_BRANCH`), label-aware traversal inside [`services/execution/engine.ts`](../../../services/execution/engine.ts) backed by new pure helpers in [`services/execution/branching.ts`](../../../services/execution/branching.ts), humanizer row in [`core/errors/humanizeActionError.ts`](../../../core/errors/humanizeActionError.ts).

The engine-branching slice closes the LARGE platform gap defined in the accepted audit §10: **edge labels on `WorkflowEdge`** + **handler-emitted `branchTaken` on `ActionHandlerResult`** + **label-aware BFS dispatch** + **`status: "skipped"` step emission** + **`INVALID_BRANCH` failure code with humanizer row**. The slice is engine-only — no native action, no provider edit, no migration, no new runtime dep, no new HTTP route. Existing 7389 jest tests + 30+ Playwright walkthroughs stayed green throughout because the new behavior is dormant on every persisted workflow today (all edges unlabeled, all handlers return `{output}` only).

Largest qualitative outcomes: (1) **Tier C native control-flow is unblocked.** `if_then_condition` and `router` (Native Slice 3) now have a clean platform substrate — a branching action just needs to return `branchTaken: "true" | "false" | <label> | null` and the engine handles selection, skip propagation, and INVALID_BRANCH classification. (2) **Backward compatibility was preserved without any per-handler edit.** Zero provider files touched; zero native handler files touched; every existing test (~7389) stayed green by construction (`branchTaken: undefined` triggers no labeled activation, so workflows without labeled edges thread identically). (3) **Pure-rule extraction kept engine.ts under budget.** `selectActivatedEdges` + `buildOutgoingEdgeMap` live in [`services/execution/branching.ts`](../../../services/execution/branching.ts) (88 LOC); engine.ts gained 65 LOC of loop changes only and stays clean against the project's max-lines guard. (4) **OR-merge + cycle preservation came free.** Reusing the existing `bfsExecutionOrder()` visited-set means a node with multiple incoming edges runs as soon as one of them activates (no join primitive needed) and cycles still terminate with one visit per node id.

Remaining native parity work is now unblocked: Native Slice 3 (Tier C — `if_then_condition` + `router`) is the next slice. Loop / wait_for_event / unbounded delay / pause-resume / AI cluster / HITL all remain on their existing deferral schedule.

---

## 1. Commit chain

| Commit | Title |
|---|---|
| `f39f294d4` | `docs(engine): plan branching execution` — Commit 0 (planning doc; doc-only). |
| `04248202f` | `feat(engine): add branch contracts` — Commit 1 (contract additions: `WorkflowEdge.label?`, `ActionHandlerResult.branchTaken?`, `INVALID_BRANCH` RunFailureCode, humanizer row, duplicate-edge dedup-key broadening; +19 tests; **no traversal change**). |
| `58b5b166b` | `feat(engine): label-aware traversal and skip semantics` — Commit 2 (engine dispatch loop wired through `selectActivatedEdges` + `reachable` set + skip emission + INVALID_BRANCH detection; new `services/execution/branching.ts`; **no tests for new logic — split per plan §10**). |
| `0524130fd` | `test(engine): cover label-aware traversal` — Commit 3 (18 pure-helper tests + 13 engine integration tests for the new traversal; full suite 7408 → 7439). |

This doc (Commit 4) is the retro. **No runtime code changes.**

---

## 2. Scope shipped

### Contract additions

| Field | File | Shape |
|---|---|---|
| `WorkflowEdge.label?` | [`contracts/workflowDefinition.ts`](../../../contracts/workflowDefinition.ts) | `z.string().min(1).max(64).optional()`. Missing = unlabeled = legacy "always-follow". |
| `ActionHandlerResult.branchTaken?` | [`services/execution/handlers/types.ts`](../../../services/execution/handlers/types.ts) | `string \| null \| undefined`. `undefined` = no decision (legacy); `string` = follow matching labeled + unlabeled; `null` = skip labeled only, unlabeled still follow. |
| `RunFailureCode INVALID_BRANCH` | [`services/execution/engine.ts`](../../../services/execution/engine.ts) | New enum member. Engine emits when handler returns string `branchTaken` with no matching outgoing labeled edge. |
| Humanizer row for `INVALID_BRANCH` | [`core/errors/humanizeActionError.ts`](../../../core/errors/humanizeActionError.ts) | Title "Branch label not found", `action: open_node`, `severity: error`, hint pointing at outgoing edge labels + the handler's branch decision; empty-message fallback included. |
| Duplicate-edge dedup-key | [`contracts/workflowDefinition.ts`](../../../contracts/workflowDefinition.ts) (`WorkflowDefinitionSchema.superRefine`) | Broadened from `${from}->${to}` to `${from}->${to}::${label ?? ""}`. Different labels between same `(from, to)` allowed; same `(from, to, label)` still rejected. |

### Engine traversal (new)

| Concept | Implementation |
|---|---|
| `reachable: Set<string>` | Seeded with `triggerNode.id` at run entry. After each successful node execution, `selectActivatedEdges()` filters outgoing edges and adds activated `to` ids. Nodes in BFS order but not in `reachable` are skipped (no handler call, no resolver call, no `variables[id]`, no `runFailed`). |
| Per-edge selection rule | Pure helper [`selectActivatedEdges`](../../../services/execution/branching.ts). Unlabeled = always activated; labeled requires `branchTaken === label`; `null` = no labeled activation + unlabeled still follow; `undefined` = §6.2.a permissive (same effect as null for non-aware handlers). |
| Trigger activation | Triggers synthetically pass `undefined` to `selectActivatedEdges`. Unlabeled trigger out-edges activate; labeled trigger out-edges never activate (triggers never emit `branchTaken`). |
| `INVALID_BRANCH` detection | When `selectActivatedEdges.invalidBranch === true` (string `branchTaken` with no matching outgoing label), the engine writes a `failed` step with `error: { code: "INVALID_BRANCH", message, details: { branchTaken } }` and halts via the existing `runFailed = true; break;` pattern. Persistence + notification fire with the humanized "Branch label not found" classification. |
| Step status `"skipped"` | Already in the `RunStepResult.status` enum (Slice 1M wired the value for future use). No schema widening needed — the new traversal just started emitting it. |

### File system

New module [`services/execution/branching.ts`](../../../services/execution/branching.ts) — 88 LOC of pure helpers (no I/O, no engine state). Imported by `services/execution/engine.ts` only. Test mirror at [`tests/unit/services/execution/branching.test.ts`](../../../tests/unit/services/execution/branching.test.ts) (18 tests).

`services/execution/engine.ts` grew by 65 LOC of loop logic — `reachable` set initialization, per-iteration skip check, post-handler activation pass with INVALID_BRANCH detection. File total: 511 lines (under the project's max-lines budget).

### Manifest scope changes

**None.** No provider registry entries. No `integrations/_registry.ts` edits. No `services/execution/handlers/_registry.ts` edits.

### Database changes

**None.** No migrations. `WorkflowEdge.label?` rides through the existing `workflows.draft_definition` JSONB column.

### Tests (new + extended)

| File | Tests added |
|---|---:|
| `tests/unit/contracts/workflowDefinition.test.ts` | +8 (Commit 1 — label accept/reject + dedup-key matrix) |
| `tests/unit/core/errors/humanizeActionError.test.ts` | +2 (Commit 1 — INVALID_BRANCH happy + fallback) |
| `tests/unit/services/execution/handlers/types.test.ts` (NEW) | +8 (Commit 1 — `branchTaken` type contract via `@ts-expect-error`) |
| `tests/unit/services/execution/branching.test.ts` (NEW) | +18 (Commit 3 — pure-helper coverage) |
| `tests/unit/services/execution/engine.test.ts` | +13 (Commit 3 — integration coverage) |
| **Engine-branching slice total** | **+49 tests, +2 new test files** |

**Full project totals across the slice:**
- `npm test`: 7389 → 7439 passing (delta +50 — includes one micro-cosmetic addition from a parallel-chat suite that landed between Commits 1 and 3; the engine-branching commits themselves added +49).
- 717 → 718 jest suites.
- `npx tsc --noEmit`: clean.
- `npm run lint`: clean (1 pre-existing max-lines warning on `services/execution/handlers/_registry.ts`).
- `npm run lint:structure`: OK.
- `npm run lint:migrations`: OK.
- `npx playwright test`: unchanged at 30+ pre-existing scenarios (engine-branching is engine-only — no new e2e scenarios; see §3.7 + §6 below).

---

## 3. Durable decisions worth preserving

### 3.1 NPD-EB1 (§3.3) — INVALID_BRANCH is a dedicated RunFailureCode

Accepted before Commit 1 began. The alternative — reusing `HANDLER_FAILED` with a synthetic message — would have made router/condition configuration mistakes harder to diagnose because the UI surfaces a generic "Workflow step failed" card for HANDLER_FAILED. INVALID_BRANCH gets its own humanizer row ("Branch label not found", `action: open_node`, `severity: error`) so users land directly on the node with the bad branch wiring.

**Rule:** any new control-flow primitive that the engine emits as a node failure (future: invalid loop iteration, invalid wait condition, etc.) gets its own `RunFailureCode` + humanizer row. Don't reuse HANDLER_FAILED for engine-layer semantic violations.

### 3.2 NPD-EB2 (§3.5) — duplicate-edge dedup keyed on (from, to, label ?? "")

Accepted before Commit 1 began. Router topologies need same-source/same-target with different labels (e.g. routing to a single downstream node under either of two condition labels). The dedup-key broadening allows that without weakening the no-duplicate guarantee — same `(from, to, label)` triple is still rejected with a label-naming issue message ("Duplicate edge between 'X' and 'Y' with label 'Z'.").

**Rule:** when adding any new edge attribute that influences semantics (future: condition expressions, weights, retry policies), reconsider the dedup key. Don't quietly extend the schema and leave dedup checking an out-of-date subset of edge identity.

### 3.3 NPD-EB3 (§6.2) — undefined `branchTaken` defaults to permissive

Accepted before Commit 1 began. When a handler returns `{output}` only (no `branchTaken`), a node with labeled outgoing edges has its labeled children skipped + unlabeled children activated. This is identical to the `branchTaken: null` path. Net effect: legacy provider handlers + every existing native handler are unaffected by labeled edges someone wires downstream of them.

Alternative (rejected): hard-fail with `MISSING_BRANCH_DECISION` when labeled outgoing edges exist but `branchTaken === undefined`. Would have required every handler that might sit upstream of a labeled edge to opt in. Too coupling-heavy for a backward-compatibility-first slice.

**Rule:** branching is opt-in by handler. A handler that wants to drive a branch returns `branchTaken: string | null`. A handler that doesn't returns nothing — and the engine treats it as "no decision," skipping labeled edges only. Provider authors never need to know branching exists unless they actively want to use it.

### 3.4 Pure-helper extraction lives in `services/execution/branching.ts`

`selectActivatedEdges` + `buildOutgoingEdgeMap` + `EdgeActivationResult` live as pure functions in their own module, NOT inline inside `engine.ts`. Two benefits: (a) the per-edge selection rule is unit-testable in isolation (18 pure tests in `branching.test.ts` exercise every branch of the rule with zero mocks), (b) `engine.ts` stays under the project's max-lines budget (511 lines after the slice, well under the warning threshold).

**Rule for future engine extensions:** if a piece of logic is pure (no I/O, no engine state, no logger) AND has multiple decision branches worth pinning in isolation, extract it. Inline it in `engine.ts` only when the logic is trivially one branch or tightly coupled to the dispatch loop's mutable state.

### 3.5 Skipped nodes appear in `steps` with `status: "skipped"`

The engine emits a `RunStepResult { nodeId, status: "skipped" }` for every node in BFS order that never became reachable. Uses the existing enum value (Slice 1M wired it; this slice is the first emitter). Two benefits: (a) the run-history UI can show "this branch was not taken" directly without inferring it from the topology, (b) future analytics can count skipped steps per workflow without re-deriving the activation set.

**Rule:** "skipped" is a first-class step status — emit it, don't elide it. Even with hundreds of skipped nodes in a deep branching workflow, the persistence row stays well below any reasonable size guard.

### 3.6 `bfsExecutionOrder()` is unchanged

The visited-set BFS that produces the per-run node order is identical to pre-PR. What changed is the dispatch loop: it consults `reachable` per iteration. Reusing `bfsExecutionOrder` preserves the existing cycle-handling guarantee (each node visited at most once per run) for free under branching — a back-edge that activates a node already in `reachable` is a no-op for `reachable.add()`, and the BFS never enumerates the node twice.

**Rule for future control-flow primitives:** modify the dispatch loop's state, not `bfsExecutionOrder`. Loop iteration / pause-resume / etc. should layer over the same precomputed order whenever possible. Re-enumerating the graph mid-run is a last resort.

### 3.7 No e2e walkthrough in this slice

Per the plan §9 + §10 decision, no Playwright walkthrough lands here because no user-visible branching action ships — branching needs an action to drive it (`if_then_condition` / `router`), and those are Native Slice 3. The 49 unit + integration tests are tighter than any Playwright proof would be at this layer (they assert per-node call counts, step statuses, persistence shape, humanized classification, resolver behavior on skipped nodes — none of which a Playwright run can observe). Native Slice 3 will ship a compact "branch A runs, branch B skipped" walkthrough as part of its own commit chain.

**Rule:** an engine-only slice that ships a contract widening + traversal logic but no user-visible feature surface ships unit-only coverage. Add e2e in the slice that ships the runtime action that consumes the new platform.

### 3.8 Type-contract tests use `@ts-expect-error`

`ActionHandlerResult.branchTaken` is a plain TypeScript interface (not a Zod schema) because the handler return shape is statically known at every call site. The 8 `types.test.ts` tests use `@ts-expect-error` to assert the compiler rejects `branchTaken: number | boolean | object | string[]`, with one tiny runtime assertion per case so jest counts the test toward the suite. Any future widening of the union (e.g. someone accidentally relaxing to `unknown`) breaks `npx tsc --noEmit` AND fails jest's expect-error directive.

**Rule:** type-only contracts get type-contract tests. Don't promote a TS interface to a Zod schema just to write runtime assertions when the contract is enforceable at compile time.

### 3.9 Parallel-chat sweep guardrail held

Two minor sweep events occurred during this slice. (1) During the plan-doc gate run (Commit 0), the parallel Outlook Mail 2.3 chat's `git add`-style commit accidentally captured `docs/slices/parity/engine-branching-plan.md`; the Outlook chat noticed and untracked the file with a follow-up `chore(outlook-mail): untrack engine-branching-plan.md from prior commit` (`git rm --cached`, working tree preserved); this slice's Commit 0 then committed the file cleanly through its own chain. (2) No Commit-1/2/3 staging events captured any unrelated files — every commit's `git diff --cached --stat` was inspected before commit, and explicit-path staging held.

**Rule (carried from Native Slice 1 + 2):** before every commit, run `git diff --cached <each-staged-file>` and skim for unintended hunks. Same-file concurrent edits ARE going to happen as long as multiple chats run on the same branch. The cost of one extra inspection per commit is trivial compared to the cost of a sweep landing in a foreign commit.

---

## 4. Native parity status after the engine-branching slice

Audit row from [`parity-native-nodes.md`](./parity-native-nodes.md) §10 (LARGE platform gap):

| Item | Status |
|---|---|
| Edge labels in `WorkflowEdge` | **CLOSED** — `WorkflowEdge.label?: string (max 64)` shipped in Commit 1. |
| `ActionHandler` result widens with `branchTaken` | **CLOSED** — `ActionHandlerResult.branchTaken?: string \| null` shipped in Commit 1. |
| Engine BFS becomes label-aware | **CLOSED** — `reachable` set + `selectActivatedEdges` shipped in Commit 2. |
| Engine "skip-rest" semantics on `branchTaken: null` | **CLOSED** — null path activates no labeled edges; unlabeled cleanup edges still follow. Equivalent skip-rest semantics achievable by wiring only labeled outgoing edges from the branching node. |

**Tier C unblocked:** Native Slice 3 (`if_then_condition` + `router`) can now ship as pure action handlers — they just need to return the right `branchTaken` based on their config. No further engine work required.

**Audit's MAJOR platform gaps remain DEFERRED:** loop scope (NPD-N5 → Phase 6); pause/resume + durable queue (Phase 6/8). Unchanged status.

---

## 5. Test totals

### Slice unit tests added (Commits 1 + 3)

| Suite | Tests | Commit |
|---|---:|---|
| `tests/unit/contracts/workflowDefinition.test.ts` (extended) | +8 | Commit 1 |
| `tests/unit/core/errors/humanizeActionError.test.ts` (extended) | +2 | Commit 1 |
| `tests/unit/services/execution/handlers/types.test.ts` (NEW) | 8 | Commit 1 |
| `tests/unit/services/execution/branching.test.ts` (NEW) | 18 | Commit 3 |
| `tests/unit/services/execution/engine.test.ts` (extended) | +13 | Commit 3 |
| **Engine-branching slice total** | **49** | — |

### Full-project totals after the slice

- `npm test`: **7439 / 7439 passing** (delta +50 across the slice — +49 engine-branching + 1 micro addition from a parallel chat). 718 / 718 jest suites.
- `npx tsc --noEmit`: clean.
- `npm run lint`: clean (1 pre-existing `max-lines` warning on `services/execution/handlers/_registry.ts`).
- `npm run lint:structure`: OK.
- `npm run lint:migrations`: OK.
- `npx playwright test`: no run executed this slice — engine-only, no new HTTP routes, no new user-visible feature surface, no test fixture changes. The existing 30+ scenarios remain green from the last full Playwright run in Native Slice 2.

---

## 6. What remains for Phase 2 native-nodes

### Native Slice 3 — Tier C native control-flow (NEXT — unblocked by this slice)

- `native:if_then_condition` (single-branch with skip-rest via `branchTaken: "true" | "false"` and labeled-only outgoing edges).
- `native:router` (N-label generalization — handler returns the selected branch label).
- New module under `integrations/native/actions/`.
- New unit tests + e2e walkthrough proving end-to-end branching with at least one downstream native or provider action consuming the branch-selected upstream output.
- Engine work: **NONE** — Slice 3 ships pure handlers + schemas only.

Estimated effort: ~4 commits per audit §12 Tier-C slice 3 row.

### Deferred — NOT Phase 2 scope (status unchanged)

- `loop` (NPD-N5 → Phase 6 engine hardening).
- `wait_for_event` (Phase 6 — durable queue + suspended-run state + event-matching dispatcher).
- Unbounded / durable `delay` (NPD-N6 → Phase 6).
- AI cluster `ai_agent` + 7 sub-actions + `tavily_search` (NPD-N7 → Phase 5 AI planner).
- `hitl_conversation` (NPD-N8 → Phase 8 HITL UX).
- `parse_file` / `extract_website_data` (NPD-N9 → pending product signal).
- Generic webhook trigger (NPD-N3 → pending product signal).
- 6 V1 orphan handlers (NPD-N10 → PERMANENT SKIP).
- Per-trigger timezone for `scheduled_trigger` (NPD-N12 follow-up).
- Catch-up / backfill on missed scheduled runs (NPD-N13 follow-up).
- SSRF / private-network hardening for `http_request` (dedicated hardening slice).
- Join / AND-merge primitive (out of scope; OR-merge sufficient for Tier C).
- Builder UI for editing edge labels in the canvas (UI concern; ships in its own slice).

---

## 7. Cross-chat coordination notes

The slice ran alongside an active **Outlook Mail 2.3** chat that was concurrently:
- Shipping `outlook-mail:get_attachment` action.
- Editing `services/execution/handlers/_registry.ts`, `tests/e2e/helpers/mockMicrosoftServer.ts`, `tests/e2e/slice-6-outlook-mail-walkthrough.spec.ts`, and adding new files under `integrations/microsoft-outlook/`.

Coordination observations:

1. **One sweep event resolved cleanly.** Outlook Mail 2.3 Commit 4 (`412b6380b`) accidentally captured this slice's `engine-branching-plan.md` while it was untracked in the working tree during the plan-doc gate run. The Outlook chat immediately followed with `71431d549 chore(outlook-mail): untrack engine-branching-plan.md from prior commit` (`git rm --cached`, working tree preserved) so this slice's Commit 0 could commit the file through its own chain. Net effect: zero history rewrites, file content unchanged across all three commits, both slices' commit chains stayed coherent.

2. **No registry edits this slice.** The engine-branching slice didn't touch `integrations/_registry.ts` or `services/execution/handlers/_registry.ts` — engine + contracts + tests only. Parallel-chat edits on those files never overlapped with anything staged here.

3. **`docs/rules/database-security.md` + `PACKAGES.md` carried as unrelated working-tree state for the entire slice.** Neither was ever staged. The same pre-commit `git diff --cached --stat` inspection caught no unintended captures.

**Durable rule (carried from Native Slice 1 + Slice 2 retros):** before every commit, run `git diff --cached <each-staged-file>` and skim for unintended hunks. Sweep events ARE going to happen as long as multiple chats run on the same branch.

---

## 8. Exit checklist

- [x] NPD-EB1 (§3.3 INVALID_BRANCH) / NPD-EB2 (§3.5 dedup-key) / NPD-EB3 (§6.2 permissive default) resolved before implementation.
- [x] Commit 0 (plan doc) shipped and reviewed against the audit.
- [x] Commit 1 (contracts) shipped + green; existing tests unchanged.
- [x] Commit 2 (traversal) shipped + green; full jest still passes because behavior is dormant on no-label / no-branchTaken workflows.
- [x] Commit 3 (tests) shipped + green; 49 new tests pin the documented behavior.
- [x] This outcomes doc (Commit 4) landed.
- [x] All gates green: `npx tsc --noEmit`, `npm run lint`, `npm run lint:structure`, `npm run lint:migrations`, `npm test` (7439 / 7439).
- [x] No `git add .` — every commit uses explicit path staging on `v2-provider-port-local`.
- [x] No push, no PR.
- [x] Zero per-provider handler edits. Zero native handler edits. Zero migration files. Zero new runtime dependencies. Zero new HTTP routes.
- [x] Engine-branching slice unblocks Native Slice 3 (Tier C `if_then_condition` + `router`).

**Engine Branching slice complete. Next: Native Slice 3 — Tier C native control-flow — once Marcus signals to start.**
