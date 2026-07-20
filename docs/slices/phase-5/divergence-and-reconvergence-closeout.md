# Divergence and Reconvergence (RECONV-1) — CLOSEOUT + OWNER REPORT

> Status: COMPLETE (local-only, 2026-07-19/20). Builds on
> [`advanced-branching-routing-and-entitlement-closeout.md`](./advanced-branching-routing-and-entitlement-closeout.md)
> (BRANCH-ENT-1). Nothing pushed, no PR, no deploy, no `db:push`, **no migration**.

## What shipped (commit chain)

| Commit | Content |
|---|---|
| `cfaaae776` | S1 — dedicated reconvergence coverage: engine (direct rejoin, nested rejoin, three-way Router rejoin, storage-order shuffle incl. the NODES array), diamond-clean validation, persistence round-trips (export sanitizer, definition schema, checkpoint create/restore) |
| `b0bc02fe4` | S2 — builder: heal deletion of a reconverged shared node (multi-in × single-out); diamond-aware auto-layout (longest-path depth) |
| `11706b5c1` | S3 — AI: branch-label + reconvergence teaching in the edit prompt, conditional-request guard on the linear create path, non-blocking user-visible `MISSING_BRANCH_EDGE` / `STALE_BRANCH_EDGE` proposal-time warnings |
| `aa6969d56` | S4 — Playwright rejoin journey built through the real builder UI + background-execution reconvergence test; **canvas edge-selection fix** |
| (this commit) | S5 — this closeout/owner report; stale `selfLoopEdges.ts` doc comment corrected |

---

# Owner Report — Divergence and reconvergence

## Could the builder already connect separate routes to one shared node?

**Yes.** This capability was already present before RECONV-1, as a consequence of
BRANCH-ENT-1's D4 builder work, and it was genuinely general rather than
accidental. Every layer models the graph as a flat `(from, to, label)`-keyed DAG
with **no single-parent, tree-shape, or in-degree assumption anywhere**:

- `graphSlice.connectNodes` dedups on the `(from, to, label)` triple only, and its
  own comment states that a branch node may run both routes to the same target.
- The canvas passes no `isValidConnection` and caps no handle's connection count;
  a second incoming edge is appended, never substituted.
- `WorkflowDefinitionSchema` dedups on `${from}->${to}::${label ?? ""}`, so two
  differently-labeled edges into one node are distinct and valid.
- The engine's OR-merge fixpoint worklist (BRANCH-ENT-1 D1) already ran a merge
  node on any activation, at most once, order-independently.

So the answer to "does ChainReact support divergence and reconvergence" is yes,
and it was yes before this arc. What RECONV-1 added is **proof** (the shapes in
your spec had almost no direct test coverage), two builder-usability fixes, one
real canvas defect fix, and the AI-layer understanding that was genuinely absent.

## Defects found

Four, of which one was a real user-facing bug:

1. **Edge selection was undeliverable (real defect, fixed — `aa6969d56`).**
   `WorkflowCanvas` bound `edges` straight to the slice-derived array with no
   `onEdgesChange` handler, so React Flow silently discarded every edge
   **selection** change. An edge could therefore never become selected, which made
   the documented edges-only keyboard-delete contract in `useCanvasNodeDeletion`
   unreachable — leaving an author no way to disconnect a mis-drawn edge, which is
   a prerequisite for rewiring any diverge/reconverge shape. Found while
   authoring the UI-driven Playwright journey (a test doing what a user does found
   what unit tests with a mocked React Flow could not). Now mirrors the existing
   `rfNodes`/`onNodesChange` controlled-flow pattern; the graph slice remains the
   source of truth and structural edits still flow through `onConnect` /
   `onEdgesDelete`.
2. **Shared-node deletion was hard-blocked (usability, fixed — `b0bc02fe4`).**
   Deleting any node with ≥2 incoming and ≥1 outgoing edges returned
   `cannot_rewire_multi_edge` — i.e. the reconvergence node itself could not be
   deleted without first manually disconnecting edges. Multi-in × **single**-out is
   unambiguous, so it now heals: one rewire edge per incoming edge onto the single
   successor, each preserving its own label, with duplicate/self-loop candidates
   dropped via the existing warning pattern. Multi-in × **multi**-out stays blocked
   (genuinely ambiguous), and the blocked message now describes only that case.
3. **Auto-layout put reconvergence nodes above their parents (cosmetic, fixed —
   `b0bc02fe4`).** Row depth was first-visit BFS (shortest path), so in an
   asymmetric diamond the shared node landed one row above the tail of the longer
   route, producing an upward-flowing edge after Arrange. Depth is now a bounded
   longest-path relaxation (clamped at component size so the legal-cycle case still
   terminates deterministically). Diverging and reconverging paths now lay out
   downward.
4. **The AI never knew branches could rejoin (fixed — `11706b5c1`).** The
   deterministic patch/apply machinery was always topology-honest — flat edges,
   fan-in legal, labels preserved through id materialization and patch
   application, no tree normalization, and the linear-layout normalizer correctly
   bails on fan-in. But the **model-facing** layer was silent: the edit prompt's
   only `addEdge` example omitted the `label` field entirely while instructing "do
   not invent other shapes", and the create-path plan format is an ordered step
   list that cannot express edges at all. Reaching your `Payment → If/Else →
   {receipt, notify} → Log result` shape would have been luck. The edit prompt now
   documents the label field, the exact label vocabulary, and carries a worked
   payment-If/Then reconvergence example stating that mutually exclusive routes
   should rejoin on one shared step rather than duplicating it; the create path is
   now explicitly told not to flatten a conditional request into a chain that
   would run both actions unconditionally.

**No defect was found in the engine.** The OR-merge runtime contract was already
correct and is now much more thoroughly tested.

## The exact OR-merge semantics

A node's eligibility is **not** computed from its incoming edges. The engine
maintains an activation set (`reachable`, seeded with the trigger) and runs a
fixpoint worklist: a node is executed the moment at least one incoming edge has
been activated by a source that actually executed; a node not yet reachable is
**deferred to the next pass, never finalized**, and the loop ends when a pass makes
no progress.

Edge activation is per-edge and purely local: an **unlabeled** edge always
activates; a **labeled** edge activates iff `branchTaken === label`. A
`branchTaken` of `null`/`undefined` activates no labeled edge (this is how a route
ends gracefully); a `branchTaken` string matching no outgoing label raises
`INVALID_BRANCH`.

Consequences, which are exactly your required contract:

- The shared node becomes eligible when the selected route reaches it.
- It never waits for skipped or non-selected routes — **there is no AND-join, no
  predecessor tally, and no join primitive anywhere in the repo.**
- It executes **exactly once per run**: execution removes it from the worklist and
  it is never re-added, so N incoming edges never mean N executions.
- Edge ordering cannot affect it, because eligibility is a fixpoint rather than a
  single ordered pass — this was BRANCH-ENT-1's D1 fix and RECONV-1 extends the
  proof to permuting the **nodes** array as well as the edges array.

## How skipped routes affect the shared node

They don't — and the reason is structural rather than defensive. **Skip is not
propagated.** There is no "mark the subtree skipped" traversal that could flood
through a merge node (the classic implementation of this feature, and the classic
source of its bugs). Skipped is simply the *complement of the activation fixpoint*:
when the run reaches its fixpoint, every node still outside `reachable` is
persisted with `status: "skipped"`. A non-selected route's nodes never enter the
set, transitively, so they are skipped; the shared node is in the set via the
selected route, so it runs. Skip "stopping" at the reconvergence node requires no
special case because skipping was never a traversal.

A skipped node calls no handler, produces no output, and writes no `variables`
entry. Therefore the shared node can only resolve variables from nodes that
actually executed. Referencing `{{skippedNode.field}}` from the shared node is a
typed, run-fatal `MISSING_VARIABLE` failure (`reason: "missing_node"`), raised by
strict pre-resolution **before** the handler runs — never a silent empty string,
and never a partially-executed side effect.

**Authoring implication worth knowing:** there is no "whichever branch ran"
coalesce helper. A shared node should reference values from upstream of the
branch, or fields that every route it can be fed by actually produces.

## Did the shared node execute exactly once in every tested shape?

**Yes — in every shape tested, at every layer tested.** Below, "engine" means a
unit test asserting handler call counts and the full per-node status map.

| Spec case | Result | Where proven |
|---|---|---|
| Case 1 — True route reconverges | Shared once; False action skipped; True output resolvable | engine (`cfaaae776`), Playwright TRUE run (`aa6969d56`) |
| Case 2 — False route reconverges | Shared once; True action skipped; False output resolvable | engine, Playwright FALSE run |
| Case 3 — Unequal route lengths | Shared once on either selection; short route never fires early, long skipped route never blocks | engine (pre-existing D1 + new permutation tests) |
| Case 4 — Three-way Router rejoin | Shared once per selection (route a, route b, defaultRoute); other two lanes skipped; first-match-wins intact | engine (3 tests) |
| Case 5 — Nested divergence and rejoin | Inner shared once and outer shared once (outer=true/inner=true); whole inner subtree skipped and outer shared still once (outer=false); no node ever executes twice | engine (2 tests) |
| Case 6 — Direct reconvergence | Both branch edges onto the shared node with no intermediates; shared once per selection | engine (2 tests) |
| Case 7 — One terminal branch | Valid, runs clean, no fake rejoin required — **see the encoding note below** | engine + `findGraphIssues` clean-case test |
| Case 8 — Save and reload | Both incoming edges survive save→reload; TRUE and FALSE runs each execute shared exactly once | Playwright, built through the real UI |
| Case 9 — Retry and rerun | Retry is a fresh full run through the same engine, so semantics are identical and the shared node is not duplicated. **Mid-run/step-level resume does not exist** in V2 (`/resume` is lifecycle pause→active only), so the "two incoming paths read as two required predecessors" hazard cannot arise | engine duplicate-dispatch test; verified by audit |
| Case 10 — Background execution | A reconverged diamond reached through a background trigger source executes the shared node exactly once, unselected route persisted skipped | new jest background-execution test |
| Edge/node order independence | Identical status maps and exactly-once across permuted node array + rotated/reversed edge arrays | engine (spec-mandated shuffle test) |
| Template / export / checkpoint preservation | Diamond edges + labels carried verbatim through export sanitizer, definition schema, and checkpoint create/restore | S1 persistence tests |

### The Case 7 encoding note (read this one)

Your spec says a terminal route must not require a fake rejoin. **It doesn't** —
but *how* a route is made terminal matters, and this is a deliberate design
decision from BRANCH-ENT-1 rather than a gap:

- **Supported:** If/Then with `onFalse: "skip"` (the false path simply ends), or a
  Router with no `defaultRoute` (an unmatched run ends). Both produce
  `branchTaken: null`, which activates nothing and ends that path cleanly. Tests
  confirm these validate clean and run clean.
- **Blocked on purpose:** an If/Then in `onFalse: "branch"` mode with the `false`
  handle left unwired is a **blocking** `missing_branch_edge` readiness issue. This
  is not pedantry — the handler will return `branchTaken: "false"`, and with no
  edge carrying that label the engine raises `INVALID_BRANCH` and the run dies
  mid-execution, possibly long after ship. The validator refuses at authoring time
  precisely so that cannot happen at runtime.

In short: a route ends by *configuring* it to end, not by leaving a declared route
dangling. If you'd rather an unmatched declared route terminate silently, that's a
change to engine semantics (treat an unmatched `branchTaken` string as a graceful
end) — a product decision, deliberately not taken here.

## Results by case category

- **Two-way (If/Else):** passing at engine, validation, builder-slice, canvas,
  persistence, and full UI-driven e2e level.
- **Multi-route (Router):** three-lane rejoin passing at engine and builder-slice
  level, including `defaultRoute` selection and first-match-wins.
- **Unequal length:** passing, both selections, both edge orders, plus node-array
  permutation.
- **Nested:** passing — inner rejoin inside the outer True route, then outer
  rejoin, with each shared node executing at most once and no double execution via
  multiple reachable paths.
- **Terminal route:** passing under the supported encodings above.
- **Save/reload:** passing through the real builder UI.
- **Background execution:** passing (jest, background trigger source through the
  engine choke point).

## Verification actually run

- `npx tsc --noEmit` — **clean, exit 0** (whole project).
- `npm run lint` — **0 errors**, 20 warnings, all pre-existing `max-lines` on
  untouched files.
- `npm run lint:structure` — OK. `npm run lint:migrations` — OK.
- Focused jest suites, all green at their commits: S1 five suites **190/190**; S2
  nine builder suites **213/213**; S3 six suites **102/102** plus an 836-test
  AI/patch blast-radius run; S4 canvas + background suites **16/16**.
- Playwright `reconvergence-builder-ui.spec.ts` — **1/1 passed** (53.7s,
  `--workers=1`), constructing the rejoin through real handle drags.
- Two **pre-existing, unrelated** failures were observed and confirmed to fail
  identically with this arc's changes stashed: `staleWorkflowRunSweep.test.ts` (a
  date-sensitive assertion) and a stale tab-count assertion in
  `WorkflowCanvas.test.tsx` (a History tab added by a concurrent arc). Neither is
  caused by or related to this work, and neither was "fixed" here.
- A full `npm test` sweep was **not** re-run for this arc; the focused suites above
  plus the blast-radius run are the evidence base.

## Operational requirements

None. No migration, no `db:push`, no env var, no flag, no backfill.

## Follow-ups (not this batch)

- `DeleteNodeConfirmDialog.tsx` hard-codes its own blocked-delete copy ("connects
  to multiple paths"). Still truthful — only multi-**out** reaches it now — but it
  could be sharpened to say "outgoing"; it sits outside this arc's file scope.
- No coalesce/"whichever route ran" variable helper exists for shared nodes. If
  authors hit this in practice, that's the feature to consider.
- The Hermes gateway's server-side system prompt lives outside this repo, so its
  branching mental model is unverifiable here; the in-repo prompt additions are the
  controllable mitigation.
- Router route **renames** still drop the stale edge for the user to re-wire
  (inherited BRANCH-ENT-1 follow-up).
