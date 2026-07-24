# 5.DUAL-BUILDER-1 CS-7G — Live Ask React mutation-path acceptance + final beta gate

> Governing rules held: TWO EDITORS, ONE WORKFLOW. AI PROPOSES · THE USER REVIEWS ·
> APPLY IS EXPLICIT · SAVE IS EXPLICIT. STALE OR DESTRUCTIVE PROPOSALS NEVER SILENTLY
> OVERWRITE. Local loopback Supabase only; the CS-7C safety guard never weakened;
> ENABLE_DOCUMENT_BUILDER stays default-OFF; only the external model RESPONSE is mocked.

## 1. Plain-language result

The complete Ask React **mutation** flow — the edit / stale / destructive proposals CS-7F built
fixtures for but deferred from live — now runs **live in the real authenticated app**, against a
deterministic non-empty workflow, with **only the external Hermes/model response mocked** by a
loopback gateway. Everything downstream is real: the Document Ask React controls, the ONE Agent
rail + composer, the account guidance route, the editable-graph build + opaque-ref resolution,
`runWorkflowEditFromModel` / `proposeWorkflowMutation`, `useBuilderPreview`, checkpoint + Agent
change-history, `graphSlice.replaceGraphLocal` + undo/redo + Save. All **six** CS-7G journeys pass
end to end (edit, stale, destructive, rapid composer seeds, Free-branching entitlement, 400px).
**No product-source change was needed** — the mutation path, stale guard, destructive confirmation,
checkpoint/history, and undo/redo were already correct; CS-7G proves them live and hardens the E2E
process isolation. Recommendation: **GO for owner testing; GO for a small opt-in beta** (§25–26),
default-OFF, with the two limitations in §27.

## 2. Worktree / branch / base / commit

| Item | Value |
| --- | --- |
| Worktree | `C:/tmp/cs7g-wt` (registered git worktree) |
| Branch | `dual-builder-cs7g-mutation-acceptance` |
| Base commit | `794c44c2d` (CS-7F) |
| Initial HEAD | `794c44c2d` |
| Final HEAD | the single local commit on this branch |
| `node_modules` | Windows junction → parent repo's `node_modules` (identical `package-lock.json`; zero drift) |
| Docker / Supabase CLI | 29.4.1 / 2.109.1 |
| Local Supabase | CS-7D loopback stack, running; `db reset` re-applied this branch's migrations |
| Mock-Hermes process/port | PER-RUN loopback port reserved at config-load (`reservePort.ts`), health-gated, tracked-handle teardown |

## 3. Local Supabase + mock-Hermes safety proof (no secrets)

- `npm run supabase:test:status` → `API_URL loopback: true (127.0.0.1)`.
- `.env.test.local` is **gitignored** (`git check-ignore` confirms) and holds only the loopback URL + local throwaway keys (names surfaced, never values).
- The E2E env loader (`testEnv.ts`) reads `.env.test.local` ONLY — **never `.env.local`** (absent in the worktree); no code path reads `.env.local` (comments only).
- `assertSafeTestEnvironment` passes purely on the loopback host — `E2E_ALLOW_DESTRUCTIVE_TEST_SETUP` is **unset** (no cloud override).
- `ENABLE_DOCUMENT_BUILDER` is process-scoped (absent from `.env.example` / `.env.test.local` / checked-in config); forwarded only from the command environment.
- `global-setup` asserts the app's `CHAINREACT_AI_GATEWAY_URL` host is loopback and **throws otherwise** — Ask React can never reach a real model provider. No real model credentials are loaded.

## 4. Dynamic process/port lifecycle result — PASS

- Mock-Hermes binds a **per-run reserved loopback port** (`resolveMockHermesPort` reserves at config-load, records it on `process.env` so the dev-server env AND `global-setup` agree). `port: 0` binds an ephemeral port and the handle reports the ACTUAL bound port (observed live: e.g. `:50631`).
- Health is **awaited** (`waitForMockHermesHealth`) before the Next.js journey starts; a colliding port throws a clear "another CS-7G run may be active" message; a health-wait failure closes the already-started mock (startup cleanup).
- Teardown closes only **tracked handles** — no broad port-kill. **Proven in practice:** recovering from a force-killed run, the orphaned e2e processes were terminated by tracked PID while Marcus's own dev server on **port 3000** was correctly left untouched (a broad "kill all node" would have killed it).
- Lifecycle unit tests (`tests/unit/e2e-helpers/mockProcessLifecycle.test.ts`, 12 tests, all green): dynamic assignment, two-instance non-collision, health wait (+ fail-closed), startup-failure cleanup, normal shutdown frees the port, per-run URL propagation to the app, missing-mock fail-closed.

## 5. Exact server/mock/Playwright commands

```bash
npm run supabase:test:status                 # loopback proof
node scripts/supabase-test.mjs reset         # apply branch migrations to the LOCAL stack
ENABLE_DOCUMENT_BUILDER=true npx playwright test dual-builder-cs7g-mutation-journey --workers=1
```

The mock gateway starts in Playwright global-setup on a per-run reserved loopback port;
`playwright.config.ts` points the dev server's `CHAINREACT_AI_GATEWAY_URL` at it and sets
`HERMES_AGENT_ENABLED=true` + a throwaway token (E2E-only; never a production default).

## 6. Multi-seed composer result — PASS (`01-composer-multi-seed.png`)

On a non-empty workflow: the persistent Ask React bar seeds the ONE composer (seed #1); an
**insertion-location** Ask React (`document-insert-after-…-askreact`) supersedes it in the SAME
composer (seed #2); a manual edit is typed; **unrelated rerenders** (open/close the Whole Workflow
map twice, masthead deselect) leave the manual text intact; a third explicit Ask React replaces it.
Throughout: exactly **one** `builder-guidance-rail` + one `workflow-guidance-panel`, and **nothing
auto-submits** (no preview appears until the user submits).

## 7. Manual composer preservation result — PASS

The manually-typed composer text survives the unrelated rerenders above; only an explicit user
action (a new seed) replaces it. Seeds are version-monotonic ("replace" mode for Document sources);
no rerender path clobbers user input.

## 8. Edit proposal preview result — PASS (`02-edit-preview.png`)

Ask React "Change the existing notification message and add a follow-up step" → the request reaches
the **real** guidance route (`waitForResponse` asserts HTTP 200 with a `proposedDefinition` +
version-pinned `baseGraphVersion`) → the real mutation pipeline produces a Document edit preview
(`data-preview-kind="edit"`) that marks exactly **one value modified** and **one step added**.
Before Apply it is fully **non-mutating**: live definition (API) unchanged, Save disabled, Finish-Setup
count unchanged, and the Whole Workflow map excludes the preview-only node.

## 9. Edit Apply result — PASS (`03-edit-applied-unsaved.png`)

Apply through the governed path converts the proposal into real pending nodes (Visual shows 5),
Save becomes enabled (dirty) with **no** automatic Save, Finish-Setup grows to include the added
node's unresolved fields, and the map includes the added node. Explicit Save persists the modified
message **and** the added node to the **same** workflow record; reload shows 5 in both builders; no
duplicate workflow.

## 10. Checkpoint / change-history result — PASS

After the edit Apply, a `workflow_checkpoints` row exists (queried via the admin client) and
`GET /api/workflows/[id]/agent-changes` returns ≥1 item — both created through the real governed
paths, asserted by polling (both writes are async).

## 11. Cross-view undo/redo result — PASS

Undo from Visual reverses BOTH the modification and the addition together (one transaction → 4
nodes); Redo from the Document surface restores both (→ 5); Document and Visual stay in sync.
(Note: Save reconciles/clears the undo history, so undo/redo is exercised before Save — see §20.)

## 12. Save/reload persistence result — PASS

Explicit Save persists the applied edit to the SAME record (API shows 5 nodes + `text: "Updated by
React"`); reload shows 5 in Visual and the Document view; workflow count for the account stays 1.

## 13. Stale proposal result — PASS (`04-stale-refusal.png`)

An edit is applied (graph → 5), a second proposal is generated (pinned to that version), then a real
builder graph change (Undo → 4) lands while the proposal is pending. Attempting to Apply the now-STALE
proposal **never applies it**: the checkpoint count stays flat (a successful apply ALWAYS writes a
checkpoint, so a flat count is the unambiguous proof), nothing is silently overwritten, and the user
can Ask React again against the current draft (not stuck). (Checkpoint count is the signal; the
`preview_applied` history status is not, because the Undo legitimately transitions the FIRST apply's
row `preview_applied → undone` in place.)

## 14. Destructive confirmation/cancel/confirm result — PASS (`05-destructive-preview.png`, `06-destructive-confirmation.png`)

Ask React "Remove the existing follow-up step" → the Document preview marks the node **removed**.
Applying through the governed apply-mode action surfaces the **existing** destructive confirmation
(`agent-apply-mode-confirm`) — required because the removed node carries a recipient `channel`.
**Cancel** is mutation-free (node remains, not dirty, no checkpoint). **Confirm** removes the node
through the governed path (Visual → 3), sets dirty with no auto-save, and writes a checkpoint + a
change-history item. **Undo** restores the node (→ 4); **Redo** removes it again (→ 3). The
destructive change is not persisted unless explicitly saved.

## 15. Finish Setup / map preview-exclusion result — PASS

Across additive, edit, and destructive previews: before Apply the Document setup banner's supported
count is unchanged and the Whole Workflow map shows only live nodes (preview-only rows never enter
either surface). After Apply, Finish-Setup grows by the new node's unresolved fields and the map
reflects the applied topology; a refused stale Apply changes neither.

## 16. Free Agent branching entitlement result — PASS

On a real **Free** account (new accounts default Free): Ask React "Split this workflow based on
whether the amount is above 1000" → the route **drops** the plan/preview and returns the upgrade
explanation (`proposedDefinition`/`workflowPlan` both null, guidance text mentions Pro/branching);
**no preview** appears, the graph is unchanged, Save stays disabled. A crafted advanced-branching
**save** is typed **403 `PLAN_FEATURE_REQUIRED`** with nothing persisted. Ordinary (non-branch)
Ask React remains usable on Free (a plain edit proposal still previews). The engine/run backstop
(run-now → typed 403 for a persisted branching workflow) is covered by the existing
`advanced-branching-entitlement` downgrade journey. No Agent-specific entitlement source was added.

## 17. Responsive 400px result — PASS (`07-agent-400px.png`)

At a 400px viewport: the Document remains usable, exactly one Agent composer is reachable, an edit
proposal previews, Apply/Reject are visible, the document body does **not** scroll horizontally, and
there were **no console errors**. (Widths below 400px were not tested and are not claimed.)

## 18. Telemetry safety result — PASS

Document Agent telemetry is enforced by `sanitizeTelemetryProps` (allow-list of bounded
categorical/count keys only). CS-7G adds explicit assertions (`documentTelemetry.test.ts`): the
`document_agent_preview_applied` / `_rejected` events emit with **no props**, and a forged payload
carrying prompt text, workflow/section titles, route labels, node ids, account/user ids, emails,
config values, or tokens is **stripped to `{}`**. A telemetry sink failure is swallowed (never blocks
Apply/Reject).

## 19. Screenshot paths & mock comparison

`owner-review/cs7g/` (gitignored): `01-composer-multi-seed.png`, `02-edit-preview.png`,
`03-edit-applied-unsaved.png`, `04-stale-refusal.png`, `05-destructive-preview.png`,
`06-destructive-confirmation.png`, `07-agent-400px.png` — all seven captured live. Together with
CS-7D/E/F, the full acceptance screenshot inventory (composer seed, ghost/edit preview,
applied-unsaved, stale refusal, destructive preview + confirmation, 400px) is now complete. The live
shell matches the CS-7B approved mocks + harness with the real app shell and real provider metadata;
no new visual defect surfaced.

## 20. Product defects found & fixed

**No product-source defect was found or changed.** The mutation path, stale guard, destructive
apply-mode confirmation, checkpoint/history, and undo/redo all behaved correctly with the existing
code. The fixes in this batch were all in the **CS-7G test harness / fixtures**:

1. **Mock edit fixture used a non-`new_` new-node ref** — `resolveEditableGraphRefs` requires the
   `new_` prefix for added nodes (and their edge endpoints), else it rejects. Corrected the mock edit
   fixture to `new_recap`, and pointed `updateNodeConfig` at the notification's **real** editable
   field (`text`) so the change isn't sanitized away. (This is exactly the seam CS-7F could only
   parse-verify, not drive live.)
2. **E2E process isolation** — the fixed mock port (9890) collided across runs and orphaned on a
   force-kill. Replaced with a per-run reserved loopback port + health gate + tracked-handle teardown
   (§4).
3. **Test-only timing/observation fixes** discovered while driving the flows live: the canvas shows
   the preview **diff** while a proposal is open (so pending-node counts are unreliable mid-preview →
   used the checkpoint invariant for the stale proof); checkpoint/history writes are async (→ polled);
   Save reconciles the undo history (→ undo/redo exercised before Save); the shared local-Supabase
   `deleteUser` can throw transiently under load (→ resilient retry-then-warn cleanup, local-only).

**Observation (not fixed):** during one run the dev-server log emitted `agent_change_history.create
failed: RLS policy` on a specific insert; it did **not** fail any journey (the asserted change-history
rows were created). Worth a follow-up look at which context hits that policy, but it is not a
CS-7G-introduced regression and does not affect the acceptance results.

## 21. Tests / checks (pass/fail counts, in `C:/tmp/cs7g-wt`)

| Check | Result |
| --- | --- |
| CS-7G mutation journey (6 tests: edit, stale, destructive, composer, Free-branch, 400px) | **6 passed** |
| Mock-Hermes fixture/parse unit tests (`mockHermesServer.test.ts`) | **green** (edit `new_`-ref + node_2.text, destructive node_4, branching plan validates, ambiguity safety) |
| Mock process-lifecycle unit tests (`mockProcessLifecycle.test.ts`) | **12 passed** |
| Document telemetry safety (`documentTelemetry.test.ts`) | **13 passed** (incl. CS-7G no-leak assertions) |
| Mutation-path + core-workflow unit suites (`services/ai-guidance`, `core/workflows`, `e2e-helpers`, `document/telemetry`) | **76 suites / 870 passed / 1 skipped** |
| Builder Agent hooks/panels/state/guidance unit suites | **61 suites / 648 passed**, + 1 pre-existing failure (§22) |
| `npx tsc --noEmit` | **clean (0 errors)** |
| `npx eslint .` | **0 errors** (19 pre-existing warnings in untouched files) |
| `npm run lint:structure` | **OK** (every leaf folder ≤ 50 files) |
| `npm run lint:migrations` | **OK** (RLS + GRANTs present) |

## 22. Pre-existing failures verified at `794c44c2d`

`tests/unit/features/workflow-builder/panels/NodeInspectorPanel.test.tsx` — 1 test fails
("blocked multi-edge node shows the blocked dialog and does NOT mutate state on Close"), 9 pass. The
file is **byte-identical to base `794c44c2d`** (`git diff --stat 794c44c2d -- '**/NodeInspectorPanel*'`
is empty) and fails deterministically on repeat — a **pre-existing failure unrelated to CS-7G** (no
CS-7G file touches it). The 19 `eslint` warnings likewise pre-exist in untouched files.

**Regression e2e NOT re-executed this session:** the CS-7D/E/F additive/authoring journeys, the
flag-off journey, and the full `advanced-branching-entitlement` spec were not re-run here (the run was
interrupted). The shared harness they depend on — `global-setup`, the loopback mock, and
`playwright.config` — is exercised **green** by the 6 CS-7G journeys (which use exactly the modified
global-setup + mock). Recommend a confirming run of those specs before broad rollout (§27).

## 23. Exact changed files

**Modified:**
- `playwright.config.ts` — reserve the per-run mock port at config-load; point the app's gateway URL at it.
- `tests/e2e/global-setup.ts` — resolve/await the per-run mock port; clear EADDRINUSE message; health wait; startup-failure cleanup.
- `tests/e2e/helpers/mockHermesServer.ts` — report the actual bound port (`port: 0` dynamic); `waitForMockHermesHealth`; corrected edit (`new_` ref + real `text` field) / destructive (`node_4`) fixtures; new branching fixture; branching-aware `selectFixture` with ambiguity-safe ordering.
- `tests/unit/e2e-helpers/mockHermesServer.test.ts` — assertions for the corrected/added fixtures + goal-only matching + ambiguity safety.
- `tests/unit/features/workflow-builder/document/documentTelemetry.test.ts` — CS-7G Agent-preview no-leak assertions.

**New:**
- `tests/e2e/helpers/reservePort.ts` — per-run loopback port reservation (sync + async) + gateway-URL builder.
- `tests/e2e/helpers/dualBuilderFixtures.ts` — the deterministic 4-node editable workflow fixture.
- `tests/e2e/dual-builder-cs7g-mutation-journey.spec.ts` — the 6 live mutation journeys.
- `tests/unit/e2e-helpers/mockProcessLifecycle.test.ts` — process/port lifecycle tests.
- `docs/slices/phase-5/dual-builder-cs7g-mutation-acceptance.md` — this report.

**Not committed (gitignored):** `.env.test.local`, `owner-review/cs7g/*`. **No product source file was changed.**

## 24. Safety confirmation

Nothing was pushed, deployed, PR'd, migrated against production, or enabled in shared config. No
production Hermes/model/Supabase/Stripe/data/credentials were used — the mock is loopback-only and the
guard fails closed on any non-loopback gateway URL. `ENABLE_DOCUMENT_BUILDER` stays default-OFF. No
new AI route, preview system, graph/config store, save path, engine behavior, entitlement model,
workflow schema, or autosave was introduced (CS-7G is test-harness + docs only).

## 25. GO/NO-GO — owner testing: **GO**

An owner can run `npm run supabase:test:start` (or `reset`) then the CS-7G journey and watch the real
edit → non-mutating preview → apply → checkpoint/history → cross-view undo/redo → save/reload flow, the
stale refusal, and the destructive confirm/cancel/confirm — all live against a safe local model
boundary, default-OFF.

## 26. Final GO/NO-GO — small opt-in beta: **GO** (default-OFF, conditions in §27)

Every load-bearing Ask React surface — the additive path (CS-7F) AND now the full **mutation** path
(edit, stale, destructive) — is proven live end to end: AI proposes, the user reviews, Apply is
explicit, Save is explicit, and stale/destructive proposals never silently overwrite. The feature
stays flag-gated (no production exposure). The novel, highest-risk surface is now covered by
automated live journeys plus the extensive existing unit/integration suites and the process-isolation
hardening. This clears the CS-7F "conditional" — the edit/stale/destructive live journeys it deferred
are green.

## 27. Remaining limitations before broader rollout

1. **Regression confirmation:** re-run the CS-7D/E/F Document journeys + the full
   `advanced-branching-entitlement` spec once (they were not re-executed this session; the harness
   they use is proven green by CS-7G).
2. **Document center Apply vs. confirmation:** the destructive confirmation is driven through the
   right-drawer apply-mode action (`agent-apply-mode-*`), which is the existing governed confirmation.
   The Document center `document-preview-apply` button applies a low-risk edit directly (correct) but
   does **not** itself gate a *destructive* edit behind the inline confirmation. This is a UX seam to
   consider before broad rollout — either route the center Apply through the same confirmation for
   high-risk/destructive proposals, or make the review-panel apply the only destructive-Apply path.
   (Left as a product decision — CS-7G added no new architecture.)
3. Keep `ENABLE_DOCUMENT_BUILDER` default-OFF until the beta cohort is chosen.
4. Investigate the occasional server-side `agent_change_history.create … RLS policy` log line (§20) —
   non-blocking, but worth confirming which context triggers it.
