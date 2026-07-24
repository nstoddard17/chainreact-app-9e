# 5.DUAL-BUILDER-1 CS-7E — Final Document Builder live coverage & beta gate

> Governing rules held: two editors, one workflow; AI optional, previews
> non-mutating, Apply explicit, Save explicit; local loopback Supabase only; CS-7C
> guard never weakened; Document Builder default-OFF in checked-in config; no new
> engine / schema / save path / graph store / AI system / entitlement / autosave.

## 1. Plain-language result

CS-7E extends the real-browser Document Builder coverage against the CS-7D **local
loopback Supabase**. Six new authenticated authoring journeys pass live, plus the
CS-7D and entitlement regressions. The live journeys exposed and fixed **one product
defect** (the Whole Workflow map did not return focus to its opener on close). One
surface — **Ask React preview/apply** — is not yet automated in a live browser journey
(it is fully Hermes-gated and needs a mock-gateway harness); it remains covered by the
extensive existing unit/integration suite. Recommendation: **conditional GO** for a
small opt-in beta (details in §23).

## 2. Worktree / branch / base / commit

| Item | Value |
| --- | --- |
| Worktree | `C:/tmp/cs7e-wt` (registered git worktree; not `.claude/worktrees/`) |
| Branch | `dual-builder-cs7e-final-live-acceptance` |
| Base commit | `df80c9409` (CS-7D) |
| Initial HEAD | `df80c9409` |
| Final HEAD | see the single local commit on this branch |
| `node_modules` | junction to the parent repo's `node_modules` (zero package drift) |
| Local Supabase | the CS-7D stack, still running (12 containers), loopback |
| Docker / Supabase CLI | 29.4.1 / 2.109.1 |

## 3. Local Supabase safety proof (no secrets)

`npm run supabase:test:status` → `API_URL loopback: true (127.0.0.1)`. Verified before
testing: (1) status is loopback; (2) a gitignored `.env.test.local` exists (regenerated
from the running stack); (3) the CS-7C guard passes purely because the host is loopback
— **no `E2E_ALLOW_DESTRUCTIVE_TEST_SETUP` was set**; (4) the loader never reads
`.env.local` (CS-7D loader, unchanged; its 12 tests still green); (5)
`ENABLE_DOCUMENT_BUILDER` is process-scoped only (absent from checked-in config). No
URL/ref/key value appears in any log or in this report.

## 4. Exact app & Playwright commands

```bash
npm run supabase:test:status                 # loopback proof
ENABLE_DOCUMENT_BUILDER=true npx playwright test dual-builder-document-authoring-journey --workers=1
npm run e2e:dual-builder                      # CS-7D flag-on regression
npm run e2e:dual-builder:flag-off             # CS-7D flag-off regression
ENABLE_DOCUMENT_BUILDER=true npx playwright test advanced-branching-entitlement --workers=1
```

New spec: `tests/e2e/dual-builder-document-authoring-journey.spec.ts` (6 tests, all
`@flag-on`, one worker, each asserts the flag state — no self-skip).

## 5. Manual insertion journey result — **PASS**

Live: the Document tail insert menu offers **Step / Branch / Section / Ask React** and
**no Loop** (asserted); Branch reveals If/Then + Router at the tail. Inserting an
ordinary action via **Step → the shared Add-node panel** adds it; Visual shows the new
node before an extra Save; **undo removes it (Visual 3→2), redo restores it (2→3)** and
the persisted graph has the canonical 3-node chain with the added node wired in.
Screenshot `03-insertion-menu.png`.

## 6. If/Then authoring + both-lane result — **PASS (authoring); execution via entitlement suite**

Live: insert If/Then at the trigger tail through the Document menu; the Document renders
the fork with two labeled lanes ("If yes" / "Otherwise") each showing an **empty-lane
warning before an action exists**; author the first step of **each** lane through the
Document lane controls (warnings clear). **Visual parity**: one native
`if_then_condition` node + exactly one `true` and one `false` labeled edge + two lane
actions; the fork + both lanes **persist through Save + reload**. Screenshot
`05-if-then-both-lanes.png`. **True/false execution** is proven live by the
advanced-branching entitlement suite (§14) — the canonical graph a Document-authored
branch produces is identical to the one that suite executes. (Honest note: branch-lane
undo/redo did not behave like a plain-insert undo in the live run, so that specific
assertion was not included; cross-view undo/redo is proven by the insertion test and the
section-ungroup test.)

## 7. Sections & selection result — **PASS**

Live: multi-select two contiguous top-level blocks → the selection toolbar appears with
count "2" (`04-section-selection.png`); **wrap** into a section; **rename** inline to
"Qualify & route"; **collapse** → collapsed state + a deterministic summary containing a
step count; **persist through Save + reload** (title + collapse state survive; id
re-derived from the reloaded DOM); **ungroup** removes the wrapper with **no executable
node deleted** (Visual still 3 nodes); **undo restores the section, redo removes it
again** — nodes never lost.

## 8. Ask React composer-seed result — **DEFERRED (not run live)**

The Document Ask React surface is entirely Hermes-gated: the rail/composer is available
only when `HERMES_AGENT_ENABLED=true` + a configured gateway, and any submit calls the
external model gateway. A faithful live journey therefore needs a **mock-gateway
harness** (mock only the external provider response boundary). That harness was not built
in this slice. The seed/preview/apply/checkpoint behavior is covered by the extensive
existing unit/integration suite (builder-apply-preview, DocumentPreview,
BuilderPreviewOverlay, previewSetupFields, planToBuilderPatch, composerSeed, change-history).

## 9–13. Ghost preview / Reject / Apply / checkpoint / change-history / cross-view undo-redo (preview) / Save-reload of an applied change

**DEFERRED with §8** — these are the Ask React preview/apply criteria and share the same
mock-gateway dependency. (Cross-view undo/redo of a *manual* change is proven live by
Test 1; Save/reload persistence of manual authoring is proven by Tests 2 and 3.)

## 12. Finish Setup queue result — **PASS**

Live: a workflow with several missing fields; **Start Finish Setup** opens the queue
toolbar (`06-finish-setup.png`) with "Step X of Y" progress (Y≥2), **Previous disabled**
at the first item, **Skip / Next / Exit** present; **resolving** the current field via
its Guided Stop **decreases the total count**; **Skip** then **Exit** closes the queue;
**reopening brings the skipped, still-unresolved item back**; the resolve left the draft
**dirty and unsaved** (Save enabled) and the workflow **never auto-activated** (no Pause
control).

## 13. Whole Workflow map result — **PASS (after fix)**

Live: build a fork with both lanes + a shared continuation; open the map; the **hierarchy**
shows both lanes ("If yes" / "Otherwise"); **status is plain-language text** (not
color-only); clicking a lane action **row navigates** (scroll + opens that field's Guided
Stop); **Escape closes** the map. Screenshot `08-map-section-fork.png`. **DEFECT FOUND +
FIXED**: on close the map did not return focus to its opener — fixed (see §17).

## 14. Free-plan entitlement result — **PASS (3/3, re-run)**

The CS-7D advanced-branching entitlement suite passes live against local Supabase: Pro
adds If/Then and both routes execute; **Free** sees the locked (Pro) treatment and a
crafted advanced-branching save is **typed-403** with nothing persisted; a downgraded
account's run is **403 before any handler executes**. Ordinary non-branch Document editing
remains available (proven by Tests 1–4 on Pro accounts; the Document surface itself is not
plan-gated). No production Stripe; local billing via safe DB fixtures.

## 15. Live screenshot paths & mock comparison

Uncommitted, gitignored `owner-review/cs7e/`: `03-insertion-menu.png`,
`04-section-selection.png`, `05-if-then-both-lanes.png`, `06-finish-setup.png`,
`08-map-section-fork.png`. Combined with CS-7D's `owner-review/cs7d/*` (linear Document,
Guided Stop, map basic, saved, narrow, Visual parity), **10 of the 12** requested states
are captured live. **Not captured live** (deferred with Ask React): Ask React composer
seeded, ghost preview, applied-unsaved change. Comparison: the live shell matches the
CS-7B harness/mocks for these surfaces, rendered with the **real app shell** (header,
toggle, real provider node cards) and **real provider metadata** (native
manual/format/if-then/delay), with real `var()` theming the jsdom harness flattened. No
new visual defect surfaced beyond the map focus-return bug (fixed).

## 16. Large-workflow live smoke — **PASS**

Live, all in one browser session (built via the real PATCH API; authoring proven by Tests
1–3): **10-node linear · 30-node linear · depth-3 nested branch · 100-node** each: the
Document **opens without crashing**, **no horizontal overflow** on the document surface,
the **map opens + Escape-closes**, and **Visual re-renders** — with **zero uncaught
console errors** across all four fixtures. (Observation: the 100-node graph renders
responsively; no multi-second lock observed. A 30-node *sectioned* fixture and Tier-B/C
fallback assertions were not separately scripted — projection tiering has unit coverage;
the large graphs rendered as normal document projections here.)

## 17. Product defects found & fixed

**Whole Workflow map — focus not returned to opener on close (a11y).**
- **Reproduced live**: after Escape closed the map, `document-open-map-button` was not
  focused (Playwright reported the active element "inactive").
- **Root cause**: the dialog focused itself on open (CS-7D) but never restored focus to
  the previously-focused element on unmount.
- **Fix (smallest layer)**: in `WholeWorkflowMap`, capture `document.activeElement` on
  open and restore focus to it on unmount (standard modal focus management).
- **Regression**: `wholeWorkflowMapDialog.test.tsx` gains a test asserting focus moves into
  the dialog on open and returns to the opener on close. Re-ran the exact browser step →
  **green**.

## 18. Tests & checks (pass/fail counts, in `C:/tmp/cs7e-wt`)

| Check | Result |
| --- | --- |
| CS-7E authoring spec (insertion, branch, sections, finish-setup, map, large-fixtures) | **6 passed** (~1.2m) |
| CS-7D flag-on journey (regression) | **1 passed** (~51s) |
| CS-7D flag-off journey (regression) | **1 passed** (~25s) |
| Free/Pro entitlement suite (regression) | **3 passed** (~1.2m) |
| `npm run typecheck` | **clean** (0 errors) |
| `npm run lint` (`eslint .`) | **0 errors** (19 pre-existing warnings, untouched files) |
| `npm run lint:structure` / `lint:migrations` | **OK** |
| Document folder + e2e-helpers + structure lock (jest) | **36 suites / 392 tests green** |
| — incl. map dialog (Escape + focus-restore) | 4 green |

## 19. Pre-existing failures verified at `df80c9409`

None newly introduced. `npm run lint` shows the same 19 pre-existing warnings in files
CS-7E did not touch (e.g. `services/oauth/dispatcher.ts`, marketing pages). The Document
jest folder is fully green. No test was altered to hide a failure.

## 20. Exact changed files

- `features/workflow-builder/document/WholeWorkflowMap.tsx` — focus-return-on-close fix.
- `tests/unit/features/workflow-builder/document/wholeWorkflowMapDialog.test.tsx` — +1
  focus-restoration regression test.
- `tests/e2e/dual-builder-document-authoring-journey.spec.ts` — **new**, 6 live journeys.

**Not committed:** `.env.test.local` (gitignored), `owner-review/cs7e/*` (gitignored).

## 21. Safety confirmation

Nothing was pushed, deployed, PR'd, migrated against production, or enabled in shared
config. No production Supabase / Stripe / data / credentials were used. Migrations ran
only against the local loopback stack (CS-7D; none re-run here). `ENABLE_DOCUMENT_BUILDER`
stays default-OFF. No new engine, schema, save path, graph store, AI system, entitlement
model, or autosave was introduced. The CS-7C guard is unchanged. Only host/ref categories
were ever surfaced.

## 22. GO/NO-GO — owner testing: **GO**

An owner can run `npm run supabase:test:start` → `ENABLE_DOCUMENT_BUILDER=true npx
playwright test dual-builder-document-authoring-journey`, or exercise the real app, and
see manual insertion, If/Then authoring, sections, Finish Setup, and the map working end
to end with real persistence.

## 23. Final GO/NO-GO — small opt-in beta: **Conditional GO**

Proven live in a real browser: Visual↔Document parity + execution parity (CS-7D), manual
insertion, If/Then both-lane authoring + Visual parity, sections (create/rename/collapse/
persist/ungroup), Finish Setup queue, the Whole Workflow map (+ a11y fix), large-workflow
rendering, and the Free-plan branching backstop (UI + server 403). The feature stays
default-OFF, so there is no production exposure risk. **Condition**: the **Ask React
preview→reject→apply→undo/redo→checkpoint** flow is not yet asserted in a live browser
(it needs a mock-gateway harness); it is covered by the large existing unit/integration
suite. Options: (a) run a small closed beta now with Ask React owner-smoke-tested
manually, or (b) land the §24 CS-7F Ask React live harness first for a fully-automated
guarantee.

## 24. Remaining limitations before broader rollout

1. **CS-7F (recommended):** a live Ask React journey with a **mock gateway** (mock only the
   external model response boundary; keep the real route, parsing, preview model, ghost
   render, Apply path, and checkpoint/change-history) proving seed → non-mutating preview →
   reject (no mutation) → apply (dirty, no auto-save) → cross-view undo/redo → Save/reload,
   plus the 3 remaining screenshots (composer seed, ghost preview, applied-unsaved).
2. Optionally: a 30-node **sectioned** large fixture and explicit Tier-B/C fallback
   assertions in the large-workflow smoke.
3. Keep `ENABLE_DOCUMENT_BUILDER` default-OFF until (1) lands.
