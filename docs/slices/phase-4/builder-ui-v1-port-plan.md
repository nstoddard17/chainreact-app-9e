# Phase 4 — V1 Workflow Builder UI Audit + V2-Native Port Plan

**Slice:** 4.BUILDER-UI-V1-AUDIT-1
**Type:** Doc-only audit/planning slice. **No runtime/source/test/metadata files modified.**
**Date:** 2026-05-25
**Branch:** `builder-ui-v1-audit-1`
**HEAD at authoring:** `e919c83f6` (chore: docs/slices reorg into phase-1/phase-2/parity)
**V1 reference repo:** `chainreact-app-9e` @ `marcus_dev` (HEAD `faebdeed0`)

> **Scope guardrail.** Audit + decisions only. This slice does **not** move, rename, or rewrite any builder UI code. The implementation work is enumerated in §8 and lands across follow-up slices (BUILDER-UI-SHELL-1 … BUILDER-UI-CLOSEOUT). No backend / provider metadata / billing / AI-service changes anywhere in this track.

> **Reference policy.** V1 is reference, not truth. For every V1 pattern this doc classifies it as: **copy**, **adapt**, **replace**, **reject**, or **defer**. The goal is to use what worked in V1 while preserving V2's cleaner architecture (Zustand slices, schema-driven config, deterministic AI services, no monolithic component files).

---

## 1. Current V2 Builder UI inventory

V2's builder lives under [`features/workflow-builder/`](../../../features/workflow-builder/). The architecture is clean — Zustand slices, hooks for metadata fetch, adapters for ReactFlow translation, no single file >400 lines, no provider-specific UI code in the builder. What is **not** yet polished is the visual surface and the user-flow ergonomics.

### Files involved (V2)

| Surface | File | Lines | Status |
|---|---|---:|---|
| Route entry | [`app/workflows/[id]/page.tsx`](../../../app/workflows/[id]/page.tsx) | ~120 | production-ready |
| Top-level builder | [`features/workflow-builder/WorkflowBuilder.tsx`](../../../features/workflow-builder/WorkflowBuilder.tsx) | 139 | production-ready |
| Canvas | [`features/workflow-builder/canvas/WorkflowCanvas.tsx`](../../../features/workflow-builder/canvas/WorkflowCanvas.tsx) | 198 | **usable but rough** |
| Canvas adapters | [`features/workflow-builder/canvas/adapters.ts`](../../../features/workflow-builder/canvas/adapters.ts) | 80 | production-ready |
| Node view | [`features/workflow-builder/canvas/nodes/WorkflowNodeView.tsx`](../../../features/workflow-builder/canvas/nodes/WorkflowNodeView.tsx) | 66 | **minimal / placeholder** |
| Config modal | [`features/workflow-builder/config-modal/ConfigModalShell.tsx`](../../../features/workflow-builder/config-modal/ConfigModalShell.tsx) | 262–284 | production-ready |
| Add-node menu | [`features/workflow-builder/panels/AddNodeMenu.tsx`](../../../features/workflow-builder/panels/AddNodeMenu.tsx) | ~100 | **usable but rough** |
| AI panel | [`features/workflow-builder/panels/BuilderAiPanel.tsx`](../../../features/workflow-builder/panels/BuilderAiPanel.tsx) | 334 | production-ready (AI-11/11B) |
| Run controls | [`features/workflow-builder/panels/RunNowPanel.tsx`](../../../features/workflow-builder/panels/RunNowPanel.tsx) | 313 | production-ready |
| Run results | [`features/workflow-builder/panels/RunResultsPanel.tsx`](../../../features/workflow-builder/panels/RunResultsPanel.tsx) | 277 | usable, JSON-only |
| Run-result repair | [`features/workflow-builder/panels/RunResultsRepairBlock.tsx`](../../../features/workflow-builder/panels/RunResultsRepairBlock.tsx) | 260 | production-ready (AI-13) |
| Lifecycle / activation | [`features/workflow-builder/panels/LifecycleActions.tsx`](../../../features/workflow-builder/panels/LifecycleActions.tsx) | 189 | production-ready |
| Variable picker | [`features/workflow-builder/config-modal/fields/VariablePickerPopover.tsx`](../../../features/workflow-builder/config-modal/fields/VariablePickerPopover.tsx) | 281 | production-ready |
| Combobox field | [`features/workflow-builder/config-modal/fields/ComboboxField.tsx`](../../../features/workflow-builder/config-modal/fields/ComboboxField.tsx) | 379 | production-ready |
| State — graph | [`features/workflow-builder/state/graphSlice.ts`](../../../features/workflow-builder/state/graphSlice.ts) | 373 | production-ready |
| State — config | [`features/workflow-builder/state/configSlice.ts`](../../../features/workflow-builder/state/configSlice.ts) | 234 | production-ready |
| State — run | [`features/workflow-builder/state/runSlice.ts`](../../../features/workflow-builder/state/runSlice.ts) | ~100 | production-ready |
| API client | [`lib/api/workflows.ts`](../../../lib/api/workflows.ts) | 300+ | production-ready |
| AI API client | [`lib/api/ai.ts`](../../../lib/api/ai.ts) | — | production-ready |

### Current behavior

- **Page layout.** Server-fetched workflow → renders `WorkflowEditForm` + `WorkflowBuilder` + `RunHistory` stacked vertically inside a `max-w-3xl` container. No dedicated builder shell — the page chrome is the same as a list-detail page.
- **Builder layout.** `WorkflowBuilder` is a responsive 2-column grid (`md:grid-cols-2`). Left column: `AddNodeMenu`, canvas (or list fallback), then `BuilderAiPanel`. Right column: selected-node `ConfigModalShell` (inline aside, not an overlay). Below the columns: `RunNowPanel`, `RunResultsPanel`, `RunResultsRepairBlock`. A footer row contains the single `Save` button + status text.
- **Canvas.** ReactFlow in a fixed-height (480px) container with `Background` + `Controls`. No MiniMap. Single registered nodeType (`workflowNode`). Default edges only — no custom edge component, no plus-button insertion, no animated edges, no per-route color.
- **Node card.** 260px-wide bordered `bg-card` card. Uppercase `trigger`/`action` chip, then `provider · type` text, then `displayName`. Selected state = `border-primary` + `shadow`. No provider logo, no status badge, no run-state animation, no expandable preview, no drag handle.
- **Add trigger/action.** Two toggle buttons at the top of the canvas column ("Add trigger" / "Add action"). Clicking opens an inline picker block listing native items, then provider groups; clicking a provider drills into its actions. **No search**, no recent/favorites, no canvas-level `+` affordance, no contextual insert-on-edge.
- **Config editing.** Right-column `aside` (max-w-sm) with a header (kind · provider · displayName · description), a tab strip (only `Setup` is wired; `Advanced`/`Results`/`Data Inspector` are placeholders), then a `SchemaForm` rendering FieldMeta from the live provider/native registry. Footer has `Cancel` and `Save` with status text. Routes (router branches) validate pre-save via `_routesValidator`. Variable picker is a popover on text-shaped fields.
- **Run panel.** Branches on trigger kind (manual vs automated). Manual shows "Test Workflow" + "Run Manually"; automated shows a disabled "Test" with explanation. 409 `CONFIRMATION_REQUIRED` opens the destructive-action confirmation modal (type-the-phrase echo, SEC-4B).
- **Latest run panel.** Idle → pending → succeeded/failed → lost (after 60 polls). Step pills + per-step JSON disclosure. No formatting beyond a `<pre>` JSON dump. No empty-state copy beyond a one-line hint.
- **Repair block (AI-13).** Only on `status === "failed"`. Ask → result (value-free summary + counts + risks + warnings) → confirm + apply, reusing `POST /api/workflows/:id/ai/apply`.
- **AI panel (AI-11/11B).** Textarea (8k char counter) + "Plan with AI" → preview (counts, risk reasons, warnings, cost, needs-input list) → risk-ack checkbox if `requiresConfirmation` → Apply. Per-state copy. No chat history, no auto-apply, never echoes raw config values.
- **Save behavior.** Manual click only — no auto-save, no keyboard shortcut, no per-field save spinner. Button shows `Save` / `Saving…` / disabled when not dirty. Footer status text: "Saved." / "Unsaved changes" / specific error.
- **Validation.** Field-level inline errors inside `ConfigModalShell`. Pre-save router-routes validator. No graph-wide validation summary. No toast layer. No publish-time activation review.
- **Activation.** Separate `LifecycleActions` component (likely rendered in the page header, not inside `WorkflowBuilder`). Branches on `workflow.state` (draft → activate, active → pause, paused → resume). 409 → confirmation modal.

### Honest visual / UX assessment

| Surface | Verdict |
|---|---|
| Top-level builder shell + page chrome | functional but **placeholder-feeling** — no dedicated builder topbar, no workflow title in the builder context, no publish/activation in the builder header |
| Canvas | **usable but rough** — fixed height, no MiniMap, default edges, no insert affordance, no run-state visualization |
| Node card | **minimal / placeholder** — text-only, no provider iconography, no badges, no states |
| Add-node flow | **usable but rough** — no search, drill-in is inline rather than a side panel; works but tedious past ~3 providers |
| Config modal | **production-ready** — schema-driven, validates, error-stated, variable picker integrated |
| Variable picker | **production-ready** — popover with grouping + search-style typing |
| Run controls | **production-ready** — manual/auto branching, confirmation modal, unsaved-change warning |
| Run results | **usable, JSON-only** — no per-step formatted summary, no clipboard, no filter/expand |
| Repair block | **production-ready** — safe by design, value-free, reuses apply route |
| AI panel | **production-ready** — clear copy, risk gate, char counter, never auto-applies |
| Save / activation | **production-ready** for save; activation is fine but disconnected from builder header |
| Empty workflow state | **missing** — empty canvas shows nothing actionable beyond the small "Add trigger" button |
| Loading states | **mostly missing** — metadata fetches show plain text, not skeletons |
| Dark mode | **partially present** — Tailwind `dark:` classes scattered; no end-to-end pass |
| Accessibility | **partial** — aria labels exist in some controls; no end-to-end audit |
| Responsive | **untested** — md+ assumed, mobile hints exist but unverified |

---

## 2. V1 Builder UI inventory

V1 is the existing production builder in `chainreact-app-9e`. It is **visually polished but architecturally monolithic** — the inverse of V2.

### Files involved (V1, reference only)

| Surface | File | Lines |
|---|---|---:|
| Route entry | `app/(builder)/workflows/builder/[id]/page.tsx` | small |
| Top-level builder | `components/workflows/builder/WorkflowBuilderV2.tsx` | **~8,000** |
| Builder header | `components/workflows/builder/BuilderHeader.tsx` | ~1,028 |
| Canvas wrapper | `components/workflows/builder/FlowV2BuilderContent.tsx` | medium |
| Custom node | `components/workflows/CustomNode.tsx` | **~1,500+** |
| Edges | `components/workflows/builder/FlowEdges.tsx` | medium |
| Provider picker | `components/workflows/builder/IntegrationsSidePanel.tsx` | medium |
| Node palette | `components/workflows/NodePalette.tsx` | medium |
| Config — generic | `components/workflows/configuration/providers/GenericConfiguration.tsx` | **large** |
| Config — AI Router | `components/workflows/configuration/providers/AIRouterConfigModal.tsx` | **~52 KB** |
| Config container | `components/workflows/configuration/components/ConfigurationContainer.tsx` | small (shell) |
| Variable picker | `components/workflows/configuration/VariablePickerSidePanel.tsx` + `VariablePicker.tsx` | medium |
| Status bar | `components/workflows/builder/WorkflowStatusBar.tsx` | small |
| History dialog | `components/workflows/builder/WorkflowHistoryDialog.tsx` | medium |
| Activation review | `components/workflows/builder/ActivationReviewDialog.tsx` | small |
| Tokens | `components/workflows/builder/styles/tokens.css` | small |
| Node states / animations | `components/workflows/builder/styles/node-states.css` | small |
| AI panel | `components/workflows/builder/FlowV2AgentPanel.tsx` + `components/workflows/ai-builder/AIWorkflowBuilderChat.tsx` | medium |

### Behavior worth capturing

- **Main page layout.** Full-bleed builder shell: 12-row top header (h-12) → main row with collapsible left AI panel (`--agent-pane-width: 420px`) + canvas + collapsible right inspector (`--inspector-width: 380px`). Canvas is the visual focus.
- **Top header (BuilderHeader).** Left: Back, edit-in-place workflow title, status badge (Saving / Unsaved / Running). Right: Undo/Redo, view controls (Recenter, Lock view), secondary actions (Cloud API, History, Versions, Comments), then **primary actions: Test (outline) + Publish/Published (blue → green when active)**, Share menu, More menu (Export/Import/Duplicate/Delete/Settings). Buttons progressively hide on smaller widths.
- **Canvas.** ReactFlow with `Background variant={Dots}`. No default MiniMap. Edge style is straight 1.5px lines (`#d0d6e0`), arrowheads, widened hit area, **plus-button on edges to insert mid-chain**. Multi-color path support (6-color rotation starting `#2563EB`) for branching flows.
- **Node card (360px).** White card, `rounded-lg shadow-sm border-2`. Header row: drag handle (`GripVertical`), provider logo (6×6 SVG from `/integrations/{providerId}.svg`), title (editable), Test-this-step (`TestTube`), more menu. Subtitle. Collapsible config preview. Status badge (`text-[10px] rounded-full` in state colors: incomplete / running / passed / failed / paused / listening). State-aware handle colors. Auto-expands preview during run.
- **Node state animations** (`node-states.css`): running shimmer wave (6s), listening ring pulse (1.5s), paused gentle pulse (2s). All respect `prefers-reduced-motion`.
- **Provider/action picker (IntegrationsSidePanel).** Slide-in side panel from the right with overlay. `ProfessionalSearch` at top. Categorized: All / Apps / Logic / AI / Data. Item rows: icon + title + description, `rounded-md border p-3 hover:bg-accent`, drag-to-canvas supported.
- **Trigger setup.** Same picker UI with `mode="trigger"` prop, filtered to `isTrigger === true`. Not a separate flow.
- **Config UI.** Right side panel, full-height, 380px. `ConfigurationContainer` is the overflow-correct scrollable wrapper (avoids dropdown clipping). Some providers use collapsible sections (Slack's `SLACK_CONFIG_SECTIONS`). Per-field touches: inline validation badge, `AIFieldControl` Sparkles button, Test-this-step (`TestTube`), Variable inserter dropdown for text fields, dynamic option loaders.
- **Variable picker (side panel).** Search box, tabbed (Variables / Instructions / Snippets), collapsible groups (Trigger / Nodes / AI / System), per-variable copy + drag handle, `{{nodeId.field}}` syntax for outputs, `{{AI:summarize}}` for AI helpers.
- **Run / test controls.** Top right: Test (`Play`) + Publish/Published (`Rocket`). Per-node Test-this-step inside node cards.
- **Execution history.** Modal dialog (not a page). List view (status, timestamp, duration) → click row → Detail (run summary + step-by-step expandable trace + per-step JSON viewer + Retry button on failed runs). Filters: All / Success / Failed.
- **Validation.** `badge-incomplete` orange chip on node cards for missing required fields. Pre-publish `ActivationReviewDialog` lists unmet requirements (missing config, unconfigured nodes, disconnected integrations). Toast layer via `useToast`. Node-level error banner inside the card, clickable to expand. Execution errors classified via `ClassifiedErrorCard`.
- **Save / publish / activation.** Auto-save on name blur / config save. Status badge in header shows orange "Unsaved" → blue "Saving…" → green "Active" or grey "Not scheduled". Cmd/Ctrl+S keyboard shortcut. "Publish" → `ActivationReviewDialog` → API update.
- **Empty workflow.** No special UI. Canvas with dots + the side-panel picker invites a first node.
- **AI assistant.** Left panel, 420px, collapsible. Chat-style with message history and inline action cards from AI responses.
- **Templates.** Not surfaced inside the builder; lives on a separate `app/(app)/workflows/templates/page.tsx`. Builder can "Save as Template" (`SaveAsTemplateDialog`).
- **Styling / theme.** Tokens file (`tokens.css`) for spacing/sizes/widths. `node-states.css` for state animations. Tailwind `dark:` end-to-end. Border radius 12px (nodes), 6px (buttons), 20px (pill badges). Shadow `shadow-sm` + `box-shadow: 0 8px 24px rgba(12,18,28,0.08)` for elevated elements.

### V1 polished details worth preserving

1. **Save spinner inside the save button** (not a separate toast).
2. **Provider logo in node card** (6×6 SVG from `/integrations/{providerId}.svg`).
3. **Edge plus-button** to insert mid-chain (only visible during normal state).
4. **Click status badge to expand step output** inside the node.
5. **Validation-aware "Not configured" badge** on the node when required fields are missing.
6. **Running-shimmer / listening-ring / paused-pulse animations** (with `prefers-reduced-motion` respect).
7. **Drag handle (`GripVertical`) built into the node card** as a visual reorder affordance.
8. **Keyboard support** for header actions (Undo/Redo Cmd+Z / Cmd+Shift+Z, name edit Enter/Escape).
9. **Responsive header** — buttons collapse into the More menu on small widths.
10. **Multi-color path rotation** for branching flows so divergent routes are visually distinct.
11. **`ConfigurationContainer` overflow pattern** that prevents dropdown clipping inside scrollable forms.
12. **Pre-publish `ActivationReviewDialog`** that summarizes everything blocking publish.

### V1 patterns to REJECT

1. **Monolithic 8,000-line `WorkflowBuilderV2.tsx`** mixing canvas / state / modals / execution / undo-redo. Violates the V2 ≤500-lines rule.
2. **1,500-line `CustomNode.tsx`** mixing rendering, state logic, preview, drag, context menu.
3. **52KB-class provider-specific config files** (`AIRouterConfigModal`) with nested ternaries for fields. V2's schema-driven `SchemaForm` is the antidote — don't reintroduce per-provider config components.
4. **`ScrollArea` in config panels** (and any layout that clips dropdowns under the variable panel). V2's overflow-correct shell already solves this.
5. **No field-level auto-save feedback** — config requires explicit "Save Configuration" click. Either commit to auto-save with per-field spinners, or commit to explicit-save with a global save button; do not split.
6. **History as modal-only** (cannot be moved aside while inspecting canvas). A resizable / dockable drawer is better.
7. **Variable picker as a 380px always-visible side panel** that fights with the config form for space. A floating popover triggered from field focus scales better.

---

## 3. V1 vs V2 comparison

> Recommendation key: **copy** = port pattern as-is · **adapt** = port the idea, V2-native API · **replace** = different solution that beats V1 · **reject** = don't bring it over · **defer** = revisit later (templates, custom nodes, teams).

| Area | V1 | V2 today | Recommendation | Rationale |
|---|---|---|---|---|
| Overall page layout | Full-bleed builder shell (header + left AI + canvas + right inspector) | Stacked sections inside `max-w-3xl` | **adapt** | Move to a dedicated builder shell (3-zone: header / canvas / right inspector). Don't import V1's component graph. |
| Header / topbar | 1,028-line `BuilderHeader` with title, status, undo/redo, view, publish, share, more | Tiny footer Save button; activation lives elsewhere | **adapt** | New `BuilderHeader.tsx` ≤300 lines composing existing V2 actions (`LifecycleActions`, save, run). Match V1's layout, not its code. |
| Workflow title / status area | Edit-in-place title + colored status pill | Title rendered by parent page, no in-builder badge | **adapt** | Lift title + status pill into `BuilderHeader`. |
| Canvas | Dots background, straight edges, plus-button, color-rotation paths, full-height | Default ReactFlow, 480px fixed height, default edges | **adapt** | V2 canvas becomes full-height with `Background variant={Dots}`. Custom edge + plus-button is a small port. MiniMap optional. |
| Add trigger / action flow | Slide-in right panel with search + categories | Inline drill-in buttons | **adapt** | New `AddNodePanel.tsx` (sheet / sliding panel) with search and grouped providers. Reuse V2's existing `useNativeActions` / `useProviderActions` / `addTriggerFromMeta` / `addActionFromMeta`. |
| Provider/action picker item | Icon + title + description card | Flat button list, no icons | **adapt** | Port the card layout. Provider icons sourced from V2's metadata if available; placeholder otherwise. |
| Node card design | 360px, provider logo, title, status badge, expandable preview, drag handle, state animations | 260px text-only bordered card | **adapt** | New `WorkflowNodeCard.tsx` ~300 lines. Port the visual structure; **do not** port the inline preview/state-machine sprawl from V1's `CustomNode`. Run-state visualization from `runSlice`. |
| Node connection / edge design | Straight + plus-button + multi-color routes | Default ReactFlow edges | **adapt** | Custom edge component with plus-button. Multi-color path rotation **deferred** until router/branching has UX work. |
| Selected-node config UX | Right side panel, 380px, scrollable | Right side `aside`, max-w-sm | **copy (already aligned)** | V2 is already right-inspector. Polish only: width, header density, footer save row. |
| Modal vs side panel | Side panel for config; modal for history / activation review | Side aside for config | **copy** | Side panel is the right answer. Keep modals only for destructive confirmations / activation review / history (or replace history with a drawer in a later slice). |
| Empty workflow state | None | None | **replace** | Add a real empty state with one-click "Add trigger" CTA. V1 doesn't have this either — small improvement. |
| Save / apply UX | Auto-save + status pill | Manual Save + status text | **replace (decision §4)** | Pick one model: explicit-save with dirty-pill OR auto-save with per-action spinner. Recommendation: **explicit-save with dirty pill** (matches V2 mental model of "preview → apply" everywhere else, e.g., AI panel). |
| Run / test controls | Header buttons + per-node Test-this-step | `RunNowPanel` block below canvas | **adapt** | Promote Run + Test to header. `RunNowPanel`'s mode-branching logic stays as an internal helper, not as a visible block. |
| Run results | Modal dialog with step trace + per-step JSON + Retry | `RunResultsPanel` below canvas | **adapt** | New `RunResultsPanel` becomes a right-side drawer or below-canvas collapsible. Better step formatting than raw JSON dump. |
| Validation / error display | Inline node badge + pre-publish modal + toast | Inline field errors only | **adapt** | Add a `ValidationSummary` surface (header pill that opens a list of issues + jump-to-node). Pre-publish review can pull from the same data. |
| AI assistant placement | Left 420px panel, collapsible | Below canvas in left column | **adapt** | Move to right-side drawer (toggled from header) or keep below canvas. Recommendation: **right drawer**, mutually exclusive with the inspector — only one right panel open at a time. |
| Failed-run repair block | N/A in V1 (repair is V2-only) | Inside `RunResultsPanel` | **copy** | Keep as-is; it's already production-ready (AI-13). |
| Responsive behavior | Header progressively collapses; left/right panels collapsible | Untested; md+ assumed | **adapt** | Header collapses to More menu. Right inspector becomes a sheet on small screens. AI drawer same treatment. |
| Theme / visual language | tokens.css + node-states.css + Tailwind `dark:` end-to-end | Tailwind `dark:` scattered, no token layer | **adapt** | Port tokens.css conceptually as Tailwind config tokens. node-states.css migrates to scoped CSS or Tailwind `@apply` block. |
| Templates surface | Separate `/workflows/templates` page; "Save as Template" dialog | None | **defer** | Out of scope for this UI track. Adding a "Templates" entry in the AddNodePanel is fine **later**. |

---

## 4. V2-native architecture decision

The questions in the brief, answered:

### Three-zone layout? — **Yes.**

```
┌─────────────────────────────────────────────────────────────────────────┐
│  BuilderHeader (h-12)  title · status · undo/redo · Test · Publish · ⋯  │
├──────────────┬──────────────────────────────────────────┬───────────────┤
│              │                                          │               │
│              │                                          │  Inspector OR │
│              │             WorkflowCanvas               │  AI panel OR  │
│              │           (full remaining height)        │  Run results  │
│              │                                          │  (right       │
│              │                                          │   drawer,     │
│              │                                          │   mutually    │
│              │                                          │   exclusive)  │
└──────────────┴──────────────────────────────────────────┴───────────────┘
```

- **Header** owns workflow identity (title + status), structural actions (undo/redo, view), execution (Test, Run-now via header dropdown), and lifecycle (Publish → `ActivationReviewDialog` → activate / pause / resume). Save lives here too.
- **Canvas** is the visual focus, full remaining height. ReactFlow with Dots background, custom edges with plus-button, MiniMap optional.
- **Right drawer** is one-of-three: **Inspector** (when a node is selected), **AI panel** (when toggled from header), **Run results** (when a run completes). They are mutually exclusive — opening one closes the others. Drawer width ~420px default, resizable.
- **No persistent left panel.** V1's left AI panel competes with canvas; V2 should not duplicate that. AI lives in the right drawer alongside the inspector.

### Node config — **right inspector drawer.** Already the V2 direction.

### Add trigger/action — **floating canvas control + side panel picker.**

- A floating "+" button anchored to the canvas (bottom-center or top-left) opens the `AddNodePanel` slide-in (sheet from right).
- An empty workflow shows a centered "Add trigger" CTA in the canvas.
- Edge plus-buttons insert mid-chain (open the same `AddNodePanel` with "insert at edge X" context).

### Validation errors — **header pill + inline node badges + side summary.**

- Header pill: counts errors/warnings; click opens a `ValidationSummary` drawer.
- Inline: orange "Not configured" / red "Error" chip on the node card.
- Pre-publish: `ActivationReviewDialog` reads the same validation data.

### Save / unsaved / publish / test / run — **header.**

- **Save** (only enabled when dirty; shows spinner inside button when saving).
- **Status pill** (Saved / Unsaved / Saving / Error) immediately adjacent.
- **Test** (outline) — runs in test mode (existing `RunNowPanel.testMode`).
- **Run** (primary) — manual workflows only; opens confirmation modal if destructive.
- **Publish / Activate / Pause / Resume** (`LifecycleActions` lifted into the header, branching by `workflow.state`).
- **History** (icon button) — opens a right-drawer or modal listing runs.

### Constraints respected

- ReactFlow canvas, schema-driven config, provider ActionMeta/TriggerMeta, AI preview/apply safety, run repair UI all preserved.
- No monolithic components. Every file ≤500 lines.
- Builder UI files have **no provider-specific branches** — provider differences come from metadata only.
- Forward-compatible with templates / custom nodes / teams (the AddNodePanel and the right-drawer pattern accommodate both later).

---

## 5. Component split proposal

Target tree under `features/workflow-builder/`. **Annotations:** `new` = create · `keep` = unchanged · `polish` = small visual changes · `move` = relocate.

```
features/workflow-builder/
├── WorkflowBuilderPage.tsx                  new        — server-component page entry (replaces stacked layout in app/workflows/[id]/page.tsx)
├── WorkflowBuilder.tsx                       polish    — thin shell; composes layout components
├── layout/
│   ├── BuilderShell.tsx                      new       — 3-zone grid (header / canvas / right drawer)
│   ├── BuilderHeader.tsx                     new       — title, status, undo/redo, Test, Run, Publish, History, More
│   └── BuilderRightDrawer.tsx                new       — one-of: inspector | ai | results | validation
├── canvas/
│   ├── WorkflowCanvas.tsx                    polish    — full-height container, Dots background
│   ├── WorkflowNodeCard.tsx                  new       — replaces WorkflowNodeView; provider icon, status badge, hover/selected states
│   ├── WorkflowEdge.tsx                      new       — custom edge with plus-button
│   ├── EmptyCanvasState.tsx                  new       — centered "Add trigger" CTA when no nodes
│   ├── adapters.ts                           keep      — FlowNode/FlowEdge translation
│   └── nodes/WorkflowNodeView.tsx            move      — keep as a fallback or delete after WorkflowNodeCard is wired
├── panels/
│   ├── AddNodePanel.tsx                      new       — slide-in side panel with search + categories
│   ├── NodeInspectorPanel.tsx                polish    — wraps ConfigModalShell for drawer mount
│   ├── BuilderAiPanel.tsx                    polish    — relocated to right drawer; copy/structure unchanged (AI-11/11B contract preserved)
│   ├── RunPanel.tsx                          polish    — extract trigger-mode branching from RunNowPanel; header-mounted
│   ├── RunResultsPanel.tsx                   polish    — relocated to right drawer; better step formatting
│   ├── RunResultsRepairBlock.tsx             keep      — AI-13 contract preserved
│   └── LifecycleActions.tsx                  polish    — header-mounted; same SEC-4B confirmation contract
├── config-modal/                             keep      — ConfigModalShell + SchemaForm + fields/* unchanged
├── validation/
│   └── ValidationSummary.tsx                 new       — list of node + field issues with jump-to-node
├── state/                                    keep      — graphSlice / configSlice / runSlice unchanged
├── hooks/
│   ├── useBuilderShortcuts.ts                new       — Cmd+S save, Cmd+Z undo, Cmd+Shift+Z redo, Esc close drawer
│   ├── useRightDrawer.ts                     new       — drawer state machine (which surface is open)
│   ├── useBuilderAi.ts                       keep      — AI-11 contract preserved
│   ├── useLatestRunPolling.ts                keep      — unchanged
│   └── useNativeActions / useProviderActions keep      — metadata fetchers unchanged
└── utils/
    ├── classifyNodeStatus.ts                 new       — pure helper: graph + run + config state → 'configured' | 'unconfigured' | 'running' | 'passed' | 'failed' | 'listening' | 'paused'
    └── shouldShowPlusButton.ts               new       — pure helper for the edge plus-button visibility
```

**Hard rules:**

- No file >500 lines. If `BuilderHeader.tsx` approaches the limit, split actions into `HeaderActions.tsx`.
- No provider-specific branches in any of these files. Provider differences come from ActionMeta / TriggerMeta only.
- `ConfigModalShell` and its `fields/*` tree stay where they are — they are already production-ready.
- Existing tests under `tests/` keep passing without changes wherever possible; new tests cover new layout components.

---

## 6. Visual design direction

### Aesthetic

- Clean SaaS builder — Linear / Vercel / Stripe Dashboard reference. Generous whitespace, soft shadows, restrained color, strong type hierarchy.
- Canvas is the focus. Chrome (header + drawer) is intentionally quiet so the workflow reads first.
- Status colors carry meaning (orange = unsaved / incomplete, blue = running / saving, green = saved / passed, red = error, amber = listening / paused). Reused everywhere.

### Spacing / size tokens

- Header height: **48px** (h-12) — matches V1.
- Right drawer width: **420px** default, resizable down to 320px.
- Node card width: **300–340px** (smaller than V1's 360 — V2 nodes have less inline content). Rounded `lg` (12px).
- Edge stroke: **1.5px** at rest, **2px** on hover/selected. Color matches V1's `#d0d6e0` → `#9ca3af`.
- Border radius: 12px cards, 6px buttons, 9999px pills.

### What to copy from V1 visually

- Provider logo in node header (6×6 SVG).
- Status pill in header with same color treatment (orange / blue / green).
- Edge plus-button visible on hover.
- Save spinner inside the save button (not a toast).
- "Not configured" inline chip on incomplete nodes.

### What to modernize

- Node card with subtler shadow + cleaner spacing.
- Drawer-based right rail (V1 has both a 420 left + 380 right, V2 has one 420 right). Simpler, scales better.
- No always-visible variable picker panel — popover only.
- Validation summary as a header-launched drawer, not a modal.

### What to reject as dated / cluttered

- V1's header density — too many secondary buttons (Cloud API, Versions, Comments) crowding primary actions. Move secondaries into the More menu.
- V1's left + right + canvas tri-panel — pushes canvas into a tiny middle column on common 1280-wide laptops.
- Color-rotation paths beyond 2-3 colors — visually noisy. Defer multi-color until router UI lands.

### Where V2 should be simpler than V1

- No separate per-provider configuration components.
- No always-visible variable panel.
- No modal-only history view (drawer instead).
- No "Save as Template" surface yet.

---

## 7. UX flow recommendations

### Flow A — create from scratch

| Step | Today (V2) | Target |
|---|---|---|
| Empty workflow opens | Stacked sections, "Add trigger" toggle button | Full-bleed canvas with centered **"Choose a trigger"** CTA + empty state illustration |
| User clicks Add trigger | Inline drill-in below button | Right-side `AddNodePanel` slides in with search + categories |
| User picks a trigger | Triggers from native section or provider list | Same; node appears centered on canvas; drawer auto-closes; node is auto-selected |
| Config opens | Right column inspector appears | Right drawer (inspector) opens with the node selected |
| User adds first action | Same drill-in flow | Edge plus-button or floating "+" reopens `AddNodePanel` |
| User saves | Footer Save button | Header Save button (Cmd+S shortcut) — spinner inside the button |
| User runs | `RunNowPanel` block at the bottom | Header Test button → runs in test mode → drawer flips to Run results |

### Flow B — edit existing workflow

| Step | Today | Target |
|---|---|---|
| User clicks a node | Right column inspector opens | Right drawer (inspector) opens; canvas pans to keep node visible |
| User edits a field | Inline edit, save on form submit | Same; status pill shows "Unsaved" |
| User saves | Footer button | Header button; Cmd+S shortcut |
| User runs | Bottom panel | Header button |

### Flow C — AI-assisted build (AI-11 / AI-11B contract preserved)

| Step | Today | Target |
|---|---|---|
| User opens AI | AI panel below canvas in left column | Header **AI button** opens right drawer with the AI panel inside |
| User types a prompt | Textarea + char counter | Same |
| User clicks Plan with AI | Preview render | Same — preview structure unchanged (counts + risks + warnings + cost) |
| Required input missing | `AiRequiredInputList` shown | Same |
| Risk gate | Risk ack checkbox required | Same |
| Apply | Apply button calls AI-9B route | Same; on success, drawer flips to inspector for the first changed node |

### Flow D — failed-run repair (AI-13 contract preserved)

| Step | Today | Target |
|---|---|---|
| Run fails | `RunResultsPanel` shows failed status + step list | Right drawer flips to **Run results**; failed step is highlighted |
| Repair block appears | Inside results panel | Same; AI-13 service is unchanged |
| User clicks Suggest fix | Calls AI-7 deterministic service | Same |
| Apply repair | Calls AI-9B (apply route reuse) | Same |
| Re-run | Header Run button | Same |

---

## 8. Implementation slice plan

| Slice | Goal | Files | Behavior risk | Tests | Backend touched? |
|---|---|---|---|---|---|
| **BUILDER-UI-V1-AUDIT-1** *(shipped)* | Audit + plan | `docs/slices/phase-4/builder-ui-v1-port-plan.md` | None | None | No |
| **BUILDER-UI-SHELL-1** *(shipped)* | New `BuilderShell` + `BuilderHeader` + `useBuilderShortcuts` (Cmd/Ctrl+S). Save lifted from footer into header. `BuilderRightDrawer` + `useRightDrawer` + LifecycleActions move deferred. Behavior preserved. | `WorkflowBuilder.tsx` (composes shell), `layout/BuilderShell.tsx` (new), `layout/BuilderHeader.tsx` (new), `hooks/useBuilderShortcuts.ts` (new) | Low — layout-only; no state contracts changed | shell renders; header lifts Save + status; existing WorkflowBuilder test contract preserved | No |
| **BUILDER-CANVAS-1** *(shipped)* | Canvas polish (560px container, `rounded-lg`, Dots background, `relative overflow-hidden` for empty-state overlay), new `WorkflowNodeCard` (initials avatar, kind chip, provider label, type subtitle, "Not configured" amber badge, `data-status`, hover/selected polish — `WorkflowNodeView` deleted), new `EmptyCanvasState` overlay wired via ref bridge through `AddNodeMenu`'s "+ Add trigger" button. Run-state animations + custom edges + multi-color routes deferred. | `canvas/WorkflowCanvas.tsx`, `canvas/WorkflowNodeCard.tsx` (new), `canvas/EmptyCanvasState.tsx` (new), `utils/classifyNodeStatus.ts` (new), `WorkflowBuilder.tsx` (threads ref + callback), `panels/AddNodeMenu.tsx` (optional `triggerButtonRef`), `canvas/nodes/WorkflowNodeView.tsx` (deleted) | Low — visual-only; existing canvas-config-sync integration test preserved | node card renders metadata + status; empty state renders when 0 nodes; CTA opens trigger picker via ref bridge; classifyNodeStatus pure unit tests | No |
| **BUILDER-INSPECTOR-1** *(shipped)* | New `BuilderRightDrawer` + `useRightDrawer` + `NodeInspectorPanel`. ConfigModalShell mounted inside the drawer (internals untouched); drawer state syncs to `configSlice.activeNodeId`; Esc / × close drops both drawer and selection. Real V1 SVG provider logos copied into `public/integrations/`; `providerIconUrl()` registry helper exposes the URL; threaded through ProviderOption → adapter context → `WorkflowNodeData.providerIcon`; WorkflowNodeCard renders `<img>` with `<img onError>` initials fallback. No per-provider branches in Builder UI. | `layout/BuilderRightDrawer.tsx` (new), `hooks/useRightDrawer.ts` (new), `panels/NodeInspectorPanel.tsx` (new), `WorkflowBuilder.tsx`, `canvas/WorkflowCanvas.tsx` (+ providerIcons), `canvas/adapters.ts` (+ providerIcons context, + providerIcon data field), `canvas/WorkflowNodeCard.tsx` (img-or-initials avatar), `panels/AddNodeMenu.tsx` (+ optional iconUrl on ProviderOption), `integrations/_registry.ts` (+ `providerIconUrl()` helper), `app/workflows/[id]/page.tsx` (passes iconUrl), 25 SVG assets under `public/integrations/` | Low — mount move + additive metadata; existing canvas-config-sync + ConfigModalShell tests pass unchanged | drawer mounts/unmounts in lock-step with `activeNodeId`; Esc/× close; provider icon renders + falls back; `providerIconUrl()` round-trip; no provider-specific branches | Optional metadata helper only (`providerIconUrl`); no backend / billing / AI behavior changes |
| **BUILDER-ADD-FLOW-1** *(shipped)* | New `AddNodePanel` modal with search input + provider icons in chips + drill-in. Replaces inline `AddNodeMenu` (deleted). Picks reuse `addTriggerFromMeta` / `addActionFromMeta`. Custom `WorkflowEdge` with midpoint plus-button; `insertActionAtEdge` composition (extracted to `utils/`) rewires A→B into A→N→B by composing existing graphSlice ops (no slice contract change). Temporary CANVAS-1 `triggerButtonRef` bridge removed. `TriggerPicker` / `ActionPicker` extended additively with optional `searchQuery` + `providerIcons` props. `ProviderOption` interface relocated to AddNodePanel. | `panels/AddNodePanel.tsx` (new), `panels/_pickerShared.tsx` (new), `canvas/WorkflowEdge.tsx` (new), `utils/shouldShowPlusButton.ts` (new), `utils/insertActionAtEdge.ts` (new), `panels/TriggerPicker.tsx` (+ optional props), `panels/ActionPicker.tsx` (+ optional props), `canvas/WorkflowCanvas.tsx` (+ EDGE_TYPES, onEdgePlusClick), `canvas/adapters.ts` (+ WORKFLOW_EDGE_TYPE, onEdgePlusClick context), `WorkflowBuilder.tsx` (AddNodePanel state machine + insertActionAtEdge wire), `panels/AddNodeMenu.tsx` (deleted), `tests/unit/.../panels/AddNodeMenu.test.tsx` (deleted) | Medium — replaces the picker; insertion composition adds 4 graphSlice calls per edge insert | search filters by metadata; clicking item dispatches addTriggerFromMeta/addActionFromMeta as before; edge plus-button opens panel with insert context; insertActionAtEdge produces A→N→B topology + midpoint position | No |
| **BUILDER-RUN-PANEL-1** *(shipped)* | Test / Run buttons lifted into BuilderHeader via new `HeaderRunControls` (consumes new `useRunControls` hook — extracted state machine from the deleted `RunNowPanel`). `RunResultsPanel` + `RunResultsRepairBlock` mount inside the existing `BuilderRightDrawer` `mode: "results"` slot. Drawer mode now transitions between `inspector` and `results` based on which slice signal (`configSlice.activeNodeId` vs `runSlice.runId`) most recently changed — refs detect transitions so the two effects don't fight. Closing the drawer in results mode does NOT clear `runSlice`. Old below-canvas mounts removed. The 45 integration tests broken by ADD-FLOW-1's `AddNodeMenu` deletion were also migrated (`/add trigger/i` → `/choose a trigger/i`). | `hooks/useRunControls.ts` (new), `layout/HeaderRunControls.tsx` (new), `layout/BuilderHeader.tsx` (mounts HeaderRunControls), `WorkflowBuilder.tsx` (transition-refs sync + drawer body switch + drop below-canvas mounts), `panels/RunNowPanel.tsx` (deleted), `tests/unit/.../panels/RunNowPanel.test.tsx` (moved → `tests/unit/.../layout/HeaderRunControls.test.tsx`), 45 integration tests migrated (`/add trigger/i` → `/choose a trigger/i` bulk replace) | Medium — drawer state machine + run-panel relocation, but `useRunControls` keeps the existing testid + behavior contract verbatim | Test mode runs from header; results drawer auto-opens on new `runId`; back to inspector on node click; drawer × in results doesn't clear `runSlice`; repair block still renders on failed runs; all 33 migrated HeaderRunControls tests pass | No |
| **BUILDER-AI-PANEL-1** | `BuilderAiPanel` mounts inside `BuilderRightDrawer`. Trigger from header AI button. Contract unchanged (preview-then-apply, risk ack, no auto-apply). | `panels/BuilderAiPanel.tsx` (polish), `layout/BuilderHeader.tsx` | Low — mounting move only | AI panel renders; preview / apply flow unchanged; no raw values exposed | No |
| **BUILDER-VALIDATION-1** | `ValidationSummary` drawer surface. Header pill shows error/warning count. Inline node "Not configured" chip. Pre-publish `ActivationReviewDialog` reads same data. | `validation/ValidationSummary.tsx` (new), `canvas/WorkflowNodeCard.tsx` (chip), `layout/BuilderHeader.tsx` (pill) | Low — surfaces existing validation data; no new validation logic | pill counts match; clicking jumps to node; node chip renders when fields missing | No |
| **BUILDER-RESPONSIVE-1** | Responsive collapse: header → More menu on narrow widths; right drawer → sheet on mobile. Dark-mode end-to-end pass. Accessibility pass (aria roles, focus management on drawer open). | All layout + panel files | Low — additive | dark-mode snapshot; responsive breakpoint tests; focus-trap on drawer | No |
| **BUILDER-UI-CLOSEOUT** | Tests + screenshots + outcomes doc. Optional Playwright walkthrough if e2e structure exists. | `docs/slices/phase-4/builder-ui-port-outcomes.md` (new) | None | Smoke playthrough | No |

**Order rationale:** SHELL first (skeleton), CANVAS second (visible improvement quickly), INSPECTOR third (mount move), ADD-FLOW fourth (highest UX leverage). RUN / AI / VALIDATION can interleave. RESPONSIVE last (touches everything; needs everything stable). CLOSEOUT documents.

**Out of scope across the entire track:** backend execution, provider metadata, billing/tasks, AI service behavior, templates, custom nodes, teams/workspaces, full AI chat persistence.

### BUILDER-UI-SHELL-1 outcomes (shipped)

Layout foundation only. **No panel relocation in this slice** — every existing surface (canvas, AddNodeMenu, ConfigModalShell aside, BuilderAiPanel, RunNowPanel, RunResultsPanel, RunResultsRepairBlock, LifecycleActions on the page header) stays mounted where it is. The only behavioral change is that the previous footer Save row is now lifted into the new header strip.

**Added:**

- [`features/workflow-builder/layout/BuilderShell.tsx`](../../../features/workflow-builder/layout/BuilderShell.tsx) — 27-line shell. Composes `header` + `children` regions; landmark `role="region" aria-label="Workflow builder shell"`. No state, no behavior.
- [`features/workflow-builder/layout/BuilderHeader.tsx`](../../../features/workflow-builder/layout/BuilderHeader.tsx) — 135-line compact 48px strip. Reads `isDirty / isSaving / saveError / save` straight from `useGraphSlice`; owns Save button + status pill (Saved / Saving… / Unsaved changes / `role="alert"` save-error). Renders workflow display name (read-only) on the left. Wires Cmd/Ctrl+S via `useBuilderShortcuts`.
- [`features/workflow-builder/hooks/useBuilderShortcuts.ts`](../../../features/workflow-builder/hooks/useBuilderShortcuts.ts) — 36-line hook. Currently only Cmd/Ctrl+S → `onSave` with `preventDefault` always. Modifier guards reject Shift / Alt combos. Designed to extend with Esc + undo/redo in later slices.

**Integrated:** [`features/workflow-builder/WorkflowBuilder.tsx`](../../../features/workflow-builder/WorkflowBuilder.tsx) now composes `<BuilderShell header={<BuilderHeader workflowName={workflow.name} />}>` around the existing AddNodeMenu + 2-column canvas/inspector body. The footer Save row + duplicate `savedAt` local state were removed (lifted into `BuilderHeader`). Net: 139 → 105 lines, well under the 500-line guardrail.

**Behavior preserved (verified by `tests/unit/features/workflow-builder/WorkflowBuilder.test.tsx` — 6 existing tests pass unchanged):**

- Hydration on mount + slice reset on unmount.
- `addTrigger` / `addAction` round-trips through the same `AddNodeMenu` flow.
- Save button still has accessible name `/^Save$/i`, still disabled when clean, still dispatches `updateWorkflow` with the pending definition, still shows "Saved." after success and `role="alert"` with "failed to save" on error.
- `LifecycleActions` continues to read `useGraphSlice.isDirty` from the page header.

**Intentionally deferred (called out per the brief):**

- **LifecycleActions placement.** Currently still mounted in the page header (`app/workflows/[id]/page.tsx`). Moving it requires either deleting the page-header h1 (visible regression risk) or accepting visible duplication. Deferred to a follow-up slice that resolves the page-header h1 question (likely folded into BUILDER-CANVAS-1 once the canvas takes full-bleed, or pulled out into its own micro-slice).
- **Test / Run controls in header.** `RunNowPanel` still renders below canvas. Owner: **BUILDER-RUN-PANEL-1**.
- **AI panel in header / right drawer.** `BuilderAiPanel` still renders in-flow below `RunResultsPanel`. Owner: **BUILDER-AI-PANEL-1**.
- **Inspector in right drawer.** `ConfigModalShell` still renders as a right-side `aside` inside `WorkflowBuilder`. Owner: **BUILDER-INSPECTOR-1**.
- **`AddNodePanel` slide-in.** `AddNodeMenu` inline drill-in still in place. Owner: **BUILDER-ADD-FLOW-1**.
- **Custom edges + plus-button + empty canvas state + node card.** Owner: **BUILDER-CANVAS-1** / **BUILDER-ADD-FLOW-1**.
- **ValidationSummary pill.** Owner: **BUILDER-VALIDATION-1**.
- **`BuilderRightDrawer` + `useRightDrawer`.** Skipped in this slice — adding the drawer container without anything to mount inside it would be dead scaffolding. First payload (config inspector) lands in **BUILDER-INSPECTOR-1**.
- **Undo / redo + Esc shortcuts.** Slice support doesn't exist yet; `useBuilderShortcuts` deliberately only handles Cmd/Ctrl+S today.
- **Page-header h1 + status badge duplication with `BuilderHeader`.** Both currently render the workflow name; resolved when LifecycleActions migrates (see above).

**Tests added:**

- [`tests/unit/features/workflow-builder/layout/BuilderShell.test.tsx`](../../../tests/unit/features/workflow-builder/layout/BuilderShell.test.tsx) — 3 tests (regions render; landmark present; header precedes content in DOM order).
- [`tests/unit/features/workflow-builder/layout/BuilderHeader.test.tsx`](../../../tests/unit/features/workflow-builder/layout/BuilderHeader.test.tsx) — 8 tests covering: landmark + name; Save button accessible-name preservation; idle/unsaved/saving/saved/error pill states (error driven through the slice's real save() path); Save dispatch via `updateWorkflow` mock; Cmd+S triggers save when dirty; Cmd+S is a no-op when clean.
- [`tests/unit/features/workflow-builder/hooks/useBuilderShortcuts.test.tsx`](../../../tests/unit/features/workflow-builder/hooks/useBuilderShortcuts.test.tsx) — 9 tests covering Cmd+S / Ctrl+S; Shift / Alt + S rejected; other keys with modifier rejected; plain S rejected; `preventDefault` fires; unmount removes listener; safe without `onSave`.

**Gate results:** typecheck OK · lint OK (5 pre-existing warnings unrelated) · lint:structure OK · lint:migrations OK · 49 workflow-builder unit suites / 711 tests pass.

### BUILDER-CANVAS-1 outcomes (shipped)

Visual-only slice. **No panel relocation.** Same `WorkflowNodeData` shape, same `Handle` topology, same `data-testid="workflow-node-view"` selector contract, same node click → `configSlice.openNode` → inspector path. Everything still hangs together through the unchanged graphSlice + adapters layer.

**Added:**

- [`features/workflow-builder/utils/classifyNodeStatus.ts`](../../../features/workflow-builder/utils/classifyNodeStatus.ts) — 38-line pure helper. Today emits `configured` / `unconfigured` based on `type !== ""`. The full `NodeStatus` union (`running` / `passed` / `failed` / `listening` / `paused`) is declared and the helper accepts an optional `runStatus` pass-through so future per-node run-state projection lands without rewiring call sites or extending the type union.
- [`features/workflow-builder/canvas/WorkflowNodeCard.tsx`](../../../features/workflow-builder/canvas/WorkflowNodeCard.tsx) — 165-line replacement for `WorkflowNodeView`. 320px card, `rounded-lg`, soft shadow, primary-ring on selected, subtle hover-lift. Header row: provider initials avatar + provider label + kind chip + "Not configured" amber badge when `type === ""`. Type subtitle. Same handle topology (triggers omit top target). Same testid + data-attributes — adds `data-status` for future run-state styling.
- [`features/workflow-builder/canvas/EmptyCanvasState.tsx`](../../../features/workflow-builder/canvas/EmptyCanvasState.tsx) — 67-line absolutely-positioned overlay. Centered card with heading "Choose a trigger", supporting copy, and a primary CTA button. `pointer-events-none` wrapper + `pointer-events-auto` card so the rest of the canvas stays interactive everywhere except the card region. Optional `onAddTrigger` callback.

**Wired:**

- [`features/workflow-builder/canvas/WorkflowCanvas.tsx`](../../../features/workflow-builder/canvas/WorkflowCanvas.tsx) — `NODE_TYPES` now maps to `WorkflowNodeCard`. Container height 480 → 560 (modest bump; true full-bleed needs page-shell changes, deferred). Container class `rounded border-input` → `relative overflow-hidden rounded-lg border-input` so the empty-state overlay can position absolutely without clipping. `Background` upgraded to `BackgroundVariant.Dots`. `EmptyCanvasState` rendered when `pendingNodes.length === 0` with an `onAddTrigger` prop threaded through.
- [`features/workflow-builder/panels/AddNodeMenu.tsx`](../../../features/workflow-builder/panels/AddNodeMenu.tsx) — adds an optional `triggerButtonRef?: RefObject<HTMLButtonElement | null>` prop forwarded onto the "+ Add trigger" `<button>`. Surface is non-breaking; all existing tests still pass.
- [`features/workflow-builder/WorkflowBuilder.tsx`](../../../features/workflow-builder/WorkflowBuilder.tsx) — creates the ref and a `handleEmptyAddTrigger` callback that calls `addTriggerButtonRef.current?.click()`. Passes the ref into `AddNodeMenu` and the callback into `WorkflowCanvas`. **No state lifting** — `AddNodeMenu`'s local `open: OpenMenu` stays exactly as it was. The ref bridge is temporary; it disappears in BUILDER-ADD-FLOW-1 when `AddNodePanel` replaces `AddNodeMenu`.

**Deleted:**

- `features/workflow-builder/canvas/nodes/WorkflowNodeView.tsx` (66 lines) — superseded by `WorkflowNodeCard`. Git history preserves it.

**Behavior preserved (verified):**

- `tests/integration/features/workflow-builder/canvas-config-sync.test.tsx` — 6 tests unchanged. Canvas still renders 2 nodes from `graphSlice`, NodeList renders the same 2, clicking a canvas node still opens the inspector via `configSlice.openNode`, NodeList Configure still mirrors selection onto the canvas, canvas click does NOT call `updateWorkflow`, NodeList Remove still propagates, toolbar Save still calls `updateWorkflow` with the full pending definition.
- `tests/unit/features/workflow-builder/canvas/NodeList.test.tsx` — unchanged, all passing.
- `tests/unit/features/workflow-builder/WorkflowBuilder.test.tsx` — 7 tests (6 pre-existing + 1 new ref-bridge test). The original `/empty workflow/i` text from `NodeList`'s empty state still renders below the canvas; the new `EmptyCanvasState` heading "Choose a trigger" overlays the canvas. Two empty-state surfaces coexist temporarily (NodeList is slated for removal in a later slice when the canvas takes over fully).

**Intentionally deferred (called out per the brief):**

- **Run-state animations.** Running shimmer / listening ring / paused pulse / running-node primary-color glow. The `classifyNodeStatus` helper and `WorkflowNodeCard`'s `data-status` attribute are designed to host these later. Owner: a follow-up slice after per-node run-state projection lands (currently `runSlice` only carries workflow-level `LatestRunStatus`).
- **Multi-color route rotation** for branching flows. Owner: a router/branching UX slice.
- **Custom edges + edge plus-button.** Owner: **BUILDER-ADD-FLOW-1**.
- **MiniMap.** Skipped — would clutter the canvas before page-shell expansion.
- **True full-bleed canvas height.** Needs page-shell + parent-container changes (e.g. removing `max-w-3xl` on `app/workflows/[id]/page.tsx`) that risk regressing the surrounding controls. Modest 560px bump shipped instead.
- **Inspector drawer / AI drawer / Run results drawer.** Owners: **BUILDER-INSPECTOR-1** / **BUILDER-AI-PANEL-1** / **BUILDER-RUN-PANEL-1** respectively.
- **`AddNodePanel` slide-in replacement.** Owner: **BUILDER-ADD-FLOW-1**. (When it lands the temporary `triggerButtonRef` prop on `AddNodeMenu` + the canvas's `onEmptyAddTrigger` callback collapse into a direct panel-open call.)
- **Real provider iconography.** No `/integrations/{provider}.svg` convention exists in V2 today (verified — `public/` doesn't exist in this repo). Initials-avatar fallback ships now; SVG asset adoption is a separate metadata concern handled later.
- **Removing NodeList.** Still rendered below the canvas as a defensive secondary view. Removal lands once the canvas card surface is stable and the inspector lives in the drawer.

**Tests added:**

- [`tests/unit/features/workflow-builder/utils/classifyNodeStatus.test.ts`](../../../tests/unit/features/workflow-builder/utils/classifyNodeStatus.test.ts) — 3 tests (configured / unconfigured / runStatus passthrough across all 5 future branches).
- [`tests/unit/features/workflow-builder/canvas/WorkflowNodeCard.test.tsx`](../../../tests/unit/features/workflow-builder/canvas/WorkflowNodeCard.test.tsx) — 12 tests covering testid preservation, kind/provider/type rendering, providerLabel fallback to provider id, `data-kind` for trigger vs action, selected vs unselected, `data-status` + "Not configured" badge, initials avatar (no per-provider branches), `computeInitials` helper edge cases.
- [`tests/unit/features/workflow-builder/canvas/EmptyCanvasState.test.tsx`](../../../tests/unit/features/workflow-builder/canvas/EmptyCanvasState.test.tsx) — 4 tests (CTA + heading + copy render; `onAddTrigger` fires on click; safe without handler; testid + landmark).
- `tests/unit/features/workflow-builder/WorkflowBuilder.test.tsx` — 1 new test ("the empty-canvas-state 'Choose a trigger' CTA opens the AddNodeMenu trigger picker via the ref bridge"). Verifies the ref bridge end-to-end without duplicating add-node logic.

**Gate results:** typecheck OK · lint OK (5 pre-existing warnings unrelated) · lint:structure OK · lint:migrations OK · 52 workflow-builder unit suites / 732 tests pass (+3 suites +21 tests vs. SHELL-1) · full unit run: 1107 suites / 13153 tests pass.

### BUILDER-INSPECTOR-1 outcomes (shipped)

Two-part slice. **Part A** moves the node-configuration inspector into a real right-side drawer (first payload of the future drawer modal-exclusion state machine). **Part B** ports V1's provider SVG logos into V2 and exposes them through the registry — `WorkflowNodeCard` now renders real provider iconography, no per-provider branches.

#### Part A — Drawer + Inspector

**Added:**

- [`features/workflow-builder/hooks/useRightDrawer.ts`](../../../features/workflow-builder/hooks/useRightDrawer.ts) — 56-line pure local state hook. `mode: "inspector" | "ai" | "results" | "validation" | null`. `openDrawer` / `closeDrawer` / `toggleDrawer` are `useCallback`-stable across renders so consumers can safely list them in effect deps. Mutual exclusion via single `mode` field — opening any mode replaces the previous.
- [`features/workflow-builder/layout/BuilderRightDrawer.tsx`](../../../features/workflow-builder/layout/BuilderRightDrawer.tsx) — 75-line presentational chrome (`role="region"` with `aria-label="Workflow builder drawer: {title}"` to avoid colliding with ConfigModalShell's existing `role="complementary"` landmark name; 420px wide on md+; full-width on small screens; header + × close + scrollable content region; Esc-to-close at document level, respects `event.defaultPrevented` so nested popovers / autocompletes can swallow Esc first; listener removed on unmount).
- [`features/workflow-builder/panels/NodeInspectorPanel.tsx`](../../../features/workflow-builder/panels/NodeInspectorPanel.tsx) — 30-line wrapper around `ConfigModalShell`. Adds `data-testid="node-inspector-panel"` for parent-drawer integration; ConfigModalShell internals (`SchemaForm`, field renderers, metadata lookup, Save / Cancel, router-routes validator) untouched.

**Wired:**

- [`features/workflow-builder/WorkflowBuilder.tsx`](../../../features/workflow-builder/WorkflowBuilder.tsx) — composes `useRightDrawer` and bridges it to `configSlice.activeNodeId`:
  - When `activeNodeId !== null` and `mode !== "inspector"` → `openDrawer("inspector")`.
  - When `activeNodeId === null` and `mode === "inspector"` → `closeDrawer()`.
  - Drawer × / Esc handler also calls `closeNode()` when in inspector mode so canvas selection and drawer stay in lock-step. Future modes (AI / Results / Validation) won't touch configSlice when they land in later slices.
  - The old right-column `<ConfigModalShell />` aside is gone; the drawer mounts conditionally on `mode === "inspector" && activeNodeId !== null`.

**ConfigModalShell drawer integration summary:** zero diff to `ConfigModalShell.tsx`, `SchemaForm.tsx`, or any field renderer. The drawer wraps the existing shell with chrome and threads `activeNodeId` changes through the right-drawer state machine. Cancel + Save behaviors inside ConfigModalShell are unchanged; the integration test `canvas-config-sync.test.tsx` (which finds the shell via `getByRole("complementary", { name: /node configuration/i })`) passes unchanged because the drawer deliberately uses `role="region"` with a distinct label.

**Behavior preserved (verified):**

- All 6 `canvas-config-sync.test.tsx` integration tests pass unchanged: canvas + NodeList still see the same nodes; canvas click → opens the same inspector NodeList Configure does; canvas click does NOT call `updateWorkflow`; NodeList Remove propagates to canvas; toolbar Save calls `updateWorkflow` with the full pending definition.
- All 9 `WorkflowBuilder.test.tsx` tests pass (6 pre-SHELL/CANVAS + 1 CANVAS-1 ref bridge + 2 new INSPECTOR-1 drawer-mount tests).
- 52 unit + 1 integration workflow-builder suites all green.

#### Part B — Metadata-driven provider icons

**Added:**

- `providerIconUrl(id)` helper in [`integrations/_registry.ts`](../../../integrations/_registry.ts) — 17-line registry helper. Convention: `/integrations/{providerId}.svg`. Returns `undefined` for unknown providers (so `getByRole` doesn't render broken `<img>`). Asset existence is NOT validated at build time — `WorkflowNodeCard` falls back to its initials avatar via `<img onError>` when a file is missing.
- 25 V1 provider SVG assets ported into `public/integrations/`:
  - Direct copies (23): airtable, discord, dropbox, facebook, github, gmail, google-analytics, google-calendar, google-docs, google-drive, google-sheets, hubspot, mailchimp, microsoft-excel, microsoft-onenote, microsoft-outlook, microsoft-teams, monday, notion, shopify, slack, stripe, trello.
  - Renamed on copy (2): V1's `onedrive.svg` → `microsoft-onedrive.svg`; V1's `microsoft-outlook.svg` also copied as `microsoft-outlook-calendar.svg` (Microsoft Outlook product family shares iconography in V1).

**Plumbed:**

- [`app/workflows/[id]/page.tsx`](../../../app/workflows/[id]/page.tsx) — derives `iconUrl` from `providerIconUrl(p.id)` when building `triggerProviders` / `actionProviders`.
- [`features/workflow-builder/panels/AddNodeMenu.tsx`](../../../features/workflow-builder/panels/AddNodeMenu.tsx) — `ProviderOption` now has optional `iconUrl?: string`.
- [`features/workflow-builder/WorkflowBuilder.tsx`](../../../features/workflow-builder/WorkflowBuilder.tsx) — adds `buildProviderIconMap` (mirror of `buildProviderLabelMap`) and passes it through to `WorkflowCanvas`.
- [`features/workflow-builder/canvas/WorkflowCanvas.tsx`](../../../features/workflow-builder/canvas/WorkflowCanvas.tsx) — accepts `providerIcons?` prop and forwards through `workflowNodesToFlowNodes` context.
- [`features/workflow-builder/canvas/adapters.ts`](../../../features/workflow-builder/canvas/adapters.ts) — `NodeConversionContext` adds `providerIcons?`; `WorkflowNodeData` adds optional `providerIcon?: string`.
- [`features/workflow-builder/canvas/WorkflowNodeCard.tsx`](../../../features/workflow-builder/canvas/WorkflowNodeCard.tsx) — old `ProviderInitialsAvatar` replaced with `ProviderAvatar`: renders `<img src={iconUrl}>` when present, falls back to initials avatar on `<img onError>` or when icon is absent. **No per-provider branches** — the icon URL flows in from metadata; the card just renders or falls back.

**Icon metadata field name:** `iconUrl` (string) on `ProviderOption` and `providerIcon` (string) on `WorkflowNodeData`. The registry helper is `providerIconUrl(id)`. The asset itself lives at `/integrations/{providerId}.svg`.

**Initials fallback behavior:** unchanged from CANVAS-1 — the same deterministic 1–2 letter initials with hash-derived `bg-sky / emerald / violet / amber / rose / indigo` palette. Triggered when the metadata layer doesn't supply an icon OR when the `<img>` errors at runtime (missing / malformed SVG, network failure).

**Tests added:**

- [`tests/unit/features/workflow-builder/hooks/useRightDrawer.test.tsx`](../../../tests/unit/features/workflow-builder/hooks/useRightDrawer.test.tsx) — 6 tests (initial closed; openDrawer; mutual exclusion across all 4 modes; closeDrawer; toggleDrawer open/close/switch; stable callbacks across renders).
- [`tests/unit/features/workflow-builder/layout/BuilderRightDrawer.test.tsx`](../../../tests/unit/features/workflow-builder/layout/BuilderRightDrawer.test.tsx) — 6 tests (testid + role + dynamic aria-label + title + children; close button; Esc closes; Esc with `defaultPrevented` does NOT close; listener removed on unmount; title prop updates aria-label).
- [`tests/unit/features/workflow-builder/panels/NodeInspectorPanel.test.tsx`](../../../tests/unit/features/workflow-builder/panels/NodeInspectorPanel.test.tsx) — 3 tests (testid wrapper; ConfigModalShell stays null when no active node; ConfigModalShell renders after `openNode`).
- [`tests/unit/integrations/providerIconUrl.test.ts`](../../../tests/unit/integrations/providerIconUrl.test.ts) — 3 tests (known-provider URLs; unknown id → undefined; every manifest in `listProviders()` resolves).
- `tests/unit/features/workflow-builder/canvas/WorkflowNodeCard.test.tsx` — 4 new tests (renders `<img>` when `providerIcon` supplied; falls back to initials on `<img onError>`; falls back when `providerIcon` absent; fictional-provider URL passes through to `<img src>` — no per-provider branches).
- `tests/unit/features/workflow-builder/WorkflowBuilder.test.tsx` — 2 new tests (drawer mounts when node opened; drawer × drops `activeNodeId` AND unmounts drawer).

**Intentionally deferred:**

- **AddNodePanel slide-in replacement.** Owner: **BUILDER-ADD-FLOW-1**.
- **Custom edges + edge plus-button.** Owner: **BUILDER-ADD-FLOW-1**.
- **AI panel into right drawer.** Owner: **BUILDER-AI-PANEL-1**. (The `mode: "ai"` slot is reserved.)
- **Run results into right drawer.** Owner: **BUILDER-RUN-PANEL-1**. (The `mode: "results"` slot is reserved.)
- **ValidationSummary into right drawer.** Owner: **BUILDER-VALIDATION-1**. (The `mode: "validation"` slot is reserved.)
- **Run-state animations** (running shimmer / listening ring / paused pulse). Owner: a follow-up slice after per-node run-state projection lands.
- **Provider-icon visibility in the trigger/action picker rows.** Today the icons only render on the canvas node card; the `AddNodeMenu` picker items still render text-only. Will fold into **BUILDER-ADD-FLOW-1** when `AddNodePanel` replaces the inline picker.
- **MiniMap.** Skipped until page-shell takes full-bleed.
- **LifecycleActions move into header.** Still in the page-header.
- **`AddNodeMenu` deletion / replacement.** Still hosts the legacy inline picker plus the new `triggerButtonRef` ref bridge.

**Gate results:** typecheck OK · lint OK (5 pre-existing warnings unrelated) · lint:structure OK · lint:migrations OK · 56 workflow-builder unit suites / 760 tests pass (+4 suites +28 tests vs CANVAS-1) · full unit run: 1111 suites / 13177 tests pass (+4 suites +24 tests vs CANVAS-1) · canvas-config-sync integration: 6 tests pass unchanged.

### BUILDER-ADD-FLOW-1 outcomes (shipped)

The biggest single UX upgrade in the track. Replaces the inline drill-in `AddNodeMenu` with a searchable modal `AddNodePanel` that surfaces every provider chip with its real V1 SVG icon. Adds a custom `WorkflowEdge` with a midpoint plus-button so users can insert actions mid-chain. The CANVAS-1 ref bridge is gone — the empty-state CTA now opens the modal directly.

**Added:**

- [`features/workflow-builder/panels/AddNodePanel.tsx`](../../../features/workflow-builder/panels/AddNodePanel.tsx) — 167-line modal shell. Composes the existing `TriggerPicker` / `ActionPicker` (now extended with `searchQuery` + `providerIcons` props). Three modes: `trigger`, `action`, `insertAction { edgeId }`. Autofocus on the search input. Esc + backdrop click + × close. Picks call back via `onPickTrigger(meta)` or `onPickAction(meta, insertContext | null)` then auto-close. `role="dialog"` on the inner card with the dynamic title as label; the outer overlay is the backdrop. **`ProviderOption` interface lives here now** (canonical source) — was previously exported from the now-deleted `AddNodeMenu.tsx`.
- [`features/workflow-builder/panels/_pickerShared.tsx`](../../../features/workflow-builder/panels/_pickerShared.tsx) — 95-line shared helpers (`filterMetasBySearch`, `ProviderChipIcon`) used by both pickers. `ProviderChipIcon` mirrors the avatar policy in `WorkflowNodeCard` (img + onError fallback to a single-letter disc).
- [`features/workflow-builder/canvas/WorkflowEdge.tsx`](../../../features/workflow-builder/canvas/WorkflowEdge.tsx) — 110-line custom edge with bezier path + `EdgeLabelRenderer` plus-button at midpoint. Visibility gated by `shouldShowPlusButton` (sees `isDragging`, `isSaving`, `hasResolvedEndpoints`). Click dispatches `data.onPlusClick(edgeId)` so the canvas can open the panel for that edge.
- [`features/workflow-builder/utils/shouldShowPlusButton.ts`](../../../features/workflow-builder/utils/shouldShowPlusButton.ts) — 31-line pure helper. No graph / provider knowledge — just policy.
- [`features/workflow-builder/utils/insertActionAtEdge.ts`](../../../features/workflow-builder/utils/insertActionAtEdge.ts) — 87-line composition that turns A→B into A→N→B by composing `addActionFromMeta` + `removeEdge` (auto-edge + original edge) + `connectNodes(A,N)` + `connectNodes(N,B)` + `updateNodePosition(N, midpoint)`. No graphSlice contract change. Bails on missing edge id (no partial mutation).

**Extended additively (pre-existing tests pass unchanged):**

- [`features/workflow-builder/panels/TriggerPicker.tsx`](../../../features/workflow-builder/panels/TriggerPicker.tsx) — optional `searchQuery` filters native + drilled-in lists; optional `providerIcons` renders icons in chips + drill-in header.
- [`features/workflow-builder/panels/ActionPicker.tsx`](../../../features/workflow-builder/panels/ActionPicker.tsx) — same additive props.
- [`features/workflow-builder/canvas/adapters.ts`](../../../features/workflow-builder/canvas/adapters.ts) — new `WORKFLOW_EDGE_TYPE` constant, `EdgeConversionContext` with `onEdgePlusClick`, `workflowEdgesToFlowEdges` accepts the context and stamps `type: WORKFLOW_EDGE_TYPE` + `data: { onPlusClick }` on every flow edge.
- [`features/workflow-builder/canvas/WorkflowCanvas.tsx`](../../../features/workflow-builder/canvas/WorkflowCanvas.tsx) — registers `EDGE_TYPES` for the custom edge, threads `onEdgePlusClick` into `workflowEdgesToFlowEdges`.
- [`features/workflow-builder/WorkflowBuilder.tsx`](../../../features/workflow-builder/WorkflowBuilder.tsx) — adds the `addPanelMode` state machine (`trigger | action | insertAction | null`), `+ Add action` canvas-adjacent button gated on `hasTrigger`, `handleEdgePlusClick(edgeId)` opens the panel in `insertAction` mode, `handlePickTrigger` / `handlePickAction` dispatch through graphSlice / `insertActionAtEdge`. Removes the `triggerButtonRef` ref bridge + `addTriggerButtonRef` ref.

**Deleted:**

- `features/workflow-builder/panels/AddNodeMenu.tsx` (125 lines) — superseded by `AddNodePanel`.
- `tests/unit/features/workflow-builder/panels/AddNodeMenu.test.tsx` (520 lines) — equivalent surface now covered by AddNodePanel.test.tsx + WorkflowBuilder.test.tsx flows.

**AddNodePanel behavior summary:**

| Surface | Behavior |
|---|---|
| Open in trigger mode | EmptyCanvasState CTA. Title "Choose a trigger". Renders TriggerPicker. |
| Open in action mode | Canvas-adjacent `+ Add action` button (gated on hasTrigger). Title "Choose an action". Renders ActionPicker. |
| Open in insertAction mode | WorkflowEdge plus-button. Title "Insert action". Renders ActionPicker; on pick → `insertActionAtEdge(edgeId, meta)`. |
| Search | Autofocused input; filters native list + drilled-in provider list by `displayName + description` (case-insensitive). Provider chips stay visible regardless. |
| Provider icons in chips | `providerIcons` map threaded from `providerIconUrl(p.id)`. `<img onError>` falls back to a single-letter disc. |
| Close | × button, Esc (respects `defaultPrevented`), backdrop click. Pick auto-closes. |

**AddNodeMenu replacement decision:** **deleted**. Equivalent functionality + a search bar + provider icons live in AddNodePanel. No fallback retained — keeping AddNodeMenu around would duplicate add-node logic (against slice guidance).

**EmptyCanvasState integration:** `WorkflowBuilder` passes `openTriggerPicker` directly as `onEmptyAddTrigger`. The CANVAS-1 `triggerButtonRef` bridge through `AddNodeMenu`'s "+ Add trigger" button is gone — EmptyCanvasState's CTA now directly opens the modal.

**WorkflowEdge / plus-button behavior:** Renders only when `data.onPlusClick` is supplied (canvas threads it) and `shouldShowPlusButton({hasResolvedEndpoints})` returns true. Click → `onPlusClick(edgeId)` → WorkflowBuilder's `handleEdgePlusClick` sets `addPanelMode = { kind: "insertAction", edgeId }`.

**Mid-chain insertion: SUPPORTED.** `insertActionAtEdge` composes existing graphSlice ops (no contract change). Final topology = A→N→B with the original edge replaced and the new node positioned at the midpoint of A and B. The 4 ordered slice calls all operate on data we just created or already validated, so partial-mutation risk is bounded to the rare case where `connectNodes` rejects (defensive try/catch). Verified by `insertActionAtEdge.test.ts` (5 tests covering 2-node chain, midpoint position, no-op on missing edge, isDirty flip, 3-node chain).

**Tests added:**

- [`tests/unit/features/workflow-builder/panels/AddNodePanel.test.tsx`](../../../tests/unit/features/workflow-builder/panels/AddNodePanel.test.tsx) — 16 tests covering chrome (testid, role, title per mode, close × / backdrop / Esc / `defaultPrevented`), search (filter native, no-match copy, chips stay visible), provider icons (chip icon renders, fallback when iconUrl missing, action-mode), pick + close (native trigger, provider trigger drill-in, action mode forwards `null` insertContext, insertAction mode forwards `{ edgeId }`), provider-agnostic UI (no per-provider branches).
- [`tests/unit/features/workflow-builder/canvas/WorkflowEdge.test.tsx`](../../../tests/unit/features/workflow-builder/canvas/WorkflowEdge.test.tsx) — 5 tests (renders, no-render without data / without onPlusClick / with unresolved endpoints, click → onPlusClick). Mocks `EdgeLabelRenderer` to a passthrough and renders inside `<svg>` directly — jsdom can't initialize ReactFlow's portal container.
- [`tests/unit/features/workflow-builder/utils/shouldShowPlusButton.test.ts`](../../../tests/unit/features/workflow-builder/utils/shouldShowPlusButton.test.ts) — 6 tests covering all branches.
- [`tests/unit/features/workflow-builder/utils/insertActionAtEdge.test.ts`](../../../tests/unit/features/workflow-builder/utils/insertActionAtEdge.test.ts) — 5 tests (rewire topology, midpoint position, no-op on missing edge, isDirty flip, 3-node chain only-clicked-edge-rewired).
- `tests/unit/features/workflow-builder/WorkflowBuilder.test.tsx` — updates: the 3 pre-existing AddNodeMenu-path tests now use a `pickSlackTrigger(user)` helper that drives the EmptyCanvasState CTA → AddNodePanel flow. 1 new test verifies `+ Add action` gates on hasTrigger and appends via AddNodePanel. The CANVAS-1 ref-bridge test was rewritten as "the empty-canvas-state CTA opens AddNodePanel directly". The ReactFlow edge plus-button click path is **not** driven in WorkflowBuilder.test.tsx (jsdom can't render EdgeLabelRenderer); the equivalent coverage is split across WorkflowEdge.test.tsx (click contract) + AddNodePanel.test.tsx (insertContext propagation) + insertActionAtEdge.test.ts (final topology).
- `tests/unit/features/workflow-builder/panels/TriggerPicker.test.tsx` / `ActionPicker.test.tsx` — unchanged. The additive picker props default to no-search / no-icons so the 31 pre-existing picker tests pass without modification.

**Intentionally deferred:**

- **Run panel move** → BUILDER-RUN-PANEL-1.
- **AI panel into drawer** → BUILDER-AI-PANEL-1.
- **Validation drawer + header pill** → BUILDER-VALIDATION-1.
- **Responsive pass + dark-mode end-to-end** → BUILDER-RESPONSIVE-1.
- **Templates / custom nodes** → outside the Builder UI track.
- **Cross-provider eager search.** Today the panel lazy-loads provider catalogs on drill-in; global "type once, search every provider" requires either a `useProviderTriggersForProviders` companion hook (not yet shipped) or eager-fan-out on panel open. Acceptable now since native is always searchable and drill-in is fast.
- **Provider chips shown in inspector header.** Inspector still uses ConfigModalShell's text-only header. AddNodePanel picker chips have icons; the inspector header can adopt the same when we revisit BUILDER-INSPECTOR-2.
- **Picker filter that hides provider chips by query.** Decision: chips stay visible regardless of query for discoverability. Re-visit when global search is added.

**Gate results:** typecheck OK · lint OK (5 pre-existing warnings unrelated) · lint:structure OK · lint:migrations OK · workflow-builder unit suite: 58 suites / 772 tests pass (+2 suites + 12 tests vs INSPECTOR-1) · full unit run: 1114 suites / 13196 tests pass (+3 suites + 19 tests vs INSPECTOR-1) · canvas-config-sync integration: 6 tests pass unchanged.

### BUILDER-RUN-PANEL-1 outcomes (shipped)

The final layout-relocation slice before the responsive/dark-mode/a11y closeout. Test/Run controls move into the BuilderHeader; results + repair block move into the existing right drawer's `results` mode. Drawer mode flips between `inspector` and `results` based on which slice signal most recently transitioned.

**Added:**

- [`features/workflow-builder/hooks/useRunControls.ts`](../../../features/workflow-builder/hooks/useRunControls.ts) — 187-line state-machine hook extracted from `RunNowPanel`. Same invariants preserved verbatim (POSTSEC-6 no-silent-promotion, POSTSEC-6B trigger-kind branching, POSTSEC-5 typed-confirmation gate, test/manual envelope-sibling separation). Pure logic; no UI.
- [`features/workflow-builder/layout/HeaderRunControls.tsx`](../../../features/workflow-builder/layout/HeaderRunControls.tsx) — 122-line presentational consumer. Renders compact buttons in the BuilderHeader's right action area. Preserves every `data-testid` + descriptive copy (as `sr-only` `<p>`) from the old RunNowPanel so the migrated test suite passes without behavior changes. Manual workflows: Test + Run Manually buttons; automated: single disabled Test surface; no trigger: returns null.

**Wired:**

- [`features/workflow-builder/layout/BuilderHeader.tsx`](../../../features/workflow-builder/layout/BuilderHeader.tsx) — renders `<HeaderRunControls />` next to the Save button in the right action area.
- [`features/workflow-builder/WorkflowBuilder.tsx`](../../../features/workflow-builder/WorkflowBuilder.tsx) — subscribes to `useRunSlice().runId`; uses two refs (`prevActiveNodeId`, `prevRunId`) to detect set-transition events so the inspector / results effects don't fight each other (the previous INSPECTOR-1 effect forced inspector on every render where `activeNodeId !== null`, which would have looped with the results effect). On inspector transition: `openDrawer("inspector")`; on inspector clear: `closeDrawer()` if currently in inspector. On run transition: `openDrawer("results")`; no auto-close on run end (the user may want to inspect the latest run). Drawer × in `inspector` mode also calls `closeNode()`; in `results` mode it just closes the drawer and **does not** touch `runSlice`. Drawer body switches between `<NodeInspectorPanel />` and `<RunResultsPanel />`. The old below-canvas `<RunNowPanel />` and `<RunResultsPanel />` mounts are gone.

**Deleted:**

- `features/workflow-builder/panels/RunNowPanel.tsx` (330 lines) — logic moved to `useRunControls`, UI moved to `HeaderRunControls`.

**Moved:**

- `tests/unit/features/workflow-builder/panels/RunNowPanel.test.tsx` → `tests/unit/features/workflow-builder/layout/HeaderRunControls.test.tsx` (33 tests, ~732 lines). Only the imports + render target changed (`RunNowPanel` → `HeaderRunControls`); every assertion (testid, button text, copy, modal behavior, slice dispatch) passes verbatim.

**Integration test maintenance:** 45 integration tests broken by ADD-FLOW-1's `AddNodeMenu` deletion (the empty-canvas-state CTA replaced the `+ Add trigger` toolbar button) were migrated in bulk: `sed -i 's|name: /add trigger/i|name: /choose a trigger/i|g'`. The `destructive-action-confirmation-modal.test.tsx` integration test was separately migrated to import `HeaderRunControls` instead of `RunNowPanel`. The `latest-run-preview.test.tsx` "idle state visible by default" preamble was rewritten to assert the drawer is closed pre-run (since `RunResultsPanel` only mounts in drawer-results mode now). One pre-existing test fragility surfaced in the parallel integration run (Stripe Checkout test brushes the 5s default timeout under contention — passes consistently in isolation in 3-5s); its timeout was bumped to 10s with a `Slice 4.BUILDER-RUN-PANEL-1` note explaining the unrelated cause.

**Behavior preserved (verified):**

- All 33 HeaderRunControls tests (migrated from RunNowPanel.test.tsx) pass: manual workflow surface, automated workflow surface, test/manual button gating, no-silent-promotion/demotion (POSTSEC-6), destructive-action confirmation modal (POSTSEC-5), dirty-state warning.
- All 14 WorkflowBuilder.test.tsx tests pass — 10 pre-existing + 4 new (drawer auto-opens results on run; drawer flips inspector↔results based on user-initiated transitions; results × doesn't clear runSlice; run-controls render exactly once in the header).
- All 363 integration tests pass (17 skipped, all 83 active suites green). Includes the 6-test `canvas-config-sync` integration unchanged.
- `destructive-action-confirmation-modal.test.tsx` integration: 14 tests pass — `runNowWorkflow` + modal flow still wires correctly through `HeaderRunControls`.
- `latest-run-preview.test.tsx` integration: full Run Now → polling 404 → 200 → step output flow renders inside the drawer.

**Drawer mode-switching summary:**

| User action | activeNodeId | runId | Resulting drawer mode |
|---|---|---|---|
| Open node A | null → A | unchanged | `inspector` (opens) |
| Run dispatched while on inspector | A | null → r1 | `results` (overrides inspector) |
| Open node B while on results | A → B | r1 | `inspector` (overrides results) |
| Drawer × in inspector | A → null | unchanged | closed; selection dropped |
| Drawer × in results | unchanged | unchanged | closed; runSlice preserved |
| Same run completes (status: succeeded/failed) | unchanged | r1 → r1 | no change (already on results) |

**Intentionally deferred:**

- **AI panel drawer move** → BUILDER-AI-PANEL-1. (`mode: "ai"` slot reserved.)
- **Validation drawer + header pill** → BUILDER-VALIDATION-1. (`mode: "validation"` slot reserved.)
- **Responsive + dark-mode + a11y pass** → BUILDER-RESPONSIVE-1.
- **Per-step output formatting polish** (V1's expand-row UX, copy-clipboard, syntax-highlighted JSON). The `RunResultsPanel` body shipped as-is from BUILDER-INSPECTOR-1 era — the slice scope was the relocation, not the result-rendering polish. Owner: a follow-up post-CLOSEOUT polish slice if needed.
- **HeaderRunControls visibility on small screens.** Today the buttons take horizontal header space; on narrow widths they may crowd the title + Save. The responsive pass folds them into a More menu.

**Gate results:** typecheck OK · lint OK (5 pre-existing warnings unrelated) · lint:structure OK · lint:migrations OK · workflow-builder unit suite: 58 suites / 772 tests pass · full unit run: 1114 suites / 13200 tests pass (+4 tests vs ADD-FLOW-1 from new WorkflowBuilder tests) · full integration run: 83 suites / 363 tests pass (17 skipped; previous slice's 45 broken integration tests now also pass after bulk migration).

---

## 9. Tests required

### Component / unit (Jest + RTL — extend `tests/`)

- **Shell.** `BuilderShell` renders the 3 zones; `BuilderHeader` composes title + status + actions; `BuilderRightDrawer` mounts exactly one of inspector / ai / results / validation.
- **Empty state.** `EmptyCanvasState` renders when no nodes; CTA dispatches the right add-trigger action.
- **Node card.** `WorkflowNodeCard` renders provider label + display name + status; selected state styles; "Not configured" chip when required FieldMeta is missing.
- **Edge plus-button.** `WorkflowEdge` plus-button appears on hover; click opens `AddNodePanel` with insert context.
- **Add-node panel.** `AddNodePanel` search filters across native + provider items; selecting an item dispatches the existing addTrigger/addAction actions (re-uses existing tests).
- **Inspector mount.** Selecting a node opens the drawer; closing returns focus to the node.
- **Run panel header.** Test button runs in test mode; Run is hidden for automated triggers; 409 still opens the confirmation modal.
- **Results drawer.** Failed run shows step pills + repair block.
- **AI drawer.** Preview / apply contract unchanged (re-use existing AI-11/11B tests at the new mount point).
- **Validation summary.** Pill count matches; clicking issue jumps to node.
- **Keyboard.** Cmd+S triggers save; Esc closes drawer; Cmd+Z / Cmd+Shift+Z dispatch undo/redo.

### Pure unit (Jest)

- `classifyNodeStatus(graph, run, config) → status` for all branches.
- `shouldShowPlusButton(edge, dragState, runState) → boolean`.

### Visual / contract guards

- **No provider metadata reads** — search for hardcoded `provider === "gmail"` etc. in `features/workflow-builder/layout/` and `features/workflow-builder/canvas/`. Should be zero.
- **No backend behavior changes** — diff `lib/api/workflows.ts` and `lib/api/ai.ts` across the track; net change must be zero (or minor type-additions only).
- **No raw AI patch / config values** in any new panel — re-use the no-leak guard already covering `BuilderAiPanel`.

### Playwright (optional, only if existing e2e harness in V2)

- create-from-scratch flow (Flow A).
- edit-existing flow (Flow B).
- AI-assisted flow (Flow C).
- failed-run repair flow (Flow D).

Run scope per slice: only the touched component tests. Full suite at CLOSEOUT.

---

## 10. Risks / non-goals

### Risks

1. **Copying V1 monoliths into V2.** `WorkflowBuilderV2.tsx` (8K lines) and `CustomNode.tsx` (1.5K lines) are easy to half-port. Mitigation: hard ≤500-line rule per file; structural review at each slice.
2. **Mixing builder UI refactor with backend behavior.** Easy to "fix" a save bug or change a run endpoint while moving controls. Mitigation: every PR-Builder-* slice has zero diff to `lib/api/*` and zero diff to anything under `services/` / `app/api/` (allowlist check at review).
3. **Breaking AI panel / repair block while moving layout.** Both are contract-stable surfaces (AI-11B, AI-13). Mitigation: do not edit `BuilderAiPanel` or `RunResultsRepairBlock` internals during the move — only their mount points. Existing tests must still pass post-move.
4. **Overbuilding before teams / templates / custom nodes land.** Adding a top-bar "Team picker" or "Template gallery" preemptively. Mitigation: the right-drawer pattern accommodates both later without re-architecture.
5. **Provider-specific UI assumptions creeping in.** Tempted to render Gmail-specific badges, Slack-specific subtitle formats, etc. Mitigation: lint guard — no string `"gmail"` / `"slack"` / etc. in builder UI files; provider differences come from ActionMeta / TriggerMeta.
6. **Large files returning.** A polished header tends to grow. Mitigation: enforce splits (`HeaderTitle.tsx`, `HeaderActions.tsx`, `HeaderRunControls.tsx`) if `BuilderHeader.tsx` >400 lines.
7. **`graphSlice` / `configSlice` / `runSlice` contract drift.** A new layout might want to read state from slices in new ways. Mitigation: no slice signature changes during this track; new selectors only.
8. **Auto-save vs explicit-save inconsistency.** A half-introduced auto-save creates a worse UX than either pure mode. Mitigation: commit to explicit-save with dirty pill (decision in §4); revisit auto-save as a separate slice if ever.

### Non-goals (re-stating the brief)

- No backend workflow engine changes.
- No provider metadata changes.
- No billing / task cost changes.
- No teams / workspaces implementation.
- No full AI chat persistence.
- No templates / custom nodes implementation.
- No push to `origin/*` from this track without explicit user sign-off.

---

## Appendix A — V2 files audited (reference)

```
app/workflows/[id]/page.tsx
features/workflow-builder/WorkflowBuilder.tsx
features/workflow-builder/canvas/WorkflowCanvas.tsx
features/workflow-builder/canvas/adapters.ts
features/workflow-builder/canvas/nodes/WorkflowNodeView.tsx
features/workflow-builder/config-modal/ConfigModalShell.tsx
features/workflow-builder/config-modal/fields/ComboboxField.tsx
features/workflow-builder/config-modal/fields/VariablePickerPopover.tsx
features/workflow-builder/config-modal/fields/_routesValidator.ts
features/workflow-builder/config-modal/fields/_variableValidator.ts
features/workflow-builder/panels/AddNodeMenu.tsx
features/workflow-builder/panels/BuilderAiPanel.tsx
features/workflow-builder/panels/LifecycleActions.tsx
features/workflow-builder/panels/RunNowPanel.tsx
features/workflow-builder/panels/RunResultsPanel.tsx
features/workflow-builder/panels/RunResultsRepairBlock.tsx
features/workflow-builder/state/configSlice.ts
features/workflow-builder/state/graphSlice.ts
features/workflow-builder/state/runSlice.ts
features/workflow-builder/state/triggerKind.ts
lib/api/workflows.ts
lib/api/ai.ts
tests/  (100+ existing files covering the surfaces above)
```

## Appendix B — V1 files audited (reference only — no edits)

```
app/(builder)/workflows/builder/[id]/page.tsx
components/workflows/builder/WorkflowBuilderV2.tsx
components/workflows/builder/BuilderHeader.tsx
components/workflows/builder/FlowV2BuilderContent.tsx
components/workflows/builder/FlowEdges.tsx
components/workflows/builder/IntegrationsSidePanel.tsx
components/workflows/builder/FlowV2AgentPanel.tsx
components/workflows/builder/WorkflowStatusBar.tsx
components/workflows/builder/WorkflowHistoryDialog.tsx
components/workflows/builder/ActivationReviewDialog.tsx
components/workflows/builder/styles/tokens.css
components/workflows/builder/styles/node-states.css
components/workflows/CustomNode.tsx
components/workflows/NodePalette.tsx
components/workflows/AIVariablePanel.tsx
components/workflows/VariablePicker.tsx
components/workflows/configuration/components/ConfigurationContainer.tsx
components/workflows/configuration/providers/GenericConfiguration.tsx
components/workflows/configuration/providers/AIRouterConfigModal.tsx
components/workflows/configuration/VariablePickerSidePanel.tsx
components/workflows/ai-builder/AIWorkflowBuilderChat.tsx
```

## Appendix C — Recommended slice sequence (one-line summary)

1. **BUILDER-UI-V1-AUDIT-1** — this doc.
2. **BUILDER-UI-SHELL-1** — 3-zone shell + header.
3. **BUILDER-CANVAS-1** — node card + empty state + full-height canvas.
4. **BUILDER-INSPECTOR-1** — config moves into right drawer.
5. **BUILDER-ADD-FLOW-1** — `AddNodePanel` + edge plus-button.
6. **BUILDER-RUN-PANEL-1** — Run / Test in header; results into drawer.
7. **BUILDER-AI-PANEL-1** — AI panel into right drawer.
8. **BUILDER-VALIDATION-1** — `ValidationSummary` drawer + header pill.
9. **BUILDER-RESPONSIVE-1** — responsive + dark mode + a11y pass.
10. **BUILDER-UI-CLOSEOUT** — outcomes doc + (optional) Playwright walkthrough.
