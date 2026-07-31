# Rule: Workflow Builder UI

## Purpose

Define how the ChainReactV2 workflow builder is composed of small, focused components — not a single mega-file. The builder has a fixed three-pane visual layout, terminology, and interaction model.

## Resolved Decisions

**Locked for Slice 1:**
- Builder lives at `features/workflow-builder/`, decomposed into `canvas/`, `panels/`, `config-modal/`, `state/`, `hooks/`.
- The visual layout (three-pane: library / canvas / config) and interaction model are fixed.
- Provider config files cap at < 500 lines; split by tab/section if they grow.
- Field-renderer registry hand-maintained: explicit `field-type → component` map, type-safe.
- **Data access pattern (resolves "no fetch in components"):**
  - **Components:** never call raw `fetch` or `supabase.from`.
  - **Feature hooks:** may call **typed client API functions** (e.g. `apiClient.workflows.save()`) or feature services. Hooks are orchestration adapters, NOT places for business rules.
  - **Typed client API functions** live in `lib/api/<domain>.ts` — thin wrappers over `fetch` against V2 server routes.
  - **Server mutations and provider data calls** are always behind services and routes. Repositories are server-side only (see workflow-state-store rule).
- Real-time collaboration deferred. Undo/redo deferred (confirm against current V2 behavior and product scope). AI panel deferred.
- FlowEdges alignment algorithm is a DO NOT TOUCH zone — the `DEFAULT_COLUMN_X = 400` invariant must hold. It lives behind the canvas/edges interface and does not dictate the structure of the rest of the builder.

**Deferred decisions:**
- Real-time collaboration architecture (when un-deferred).
- Builder performance budget for large workflows (50+ nodes) — measure when virtualization is needed.
- Configuration validation split: field-level (debounced renderer) vs cross-field (save-time Zod) — pattern is final, specifics at implementation.

**Decisions requiring product-owner input:**
- AI panel placement in the layout when un-deferred.

## ChainReactV2 standard

The builder is decomposed so that each concern is independently changeable:

- No mega-file. The builder is split into `canvas/`, `panels/`, `config-modal/`, `state/`, and `hooks/`, each with a single responsibility.
- Components are presentational. No component performs `fetch()` or `supabase.from()`, mixes business logic with rendering, or crams unrelated concerns into a shared `useEffect`.
- Provider config files cap at < 500 lines and split by tab/section as they grow.
- Changing one concern (a node-config field, a canvas behavior, an execution status indicator) never risks breaking an unrelated concern.

## ChainReactV2 intended behavior

The builder is a feature module at `features/workflow-builder/` decomposed into independent areas, each with a clear responsibility:

```
features/workflow-builder/
├── canvas/                 # ReactFlow surface + custom node renderers
│   ├── WorkflowCanvas.tsx          # the surface
│   ├── nodes/                      # one file per node type (action, trigger, logic)
│   ├── edges/                      # FlowEdges algorithm (DO NOT TOUCH; DEFAULT_COLUMN_X = 400 invariant)
│   └── controls/                   # zoom, fit-to-view, mini-map
├── panels/
│   ├── NodeLibraryPanel.tsx        # left panel: searchable list of triggers + actions
│   ├── NodeConfigPanel.tsx         # right panel: shell for the active config modal
│   └── ExecutionStatusPanel.tsx    # bottom or right strip: run progress + error display
├── config-modal/
│   ├── ConfigModalShell.tsx        # generic modal frame (header, save/cancel)
│   ├── providers/                  # one file per provider, < 500 lines each
│   │   ├── SlackConfig.tsx
│   │   ├── GmailConfig.tsx
│   │   └── ...
│   └── fields/                     # one file per field-type renderer
│       ├── TextField.tsx
│       ├── SelectField.tsx
│       ├── KeyValueField.tsx
│       └── ...
├── state/                  # Zustand slices (see workflow-state-store rule)
└── hooks/
    ├── useWorkflowGraph.ts         # read-only graph access
    ├── useNodeConfig.ts            # config CRUD
    └── useExecutionStatus.ts       # running state
```

Every component is presentational by default. Components read state through hooks and dispatch actions through hook-returned callbacks. No component performs `fetch()` or `supabase.from()`.

The visual layout is fixed: three-pane (library / canvas / config), bottom execution strip, modal-based field editing. Components decompose internally without changing this layout.

### Responsive presentation (BUILDER-RESPONSIVE-LAYOUT-1)

> **Project-wide responsive rules — layout behavior *and* the three-part validation model
> (containment · legibility · panning policy), the 360→1600px continuous sweep, and the
> non-vacuity requirement — live in
> [responsive-layout-and-validation.md](./responsive-layout-and-validation.md).** This
> section covers only what is specific to the builder. For builder surfaces that rule adds
> four expectations: **the canvas keeps width priority** (a secondary surface becomes an
> overlay rather than shrinking the canvas to a strip); **one surface at a time** below
> `narrow`, including inside the Runs tab; **presentation changes preserve state** (both
> run surfaces stay mounted, `selectedRunId` stays the single source of truth, the rail
> keeps its transcript mounted-but-hidden); and **technical viewers stay bounded** — the
> per-step JSON block is `max-h-48 min-w-0 max-w-full overflow-auto` and is deliberately
> exempt from the no-pan declaration its surrounding panel carries.

The three-pane layout is the **wide-desktop** arrangement, not the only one. The
panes are the same components at every width; what changes is how a secondary
surface is *presented*.

**One source of viewport truth.** `features/workflow-builder/layout/builderLayoutPolicy.ts`
holds the breakpoints and the presentation decisions (pure, no React).
`layout/useBuilderLayout.ts` is the **only** module allowed to ask the browser
about width, via `matchMedia` — never `window.innerWidth`, never a `resize`
listener. `WorkflowBuilder` calls it once and threads the result down as
presentation props. `tests/structure/builder-responsive-single-viewport-source.test.ts`
enforces this.

| tier | width | agent rail | node config | header |
| --- | --- | --- | --- | --- |
| `wide` | ≥ 1280 | in-flow column (320px) | in-flow column (380px) | everything inline |
| `medium` | 900–1279 | in-flow column (272px) | **overlay sheet** | secondary → overflow menu |
| `narrow` | < 900 | **overlay sheet** | **overlay sheet** | + Test/Run → overflow, tabs on row 2 |

Rules for adding or changing a builder surface:

- **Add a `presentation` prop; don't add breakpoint utility classes.** `md:` /
  `xl:` prefixes inside a panel component are how the pre-slice builder ended up
  with a header that clipped its own Save button and a rail that stacked above
  the canvas on a phone. Presentation is decided once, centrally.
- **One instance, className switching only.** A surface must render the same
  element tree in every presentation, with its payload container at the same
  child index. That is what preserves the agent transcript, the composer draft,
  and pending config edits across a toggle or a resize. Never mount a second
  copy per layout, and never duplicate React Agent or config state.
- **Overlay behaviour is shared.** Focus-in, Tab containment, focus restore, and
  Escape come from `layout/useBuilderOverlaySurface.ts`. Don't reimplement them.
- **A resize decides nothing but presentation.** No save, activate, refit, graph
  mutation, or node repositioning may be triggered by a viewport change. The
  "one surface at a time" rule at `narrow` is enforced by wrapping the *open*
  actions, not by an effect watching the mode.
- **Phones are `narrow`, not a fourth tier.** No global CSS transform, no zoom
  trick, no second builder implementation.
- **Media queries use `min-width` only.** Browsers round fractional media-query
  lengths, so `(max-width: 1279.99px)` matches at exactly 1280px; exclusive
  bands silently mis-resolve every boundary. Check overlapping `min-width`
  queries widest-first instead.

## Single source of truth

- Builder state: `features/workflow-builder/state/` (slices: graph, selection, config, execution).
- Workflow data persistence: `repositories/workflows.ts` (called by services, not directly by components).
- Field rendering: `features/workflow-builder/config-modal/fields/`.
- Per-provider config UI: `features/workflow-builder/config-modal/providers/<provider>.tsx`.

## Allowed flows

- **Add node:** user drags from library → `state.graph.addNode(node)` → canvas re-renders from state.
- **Open config:** user clicks node → `state.selection.select(nodeId)` → `NodeConfigPanel` mounts the matching provider config component.
- **Edit config:** user types into a field → `state.config.update(field, value)` (in-progress edits separate from saved state).
- **Save config:**
  1. Component calls a hook action (e.g. `useNodeConfig().save()`).
  2. Hook / slice action calls the typed client API function `apiClient.workflows.saveNodeConfig(...)`.
  3. The API route at `app/api/workflows/[id]/nodes/[nodeId]/route.ts` calls `services/workflows.saveNodeConfig(...)`.
  4. Service calls `repositories/workflows.update(...)`.
  5. Repository performs the database write.
  6. On success, `state.graph` reflects the saved value and `state.config` resets.
- **Trigger run:**
  1. Component calls `useExecutionStatus().triggerTestRun()`.
  2. Hook calls `apiClient.execution.triggerTestRun(workflowId)`.
  3. The API route at `app/api/workflows/execute/route.ts` calls `services/execution.triggerTestRun(...)`.
  4. Service invokes the workflow engine.
  5. Engine executes; `state.execution` updates via SSE or polling on the engine's published progress.
- **Activate workflow:**
  1. Component calls `useWorkflowGraph().activate()`.
  2. Hook calls `apiClient.workflows.activate(workflowId)`.
  3. The API route at `app/api/workflows/[id]/activate/route.ts` calls `services/workflows.activate(...)`.
  4. Service runs the lifecycle orchestrator (per the workflow-lifecycle rule).
  5. Repository persists the new state and trigger registration.
  6. On success, `state.graph` reflects the new lifecycle state.

The boundary in every flow above: components only know about hooks; hooks only know about typed client API functions; server services and repositories are reached **only** via API routes. Hooks never import services or repositories.

## Disallowed behavior

- Direct `fetch()` inside any component. Always go through a hook → service.
- Direct `supabase.from()` inside any component.
- Business logic inside `useEffect`. `useEffect` is for DOM/lifecycle effects only (focus management, event listeners, scroll position). Anything that decides *what* should happen, not *when* it happens, belongs in a service or a slice action.
- State duplicated across components. Any two components rendering the same field both read from the slice; neither caches a copy.
- Cross-cutting `useEffect` chains (an effect that fires on N unrelated dependencies). One effect per concern.
- Implicit cross-component coupling via shared refs. Use slices for cross-component state.
- Components doing variable resolution. Use the canonical resolver from the workflow engine (always soft mode in builder).
- Configuration components > 500 lines. Provider configs split by tab/section if they grow.

## Edge cases

- **Concurrent edits in two tabs:** last-write-wins with optimistic UI. If the server rejects (revision-id mismatch), surface a "this workflow was modified elsewhere — reload?" prompt. No silent overwrite.
- **Unsaved changes navigation:** `state.config` exposes `isDirty`; the page navigation guard prompts before leaving.
- **Large workflows (50+ nodes):** the canvas should remain responsive. Virtualized rendering of nodes off-screen is a future concern; for slice 1 a small workflow is fine, but design the slices so virtualization can be added without restructuring.
- **Disabled fields:** when the workflow lifecycle state is `disabled` or `eligible_to_resume`, fields render disabled. The UI consumes the lifecycle projection helpers, not raw columns.
- **Real-time collaboration (multi-user editing):** deferred to a later slice. Slice 1 ships single-user editing only.
- **AI assistant panel:** deferred. Slice 1 ships without AI affordances. The builder's left panel surface should accommodate the future AI panel without restructuring.
- **Provider config that shares fields with another provider:** field-renderer components are generic by `type`. A new provider that uses only existing field types needs zero new field code.
- **Provider config with a unique widget (e.g. a calendar picker):** the provider's config component renders the widget directly; the field-type renderer registry stays minimal.
- **Field with an external data source (e.g. Slack channel list):** field component calls a hook (`useChannelList(integrationId)`); the hook calls a typed client API function (`apiClient.integrations.listChannels(integrationId)`), which hits a server route, which calls a service, which calls the repository. Components never fetch directly. Hooks never call repositories — repositories are server-side only.
- **FlowEdges alignment:** the algorithm is a DO NOT TOUCH zone. Custom-node sizing must not break the `DEFAULT_COLUMN_X = 400` invariant.

## Required tests

Component tests in `tests/unit/features/workflow-builder/`:

1. `WorkflowCanvas` renders the nodes from `state.graph` (read-only test).
2. Adding a node through the slice action causes the canvas to re-render.
3. `NodeConfigPanel` mounts the correct provider config when selection changes.
4. `ConfigModalShell` displays unsaved indicator when `state.config.isDirty`.
5. Save action calls the typed client API function (`apiClient.workflows.saveNodeConfig`); on success the config slice resets. A separate **server-side integration test** verifies the matching API route calls `services/workflows`, and the service calls `repositories/workflows.update()`. Client tests do not mock services or repositories — clients never see them.
6. Save action surfaces an error toast on failure; config slice retains the in-progress edits.
7. No component imports from `@supabase/...` directly (lint check).
8. No component contains `fetch(` (lint check).
9. No component file exceeds 500 lines (CI check, with PR-comment exception process).
10. `useEffect` audit: each effect's body is < 30 lines and operates on a single concern.

Integration test in `tests/integration/builder-flow.test.tsx` (RTL):

11. End-to-end render: load a workflow → see canvas → click node → config panel opens → edit field → save → see updated value.

E2E test in `tests/e2e/playwright/builder-slack.spec.ts`:

12. Sign in → create workflow → drag Slack trigger → configure → drag Slack action → configure → activate → see "Active" status.

## Allowed behavior

- Visual layout: three-pane (library / canvas / config), bottom execution strip.
- Interaction model: drag nodes from palette, click to configure, modal-based field editing.
- Terminology: "trigger," "action," "step," "configuration," "test run."
- ReactFlow controls and behaviors (zoom, pan, mini-map, fit-to-view).
- FlowEdges alignment algorithm — a DO NOT TOUCH zone. It lives behind the canvas/edges interface and does not dictate the builder's structure.
- Optimistic UI patterns for save / activation.
- Error display in the bottom strip when a run fails.

## Disallowed behavior

- Monolith components. Split by concern; hard cap < 500 lines.
- Inline `fetch()` calls.
- Many `useEffect`s in one file; cross-cutting effect chains.
- Business logic interleaved with rendering.
- Provider config files > 500 lines (split by tab or by sub-section).
- Direct Zustand store mutation from components (use slice actions).
- `console.log` in components (logging goes through Admin Debug Panel server-side or `useDebugStore` client-side).

## Open questions

(Real-time collaboration, AI panel placement, field-renderer registry, configuration validation split, and builder performance budget are now resolved or deferred — see "Resolved Decisions" above.)

1. **Undo / redo:** confirm against product scope whether it is required for the builder. If not required, defer until after Slice 1. The state-slice design should accommodate an undo-stack slice without restructuring graph or selection slices.
