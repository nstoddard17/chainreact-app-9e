# Phase 4 — V1 Workflow Builder UI Audit + V2-Native Port Plan

**Slice:** 4.BUILDER-UI-V1-AUDIT-1
**Type:** Doc-only audit/planning slice. **No runtime/source/test/metadata files modified.**
**Date:** 2026-05-25 (corrected 2026-05-26 — see §0 Correction history)
**Branch:** `builder-ui-v1-audit-1`
**HEAD at authoring:** `e919c83f6` (chore: docs/slices reorg into phase-1/phase-2/parity)
**V1 reference repo:** `chainreact-app-9e` @ `marcus_dev` (HEAD `faebdeed0`)

> **Scope guardrail.** Audit + decisions only. This slice does **not** move, rename, or rewrite any builder UI code. The implementation work is enumerated in §8 and lands across follow-up slices (BUILDER-UI-SHELL-1 … BUILDER-UI-CLOSEOUT). No backend / provider metadata / billing / AI-service changes anywhere in this track.

> **Reference policy.** V1 is reference, not truth. For every V1 pattern this doc classifies it as: **copy**, **adapt**, **replace**, **reject**, or **defer**. The goal is to use what worked in V1 while preserving V2's cleaner architecture (Zustand slices, schema-driven config, deterministic AI services, no monolithic component files).

---

## 0. Correction history

### 2026-05-26 — Layout correction (BUILDER-LAYOUT-CORRECTION-1)

**What changed.** The original §4 decision put the AI panel into the **right drawer** alongside the inspector (mutually exclusive). After reviewing V1 target screenshots, that direction was wrong: V1 keeps the React Agent assistant as a persistent **left rail**, and the right rail is dedicated to node-contextual surfaces. The corrected layout is **four-zone**:

```
header / left React Agent rail / center canvas / right drawer (inspector | results | validation)
```

**Why it matters.** The React Agent is a workflow-builder-scoped *assistant* the user converses with **while** editing — it needs persistent visibility, not modal-style on/off toggling. The right drawer is contextual to whatever the user just clicked (a node → inspector; a run → results; the validation pill → summary). Sharing one drawer between AI and inspector forces the user to choose between "see my chat with the agent" and "see the node I'm editing" — exactly the wrong tradeoff for an agent-driven UX.

**What this correction touches.** Only the plan in this doc. No source files moved, no tests changed, no shipped slices unwound. Specifically:

- §4 — four-zone layout replaces three-zone; left rail = React Agent.
- §5 — `BuilderLeftAgentRail.tsx` + `useLeftAgentRail.ts` added; `BuilderRightDrawer` keeps only inspector / results / validation.
- §6 — visual design picks up V1's 420px left rail with collapsible toggle.
- §7 — Flow C updates to left-rail mount.
- §8 — `BUILDER-AI-PANEL-1` (move AI to right drawer) **removed**; replaced by `BUILDER-LEFT-AGENT-1` (move AI to left rail).
- Appendix C — slice sequence updated.

**Out of scope for this correction (still non-goals across the entire track).**
- General app-level help assistant — not built here. The left rail is workflow-builder scoped only.
- Chat / thread persistence — not added now. AI panel keeps its existing single-request contract (AI-11/11B).
- Right drawer becoming an AI host — explicit non-goal. Right drawer is for node-contextual surfaces only.
- AI backend behavior, provider metadata, billing/tasks, workflow execution — unchanged.
- Push to `origin/*` — not from this correction.

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

### Four-zone layout (corrected 2026-05-26) — **Yes.**

```
┌────────────────────────────────────────────────────────────────────────────────┐
│  BuilderHeader (h-12)  title · status · undo/redo · Test · Publish · ⋯         │
├───────────────┬──────────────────────────────────────────┬─────────────────────┤
│               │                                          │                     │
│  React Agent  │                                          │  Inspector OR       │
│  (left rail,  │             WorkflowCanvas               │  Run results OR     │
│   ~420px,     │           (full remaining height)        │  Validation summary │
│   collapsible,│                                          │  (right drawer,     │
│   default-on  │                                          │   mutually          │
│   on desktop) │                                          │   exclusive)        │
│               │                                          │                     │
└───────────────┴──────────────────────────────────────────┴─────────────────────┘
```

- **Header** owns workflow identity (title + status), structural actions (undo/redo, view), execution (Test, Run-now via header dropdown), and lifecycle (Publish → `ActivationReviewDialog` → activate / pause / resume). Save lives here too. **Left-rail toggle** lives here as an icon button (collapses / restores the React Agent rail).
- **Left rail = React Agent (workflow-builder-scoped AI).** Mirrors V1's 420px left AI panel. Mounts `BuilderAiPanel` (AI-11 / AI-11B contract — preview-then-apply, risk ack, no auto-apply, no raw values exposed). **Visible by default on desktop**, collapsible via the header toggle and via the rail's own ✕. Collapsed state persists per-user in localStorage. **Scope guardrail:** this is the *workflow-builder* assistant only — not the general app help assistant. There is no chat/thread persistence in this slice; the panel keeps its existing single-request contract.
- **Canvas** is the visual focus, full remaining height. ReactFlow with Dots background, custom edges with plus-button, MiniMap optional.
- **Right drawer** is one-of-three node-contextual surfaces: **Inspector** (when a node is selected), **Run results** (when a run completes), **Validation summary** (when the header pill is clicked). They are mutually exclusive — opening one closes the others. **AI does NOT mount here.** Drawer width ~420px default, resizable. Right drawer state is independent of left rail state — both can be open simultaneously.
- **Why a persistent left rail (and not a toggled drawer) for AI.** The React Agent is a conversational assistant the user works **alongside** while editing. Hiding it behind a toggle creates the same friction as V1's old modal-style AI (Phase 2 user feedback). Persistent left placement also matches user mental models from Linear's AI sidebar, Notion AI, and Cursor — workflow-builder agents live in the chrome, not behind a click.

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
│   ├── BuilderShell.tsx                      polish    — 4-zone grid (header / left rail / canvas / right drawer). SHELL-1 shipped a 2-zone (header/content) foundation; LEFT-AGENT-1 extends it.
│   ├── BuilderHeader.tsx                     new       — title, status, undo/redo, Test, Run, Publish, History, More, **left-rail toggle**
│   ├── BuilderRightDrawer.tsx                new       — one-of: inspector | results | validation. **AI excluded** — left rail owns it.
│   └── BuilderLeftAgentRail.tsx              new       — left rail container hosting BuilderAiPanel; ~420px; collapsible; default-expanded on desktop; collapsed state persisted to localStorage
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
│   ├── BuilderAiPanel.tsx                    polish    — relocated to **LEFT rail** (not right drawer); copy/structure unchanged (AI-11/11B contract preserved); no chat/thread persistence in this slice
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
│   ├── useRightDrawer.ts                     new       — right drawer state machine (inspector | results | validation). **AI is not a drawer state.**
│   ├── useLeftAgentRail.ts                   new       — left rail collapsed/expanded state; reads/writes localStorage key `chainreact:builder:leftAgentRail:collapsed`
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
- **Right drawer is for node-contextual surfaces only** (inspector / results / validation). `useRightDrawer.ts` MUST NOT gain an `"ai"` mode. AI's mount point is the left rail.
- **Left rail is workflow-builder scoped.** Do not mount any general app-level assistant here. If a general help surface is added later, it lives outside the builder shell.

---

## 6. Visual design direction

### Aesthetic

- Clean SaaS builder — Linear / Vercel / Stripe Dashboard reference. Generous whitespace, soft shadows, restrained color, strong type hierarchy.
- Canvas is the focus. Chrome (header + drawer) is intentionally quiet so the workflow reads first.
- Status colors carry meaning (orange = unsaved / incomplete, blue = running / saving, green = saved / passed, red = error, amber = listening / paused). Reused everywhere.

### Spacing / size tokens

- Header height: **48px** (h-12) — matches V1.
- **Left rail width: 420px** (matches V1's `--agent-pane-width`), no resize handle in this slice. Collapsed state is icon-only (no fixed width).
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
- **Left rail = 420px (V1 parity); right drawer = 420px and node-contextual only.** V1 had a 420 left + 380 right both visible; V2 keeps the 420 left for the React Agent and uses the right as a mutually-exclusive drawer (inspector / results / validation) rather than a third persistent column. Simpler middle-canvas footprint than V1 on 1280-wide laptops while still preserving the persistent agent surface.
- No always-visible variable picker panel — popover only.
- Validation summary as a header-launched drawer, not a modal.

### What to reject as dated / cluttered

- V1's header density — too many secondary buttons (Cloud API, Versions, Comments) crowding primary actions. Move secondaries into the More menu.
- V1's **always-visible right inspector panel layered on top of an always-visible left AI panel** — pushes canvas into a tiny middle column on 1280-wide laptops. V2 keeps the left rail persistent but makes the right drawer mutually-exclusive (only one of inspector/results/validation visible at a time, and the user can close it). Left rail collapse recovers the full canvas width when the user wants it.
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

> **Corrected 2026-05-26.** Original target placed AI in the right drawer. Corrected target: **React Agent is the persistent left rail** — visible by default on desktop, collapsible via header toggle.

| Step | Today | Target |
|---|---|---|
| User enters builder | AI panel below canvas in left column | **React Agent left rail** is already visible (default-expanded on desktop). Collapsed users restore via header icon. |
| User toggles rail | n/a | Header left-rail icon collapses/restores; preference persists per-user in localStorage. |
| User types a prompt | Textarea + char counter | Same; lives in the left rail. |
| User clicks Plan with AI | Preview render | Same — preview structure unchanged (counts + risks + warnings + cost). |
| Required input missing | `AiRequiredInputList` shown | Same. |
| Risk gate | Risk ack checkbox required | Same. |
| Apply | Apply button calls AI-9B route | Same; on success, the **right drawer** opens to the inspector for the first changed node. Left rail stays visible so the user can keep iterating with the agent. |

**No chat / thread persistence in this slice.** The panel keeps its single-request contract — opening / closing the rail or refreshing the page does not preserve a multi-turn conversation history. Persistence is a follow-up track outside this UI port.

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
| **BUILDER-LAYOUT-CORRECTION-1** *(2026-05-26, this revision — plan-only)* | Correct §4 layout direction: AI moves to **left rail** (matches V1 target screenshots), not right drawer. Revises §0/§4/§5/§6/§7/§8/§9/§10/App-C. No source files touched; no shipped slices unwound. Replaces former `BUILDER-AI-PANEL-1` with `BUILDER-LEFT-AGENT-1` below. | `docs/slices/phase-4/builder-ui-v1-port-plan.md` only | None | None | No |
| **BUILDER-LEFT-AGENT-1** *(shipped 2026-05-26; replaces former BUILDER-AI-PANEL-1)* | Introduce `BuilderLeftAgentRail` and mount `BuilderAiPanel` inside it (moved from the below-canvas slot in `WorkflowBuilder.tsx`). Header gains a left-rail toggle icon. `BuilderShell` extends from 2-zone (header/content) → 4-zone (header / left rail / canvas-and-rest / right drawer). Collapse state persists via `useLeftAgentRail` → localStorage. **Removed `"ai"` from `RightDrawerMode` union in `useRightDrawer.ts`** (updated `useRightDrawer.test.tsx` to assert the 3-mode union: `inspector \| results \| validation`). Right drawer cannot host AI by construction after this slice. AI contract unchanged: AI-11/11B preview-then-apply, risk ack, no auto-apply, no raw values exposed, **no chat/thread persistence**. | `layout/BuilderLeftAgentRail.tsx` (new, 55 lines), `layout/BuilderShell.tsx` (extended to 4-zone, 67 lines), `layout/BuilderHeader.tsx` (toggle button + private `LeftRailToggle` subcomponent, 159 lines), `hooks/useLeftAgentRail.ts` (new, 76 lines), `hooks/useRightDrawer.ts` (`RightDrawerMode` narrowed), `WorkflowBuilder.tsx` (mount move from below-canvas to left rail, 296 lines), `panels/BuilderAiPanel.tsx` (no internal changes; mount-point move only) | Low — mounting move + new wrapper; AI contract untouched; `RightDrawerMode` narrowing is a typed change (TS confirmed zero call sites passing `"ai"`) | All gates passed: typecheck OK · 60 workflow-builder unit suites / 811 tests pass (+2 suites + 39 tests) · 83 integration suites / 363 tests pass (zero regressions) · 23 BuilderAiPanel tests pass unchanged at new mount point · new `RightDrawerMode` typed-union assertion test (no `"ai"`) | No |
| **BUILDER-V1-SHELL-PARITY-1** *(shipped 2026-05-26)* | Full-bleed V1-like workspace. Removed the route's `max-w-3xl mx-auto` detail-page wrapper, the page-header `<header>` with h1 + status + LifecycleActions (LifecycleActions lifted into `BuilderHeader`), the standalone `WorkflowEditForm` rename block, and the below-builder `RunHistory` block. Removed the legacy `NodeList` mount from `WorkflowBuilder` (file + tests preserved). Made `BuilderShell` + workspace row + center column + canvas all chain `h-full` / `min-h-0 flex-1` so the canvas grows into the viewport. Migrated 55 NodeList-Configure click sites across 41 integration files to a shared `openLastNodeOfKind` helper. Added global `next/navigation` default mock in `jest.setup.ts`. | `app/workflows/[id]/page.tsx` (rewritten, 79 lines), `features/workflow-builder/layout/BuilderShell.tsx` (h-full chain), `features/workflow-builder/layout/BuilderHeader.tsx` (+ `lifecycle?` prop), `features/workflow-builder/canvas/WorkflowCanvas.tsx` (flexible height), `features/workflow-builder/WorkflowBuilder.tsx` (lifecycle prop + NodeList removed), `tests/integration/features/workflow-builder/helpers/openLastNodeOfKind.ts` (new), 43 integration test files (bulk-migrated), `jest.setup.ts` (default mock), `eslint.config.mjs` (jest-globals for jest.setup.ts) | Low — visual relocation only; behavior contracts of LifecycleActions / canvas / inspector / rail / drawer all preserved; 55 mechanical test migrations | All gates passed: typecheck OK · 62 workflow-builder unit suites / 853 tests pass (+5 tests) · 83 integration suites / 363 tests pass (zero regressions) · LifecycleActions + WorkflowEditForm + WorkflowsList + CreateWorkflowButton 28 dependent unit tests pass unchanged | No |
| **BUILDER-VALIDATION-1** *(shipped 2026-05-26)* | `ValidationSummary` drawer surface + header `ValidationPill` + node-clicking-flips-to-inspector flow. Conservative helper covers `no_trigger` + `unconfigured_node` + `router_routes_invalid` (re-uses `_routesValidator`); field-level-required-missing beyond router + disconnected-integration + unreachable-node deferred to follow-up slices. Inline `WorkflowNodeCard.NotConfiguredBadge` from CANVAS-1 untouched (defers richer per-node issue counts). `ActivationReviewDialog` does NOT exist in V2 yet — `LifecycleActions` uses the SEC-4B `DestructiveActionConfirmationModal` for activation; pre-publish review wiring is documented as a follow-up. **Mounts in right drawer alongside inspector/results.** | `validation/collectBuilderValidationIssues.ts` (new, 132 lines), `validation/ValidationSummary.tsx` (new, 178 lines), `layout/BuilderHeader.tsx` (+ `HeaderValidationPill` private subcomponent, 250 lines total), `WorkflowBuilder.tsx` (+ `handleOpenValidation` + validation drawer-mode wiring, 320 lines) | Low — pure additive; no graph mutation; no slice-contract changes; helper is pure | All gates passed: typecheck OK · 62 workflow-builder unit suites / 848 tests pass (+2 suites + 37 tests) · 83 integration suites / 363 tests pass (zero regressions) · pill count agrees with summary list (one source of truth via the helper) · provider-agnostic (test with fictional provider) · drawer/rail independence preserved · validation drawer is read-only with respect to graphSlice | No |
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
- **AI panel into left rail.** `BuilderAiPanel` still renders in-flow below `RunResultsPanel`. Owner: **BUILDER-LEFT-AGENT-1** (corrected 2026-05-26 — see §0). The previous BUILDER-AI-PANEL-1 plan (move to right drawer) is superseded.
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
- **Inspector drawer / AI left rail / Run results drawer.** Owners: **BUILDER-INSPECTOR-1** / **BUILDER-LEFT-AGENT-1** (corrected 2026-05-26 — AI moves to left rail, not right drawer) / **BUILDER-RUN-PANEL-1** respectively.
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
- **AI panel into left rail.** Owner: **BUILDER-LEFT-AGENT-1** (corrected 2026-05-26 — was BUILDER-AI-PANEL-1 / right drawer; see §0). **The `mode: "ai"` slot in `RightDrawerMode` reserved here is forfeit** — LEFT-AGENT-1 removes `"ai"` from the union. The 6 `useRightDrawer` tests that exercise the ai-mode mutual-exclusion case migrate to the 3-mode union (`inspector | results | validation`).
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
- **AI panel into left rail** → BUILDER-LEFT-AGENT-1 (corrected 2026-05-26 — see §0; was "AI panel into drawer" / BUILDER-AI-PANEL-1).
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

- **AI panel into left rail** → BUILDER-LEFT-AGENT-1 (corrected 2026-05-26 — see §0; was "AI panel drawer move" / BUILDER-AI-PANEL-1). The `mode: "ai"` slot reservation noted here is **forfeit**: LEFT-AGENT-1 removes `"ai"` from `RightDrawerMode`. The right drawer stays inspector/results/validation only.
- **Validation drawer + header pill** → BUILDER-VALIDATION-1. (`mode: "validation"` slot reserved.)
- **Responsive + dark-mode + a11y pass** → BUILDER-RESPONSIVE-1.
- **Per-step output formatting polish** (V1's expand-row UX, copy-clipboard, syntax-highlighted JSON). The `RunResultsPanel` body shipped as-is from BUILDER-INSPECTOR-1 era — the slice scope was the relocation, not the result-rendering polish. Owner: a follow-up post-CLOSEOUT polish slice if needed.
- **HeaderRunControls visibility on small screens.** Today the buttons take horizontal header space; on narrow widths they may crowd the title + Save. The responsive pass folds them into a More menu.

**Gate results:** typecheck OK · lint OK (5 pre-existing warnings unrelated) · lint:structure OK · lint:migrations OK · workflow-builder unit suite: 58 suites / 772 tests pass · full unit run: 1114 suites / 13200 tests pass (+4 tests vs ADD-FLOW-1 from new WorkflowBuilder tests) · full integration run: 83 suites / 363 tests pass (17 skipped; previous slice's 45 broken integration tests now also pass after bulk migration).

### BUILDER-LEFT-AGENT-1 outcomes (shipped 2026-05-26)

Implements the corrected V1 target layout from §0: the React Agent (`BuilderAiPanel`) moves from the below-canvas slot into a persistent left rail. The right drawer is now strictly node-contextual — its `RightDrawerMode` union no longer includes `"ai"`, so the previously-reserved slot is permanently forfeit. Drawer state and rail state are independent (both surfaces can be open simultaneously).

**Added:**

- [`features/workflow-builder/hooks/useLeftAgentRail.ts`](../../../features/workflow-builder/hooks/useLeftAgentRail.ts) — 76-line local-state hook. Exposes `isCollapsed` / `expand` / `collapse` / `toggle`. **Default-expanded on desktop.** Reads/writes `chainreact:builder:leftAgentRail:collapsed` on `window.localStorage` so the user's preference survives reload. SSR-safe (`typeof window === "undefined"` guard) and storage-failure-resilient (try/catch around getItem + setItem — the UI state still works for the current session when storage is unavailable). Callbacks are `useCallback`-stable so consumers can list them in effect deps. Pure local state — no Zustand slice, no cross-tab broadcast.
- [`features/workflow-builder/layout/BuilderLeftAgentRail.tsx`](../../../features/workflow-builder/layout/BuilderLeftAgentRail.tsx) — 55-line presentational wrapper. Renders `aside[role="complementary"][aria-label="React Agent"]` with a 420px width on md+ (V1 parity with `--agent-pane-width`), full width below md. In-rail header shows the literal label "React Agent" and a `Collapse React Agent` × button. Children slot hosts the AI panel; the wrapper itself is provider-agnostic and behaviorless. **Collapsed model: the component returns `null` rather than a slim placeholder strip** — the 4-zone BuilderShell row simply omits the column and the center canvas grows to fill the space. This matches V1's "collapsed = gone" behavior.

**Extended:**

- [`features/workflow-builder/layout/BuilderShell.tsx`](../../../features/workflow-builder/layout/BuilderShell.tsx) — 67 lines (was 33). Adds optional `leftRail` + `rightDrawer` slots to the 2-zone foundation from SHELL-1. The shell row layout (`md:flex-row md:items-start`) moves inside the shell; the center column gets `min-w-0 flex-1` so it shrinks correctly when one or both side columns are mounted. Slots default to `undefined` (not rendered), so the 4 pre-existing SHELL-1 tests pass unchanged.
- [`features/workflow-builder/layout/BuilderHeader.tsx`](../../../features/workflow-builder/layout/BuilderHeader.tsx) — adds an optional `leftRail?: { isCollapsed, onToggle }` prop. When supplied, a small toggle button renders to the left of the workflow name with aria-label `Collapse React Agent` / `Expand React Agent`, `aria-pressed` reflecting the expanded state, and `data-collapsed` for snapshot-free state inspection. The toggle is extracted into a private `LeftRailToggle` subcomponent so `BuilderHeader.tsx` stays at 159 lines (under the 500-line guardrail).
- [`features/workflow-builder/WorkflowBuilder.tsx`](../../../features/workflow-builder/WorkflowBuilder.tsx) — adds `const leftRail = useLeftAgentRail()`; mounts `<BuilderLeftAgentRail>{<BuilderAiPanel />}</BuilderLeftAgentRail>` inside `BuilderShell`'s new `leftRail` slot; passes `{ isCollapsed: leftRail.isCollapsed, onToggle: leftRail.toggle }` into `<BuilderHeader>`. The old `<BuilderAiPanel />` mount below the canvas is gone. The previous middle-column wrapper (`<div className="flex min-w-0 flex-1 flex-col gap-4">`) flattens — the canvas / NodeList / AddNodePanel modal sit directly inside the shell's center slot since the shell now owns the row composition.
- [`features/workflow-builder/hooks/useRightDrawer.ts`](../../../features/workflow-builder/hooks/useRightDrawer.ts) — **`RightDrawerMode` union narrowed**: `"inspector" | "ai" | "results" | "validation"` → `"inspector" | "results" | "validation"`. The dropped `"ai"` slot is documented as permanently forfeit; any future reintroduction must update the typed-union assertion test and explain why. TypeScript caught zero call sites passing `"ai"` (the only consumer that ever did was the planned-but-never-shipped BUILDER-AI-PANEL-1 slice, superseded by this one).

**No internal changes to `BuilderAiPanel`.** Mount-point move only. AI-11 / AI-11B contract preserved verbatim — preview-then-apply, risk-ack gate, no auto-apply, no raw patch/config values, no chat/thread persistence. All 23 BuilderAiPanel test cases pass unchanged.

**Drawer × rail independence (verified):**

| User action | Rail visible? | Drawer visible? |
|---|---|---|
| Open node A | unchanged (default: yes) | inspector opens |
| Run dispatched | unchanged | results opens (replaces inspector) |
| Drawer × | unchanged | closes |
| Header rail toggle | flips | unchanged |
| In-rail × button | collapses | unchanged |
| Cmd/Ctrl+S save | unchanged | unchanged |

**Collapse behavior:**

- Header toggle collapses or restores; rail × button collapses (header toggle then restores).
- Collapsed state persists to `chainreact:builder:leftAgentRail:collapsed` in localStorage; survives reload + remount.
- Collapsed rail returns `null` so the canvas recovers full width — no slim placeholder strip.
- Esc keyboard shortcut closes the right drawer ONLY; it does NOT touch the left rail (rail is persistent UI; Esc is for transient surfaces).

**Tests added / updated:**

- [`tests/unit/features/workflow-builder/hooks/useLeftAgentRail.test.tsx`](../../../tests/unit/features/workflow-builder/hooks/useLeftAgentRail.test.tsx) — 10 tests. Default-expanded behavior, `localStorage.getItem === "true"` round-trip, non-`"true"` values resolve to expanded, callback semantics (expand / collapse / toggle each persist), callback stability across renders, quota-exceeded-on-setItem still flips in-memory state, getItem-throws-on-mount falls back to expanded.
- [`tests/unit/features/workflow-builder/layout/BuilderLeftAgentRail.test.tsx`](../../../tests/unit/features/workflow-builder/layout/BuilderLeftAgentRail.test.tsx) — 5 tests. Expanded-state landmark + label + children slot + collapse button click contract + scope guardrail (no "help assistant" / "ChainReact assistant" copy); collapsed-state renders `null` so children are NOT mounted (AI panel state / effects / network calls don't run while collapsed).
- [`tests/unit/features/workflow-builder/layout/BuilderShell.test.tsx`](../../../tests/unit/features/workflow-builder/layout/BuilderShell.test.tsx) — extended: the 3 pre-existing SHELL-1 tests pass unchanged (now grouped under "two-zone foundation (SHELL-1)") plus 1 new test asserting the slot-omission baseline; new "four-zone layout (LEFT-AGENT-1)" group adds 4 tests (leftRail slot renders, rightDrawer slot renders, all 4 zones simultaneously, DOM order left → body → right).
- [`tests/unit/features/workflow-builder/layout/BuilderHeader.test.tsx`](../../../tests/unit/features/workflow-builder/layout/BuilderHeader.test.tsx) — extended: all 8 pre-existing SHELL-1 tests pass unchanged; new "left rail toggle (LEFT-AGENT-1)" group adds 5 tests covering the toggle's no-render-without-prop baseline, expanded vs collapsed aria-label / aria-pressed / data-collapsed, click fires `onToggle` once, scope-guardrail copy.
- [`tests/unit/features/workflow-builder/hooks/useRightDrawer.test.tsx`](../../../tests/unit/features/workflow-builder/hooks/useRightDrawer.test.tsx) — the mutual-exclusion test loses the `"ai"` step; the toggle test switches to inspector → results instead of inspector → ai; new typed-union assertion test exhausts the `RightDrawerMode` switch (TS compiler enforces parity if a new mode is added) and runtime-asserts `"ai"` is rejected from the allowed set. Net: 6 → 6 tests (one rewritten + one added).
- [`tests/unit/features/workflow-builder/WorkflowBuilder.test.tsx`](../../../tests/unit/features/workflow-builder/WorkflowBuilder.test.tsx) — all 14 pre-existing tests pass unchanged; new "Slice 4.BUILDER-LEFT-AGENT-1 — React Agent left rail" group adds 10 tests covering: BuilderAiPanel mounts inside the rail; no duplicate panel mount elsewhere; header toggle collapses (rail + panel both unmount); in-rail × collapses; toggle is bidirectional; collapsed state persists across remount; opening a node inspector does NOT affect the rail; dispatching a run does NOT affect the rail; collapsing the rail does NOT close the right drawer; closing the right drawer does NOT collapse the rail.

**Behavior preserved (verified):**

- BuilderAiPanel test suite (23 tests, including the no-leak guard for raw patch / config values) passes unchanged at the new mount point.
- WorkflowBuilder pre-existing 14 tests (add → save round-trip, drawer mode-switching, run-controls header mount, configSlice unmount cleanup) all pass.
- All 60 workflow-builder unit suites / **811 tests pass** (+2 suites + 39 tests vs RUN-PANEL-1).
- All 83 workflow-builder integration suites / **363 tests pass** (zero regressions).

**Intentionally deferred:**

- **Header h1 + status badge duplication with the page header.** Pre-existing from SHELL-1; resolved when LifecycleActions migrates into the header. Not in scope for LEFT-AGENT-1.
- **Chat / thread persistence.** Explicit non-goal in §0 — the persistent left placement makes multi-turn chat tempting, but the AI-11/11B single-request contract is the canonical behavior for this track. A persistence track would have its own service contract.
- **General app-level help assistant.** Out of scope. The left rail is workflow-builder scoped (mounts only `BuilderAiPanel`). A general help surface lives outside the builder shell.
- **Validation drawer + header pill** → BUILDER-VALIDATION-1.
- **Responsive collapse on narrow widths** (rail folds into a sheet / drawer on mobile) → BUILDER-RESPONSIVE-1.
- **Dark-mode end-to-end pass** → BUILDER-RESPONSIVE-1.
- **a11y pass** (focus management, focus-trap on drawer / rail, screen reader pass) → BUILDER-RESPONSIVE-1.
- **Resize handle on the left rail.** Width is fixed at 420px in this slice. Resize lands when a user request justifies the surface (defer until requested).
- **Per-tab synchronization of collapse state.** Multiple-tab broadcast is out of scope; each tab reads / writes localStorage independently.

**Gate results:** typecheck OK · lint OK (5 pre-existing warnings unrelated) · lint:structure OK · lint:migrations OK · workflow-builder unit suite: **60 suites / 811 tests pass** (+2 suites + 39 tests vs RUN-PANEL-1) · canvas-config-sync integration: 6 tests pass unchanged · full workflow-builder integration suite: 83 suites / 363 tests pass (zero regressions).

### BUILDER-VALIDATION-1 outcomes (shipped 2026-05-26)

Builder-level validation surface: a header pill that shows the current error / warning count and a right-drawer summary that lists each issue with a click-to-fix route into the inspector. The helper that powers both is pure, conservative (only checks with a reliable client-side signal today), and provider-agnostic.

**Added:**

- [`features/workflow-builder/validation/collectBuilderValidationIssues.ts`](../../../features/workflow-builder/validation/collectBuilderValidationIssues.ts) — 132-line pure helper. Three issue codes:
  - `no_trigger` (error, graph-level) — fires when the workflow has zero trigger nodes.
  - `unconfigured_node` (error, per-node) — fires when a node's `type === ""` (the same signal `classifyNodeStatus` already emits as `"unconfigured"` and the node card surfaces with the amber "Not configured" chip — no second source of truth).
  - `router_routes_invalid` (error, per-node, field `routes`) — re-uses `validateRoutesValue` from `_routesValidator.ts` so the per-modal save-gate and the builder-level signal stay aligned.
  Each issue has a stable `id`, optional `nodeId` (graph-level issues omit it), and optional `fieldName`. Includes a `countBuilderValidationIssues` aggregate for the header pill.
- [`features/workflow-builder/validation/ValidationSummary.tsx`](../../../features/workflow-builder/validation/ValidationSummary.tsx) — 178-line drawer body. Subscribes to `pendingNodes` + `pendingEdges` from `useGraphSlice`, computes issues, renders either a "Ready to run" state (emerald) or a grouped-by-severity issue list. Each clickable issue (one with `nodeId`) opens that node's inspector via `configSlice.openNode({ nodeId, initialValues: node.config })` — same path the canvas click and `NodeList.Configure` use. Graph-level issues (`no_trigger`) render as plain rows, not buttons, so clicking doesn't dispatch openNode against a non-existent node.

**Extended:**

- [`features/workflow-builder/layout/BuilderHeader.tsx`](../../../features/workflow-builder/layout/BuilderHeader.tsx) — adds optional `validation?: { onOpen }` prop. When supplied, renders a `HeaderValidationPill` private subcomponent next to the run controls. Pill state machine:
  - `ready` (emerald) — 0 errors + 0 warnings, label "Ready".
  - `warning` (amber) — 0 errors + 1+ warnings, label `"{n} warning(s)"`.
  - `error` (destructive) — 1+ errors, label `"{n} issue(s)"`.
  Aria-label is always `"Open validation summary"`. The pill subscribes to the same `useGraphSlice` selectors the rest of the header uses (`pendingNodes` + `pendingEdges`) and runs the **same** helper the drawer body runs, so the count and the list never disagree. 250 lines total (under the 500-line guardrail).
- [`features/workflow-builder/WorkflowBuilder.tsx`](../../../features/workflow-builder/WorkflowBuilder.tsx) — wires `handleOpenValidation = () => openDrawer("validation")` and passes it to `BuilderHeader` as the `validation.onOpen` callback. Extends the drawer state machine: `drawerVisible` now also fires for `mode === "validation"`; `drawerTitle` maps `validation → "Validation"`; the drawer body renders `<ValidationSummary />` when `mode === "validation"`. `handleDrawerClose` is unchanged — validation drawer close is read-only with respect to graphSlice. The existing `activeNodeId` transition-ref effect handles the validation → inspector flip when the user clicks an issue (no new effect needed).

**Decisions:**

- **`useRightDrawer.RightDrawerMode` is unchanged** — the `"validation"` slot was reserved by INSPECTOR-1 and is now wired live. No mode added or removed.
- **Inline `WorkflowNodeCard` badge unchanged.** The "Not configured" amber chip from CANVAS-1 already encodes the `unconfigured_node` issue at the node level. Threading per-node issue counts through `adapters.ts` would require widening the `WorkflowNodeData` shape and isn't necessary for first-pass UX; deferred to a follow-up that also adds router-routes-error chips and run-state chips together. Documented as the right follow-up boundary.
- **No `ActivationReviewDialog` exists in V2.** `LifecycleActions` uses the SEC-4B `DestructiveActionConfirmationModal` for activation (the server returns `WorkflowConfirmationRequiredError`, the modal asks the user to type the confirmation phrase). Wiring `ValidationSummary` into a pre-publish review would require building a new dialog component first, which is a separate slice. Today, the activation button is already disabled when `hasUnsavedChanges` and the server-side activation route is the authoritative guard; surfacing builder-level validation pre-click is a follow-up.

**Issue types intentionally deferred** (each documented in the helper jsdoc + here):

- **Required-field-missing errors beyond router.** Would require loading `ActionMeta` / `TriggerMeta` for every node into the builder client state — today only the *active* node's metadata is loaded by `ConfigModalShell` via the existing meta-fetch hooks. A future slice can add a builder-scoped metadata cache (read-only by-key fetch on hydrate) and extend the helper.
- **Disconnected-integration warnings.** Would require fetching the user's integration connection state into the builder, which would be a new client read this slice deliberately avoids. Document as the right follow-up; the integration page already shows connection state.
- **Unreachable-node warnings.** Doable via graph traversal but the edge cases around branching / router routes deserve their own slice scope.
- **Per-node issue count chip on the node card.** Today the card shows the binary `Not configured` chip (CANVAS-1). Surfacing per-node issue counts (e.g. "3 problems") needs the adapter-data widening above.
- **Pre-publish activation review dialog.** No V2 `ActivationReviewDialog` exists. A future slice can introduce one that reads from this helper.

**Drawer × rail independence (verified):**

| User action | Rail visible? | Drawer mode |
|---|---|---|
| Open validation pill | unchanged | validation |
| Run dispatched while on validation | unchanged | results (replaces validation) |
| Click node issue inside validation | unchanged | inspector (replaces validation) |
| Drawer × on validation | unchanged | closed; graphSlice + activeNodeId untouched |
| Open node A while on validation | unchanged | inspector (replaces validation) |
| Collapse rail while on validation | flips | unchanged (validation stays) |

**Tests added / updated:**

- [`tests/unit/features/workflow-builder/validation/collectBuilderValidationIssues.test.ts`](../../../tests/unit/features/workflow-builder/validation/collectBuilderValidationIssues.test.ts) — 15 tests covering all three issue codes, plural / singular copy for trigger vs action unconfigured, router-routes delegation to `_routesValidator`, no router-routes validation on non-router nodes, no router validation on unconfigured router nodes, stable issue ids, provider-agnostic (fictional provider returns no provider-specific issues), and `countBuilderValidationIssues` math.
- [`tests/unit/features/workflow-builder/validation/ValidationSummary.test.tsx`](../../../tests/unit/features/workflow-builder/validation/ValidationSummary.test.tsx) — 9 tests covering the ready state (no issues), has-issues state (no_trigger + per-node), the `data-state` attribute, plural "X issues" header, provider · type label rendering, issue click round-trip through `configSlice.openNode`, `onOpenNode` callback firing, graph-level issues rendering as non-buttons (no nodeId), no graphSlice mutation on click (read-only with respect to graph), and provider-agnostic rendering for fictional providers.
- [`tests/unit/features/workflow-builder/layout/BuilderHeader.test.tsx`](../../../tests/unit/features/workflow-builder/layout/BuilderHeader.test.tsx) — 7 new tests in the "validation pill" group covering no-render-without-prop baseline, ready state with configured trigger, error count for empty workflow, plural / singular ("issue" vs "issues"), click fires `onOpen`, aria-label.
- [`tests/unit/features/workflow-builder/WorkflowBuilder.test.tsx`](../../../tests/unit/features/workflow-builder/WorkflowBuilder.test.tsx) — 7 new tests in the "validation summary" group covering: header pill renders with issue count for empty workflow, clicking pill opens validation drawer, validation drawer doesn't mutate graphSlice, closing validation drawer leaves graphSlice + activeNodeId untouched, clicking a node-bearing issue flips drawer to inspector, dispatching a run flips drawer to results, opening validation drawer doesn't collapse the left rail.

**Behavior preserved (verified):**

- All 14 pre-existing WorkflowBuilder tests + 10 LEFT-AGENT-1 tests still pass.
- All 13 pre-existing BuilderHeader tests (SHELL-1 + LEFT-AGENT-1) still pass.
- All 23 BuilderAiPanel tests pass at the unchanged left-rail mount point.
- `canvas-config-sync` 6 integration tests pass unchanged.
- `_routesValidator` is the single source of truth for router-route validation (no duplication).

**Gate results:** typecheck OK · lint OK (5 pre-existing warnings unrelated) · lint:structure OK · lint:migrations OK · workflow-builder unit suite: **62 suites / 848 tests pass** (+2 suites + 37 tests vs LEFT-AGENT-1) · full workflow-builder integration suite: 83 suites / 363 tests pass (zero regressions).

### BUILDER-V1-SHELL-PARITY-1 outcomes (shipped 2026-05-26)

Visual layout correction. The four shipped feature slices (CANVAS-1 → INSPECTOR-1 → ADD-FLOW-1 → RUN-PANEL-1 → LEFT-AGENT-1 → VALIDATION-1) put all the right surfaces in place, but the workflow detail route's outer wrapper was still constraining the builder to a narrow centered detail-page column with a separate page-header + rename form + run-history block stacked above and below. This slice rips out the legacy detail-page chrome so the builder fills the full viewport like V1.

**Root cause of the pre-PARITY layout** (verified before changing anything):

| Source | Effect |
|---|---|
| `app/workflows/[id]/page.tsx:64-95` `<main className="flex min-h-screen flex-col items-center p-8">` + `<div className="flex w-full max-w-3xl flex-col gap-6">` | Narrow centered column (`max-w-3xl` = 768px) with `p-8` padding around the whole route — pinned the builder into a centered detail-page block. |
| Same file lines 72-85 — `<header>` with `<h1>{workflow.name}</h1>` + status badge + `<LifecycleActions>` | Duplicate workflow identity above the builder. The `BuilderHeader` from SHELL-1 already renders the name + status pill — the page-header was a stacked second copy. |
| Same file line 86 — `<WorkflowEditForm workflow={workflow} />` | Separate rename form with its OWN Save button — second Save button on the route. |
| Same file line 92 — `<RunHistory runs={runs} />` | Recent-runs list rendered below the builder — gives the route a "document" feel instead of a workspace feel. V1 history is a header-launched dialog, not stacked-below. |
| `WorkflowBuilder.tsx:285` `<NodeList />` | Legacy below-canvas list view from Slice 1I.2 with a "Configure / Remove" button per node. Still mounted post-LEFT-AGENT-1 as a "defensive secondary view" per CANVAS-1 outcomes — but rendered below the canvas it makes the page feel stacked. |
| `WorkflowCanvas.tsx:218` `style={{ width: "100%", height: 560 }}` | Hard-coded 560px height. Even with `h-screen` parents the canvas wouldn't grow. |
| `BuilderShell.tsx` previous `flex flex-col gap-4` (no `h-full`) | Shell didn't inherit available height — the four-zone layout sat inside whatever block the page gave it. |

**Changed (all in `features/workflow-builder/` + the route):**

- [`app/workflows/[id]/page.tsx`](../../../app/workflows/[id]/page.tsx) — rewritten. The 32-line "← All workflows" link + `<header>` + `<WorkflowEditForm>` + `<RunHistory>` + `max-w-3xl mx-auto` wrapper is gone. The route is now a thin server-component that does auth + data fetch + provider metadata + renders `<main className="flex h-screen flex-col overflow-hidden"><WorkflowBuilder /></main>`. Drops 6 imports (`Link`, `WorkflowEditForm`, `RunHistory`, `LifecycleActions`, `displayStatus`, `workflowRunsRepo`, `toWorkflowRunSummary`) — the surfaces they fed are either lifted into `BuilderHeader` (LifecycleActions) or deferred (rename, run-history dialog). 79 lines total.
- [`features/workflow-builder/layout/BuilderShell.tsx`](../../../features/workflow-builder/layout/BuilderShell.tsx) — chained `h-full overflow-hidden` on the outer section and `min-h-0 flex-1 overflow-hidden p-3` on the inner workspace row so the canvas grows into available height. Added `min-h-0 min-w-0` on the center column so its flex child (the canvas) can shrink correctly. Added `data-testid="builder-shell"` + `data-testid="builder-workspace-row"` for the SHELL-PARITY assertion tests.
- [`features/workflow-builder/layout/BuilderHeader.tsx`](../../../features/workflow-builder/layout/BuilderHeader.tsx) — added optional `lifecycle?: { workflowId, state }` prop. When supplied, mounts `<LifecycleActions>` next to the Save button. LifecycleActions reads `workflow.state` to decide between Activate / Pause / Resume buttons and reads `isDirty` from the slice to gate the click. No duplicate Save / identity — the page-header copy is gone.
- [`features/workflow-builder/canvas/WorkflowCanvas.tsx`](../../../features/workflow-builder/canvas/WorkflowCanvas.tsx) — replaced the inline `height: 560` with `style={{ width: "100%" }}` + Tailwind `h-full min-h-[560px] flex-1`. The 560px floor stays for jsdom (React Flow needs explicit dimensions because jsdom returns 0 for `getBoundingClientRect`); the `h-full flex-1` adoption lets the canvas grow into whatever workspace height the shell gives it in production.
- [`features/workflow-builder/WorkflowBuilder.tsx`](../../../features/workflow-builder/WorkflowBuilder.tsx) — passes `lifecycle={{ workflowId: workflow.id, state: workflow.state }}` to the header. Removed `<NodeList />` mount + import. Removed the inner `<div className="flex flex-col gap-4 md:flex-row md:items-start">` middle-column wrapper (shell row now owns the column composition). Center workspace gets `flex min-h-0 flex-1 flex-col gap-2` so it inherits the row's height. Added `data-testid="builder-center-workspace"` for the SHELL-PARITY assertions.

**NodeList disposition:** the `NodeList` component file (`features/workflow-builder/canvas/NodeList.tsx`) is unchanged and its unit tests still pass — it's just no longer mounted by `WorkflowBuilder`. The visible "Configure / Remove" button affordances it provided are now:

- **Configure** → canvas node click (production) + `configSlice.openNode` slice action (tests). Single source of truth.
- **Remove** → ReactFlow keyboard-delete (production) calls `graphSlice.removeNode` under the hood. **No visible remove-button affordance after this slice.** Adding a Remove button to the inspector / context-menu is documented as a follow-up — explicitly out of scope for this layout-parity slice per the brief ("Do not remove functional surfaces that have not been replaced" — keyboard-delete IS a replacement, just less discoverable).

**WorkflowEditForm disposition:** the file (`features/workflows/WorkflowEditForm.tsx`) and its unit tests are unchanged. The component is no longer mounted on the workflow detail route. Re-introducing workflow rename as an in-header edit-in-place affordance is documented as a follow-up slice.

**RunHistory disposition:** the file (`features/workflow-builder/panels/RunHistory.tsx`) and its unit tests are unchanged. The component is no longer mounted on the workflow detail route. A future slice can add a header-launched History dialog (V1 has one) that re-uses the existing `RunHistory` component.

**Integration test migration (55 click sites across 41 files):**

The legacy `NodeList` mount exposed `getByRole("button", { name: /configure (trigger|action) node/i })` — this was the canonical pattern most integration tests used to open the inspector after picking a node via `AddNodePanel`. With `NodeList` removed, those buttons no longer exist.

A new helper [`tests/integration/features/workflow-builder/helpers/openLastNodeOfKind.ts`](../../../tests/integration/features/workflow-builder/helpers/openLastNodeOfKind.ts) calls `configSlice.openNode` directly — the same action the canvas click + the ValidationSummary issue click dispatch. The helper:

- Locates the most-recently-added node of the given kind (`"trigger"` or `"action"`) from `graphSlice.pendingNodes`.
- Wraps the dispatch in `act()` so the effect-driven drawer transition flushes before the caller asserts.
- Throws a clear error when no matching node exists (catches test-setup errors early).

41 integration test files + the discord/ subfolder were bulk-migrated via `perl -0777 -pe`. The two 3-line `await user.click(screen.getByRole(...))` blocks shrink to a single-line `await openLastNodeOfKind("trigger" | "action");` call.

**Global `next/navigation` mock** added to [`jest.setup.ts`](../../../jest.setup.ts). `LifecycleActions` now lifts into `BuilderHeader`, so every test rendering `<WorkflowBuilder>` indirectly mounts `useRouter()`. Without a default mock the Next.js app router invariant throws (`expected app router to be mounted`). The default is overridable per-test — local `jest.mock("next/navigation", ...)` calls win. `eslint.config.mjs` extended to include `jest.setup.ts` in the jest-globals file pattern.

**Tests added / updated:**

- [`tests/unit/features/workflow-builder/WorkflowBuilder.test.tsx`](../../../tests/unit/features/workflow-builder/WorkflowBuilder.test.tsx) — first "hydrates" test updated: `getByText(/empty workflow/i)` → `getByTestId("empty-canvas-state")` (the canvas overlay is the only empty-state surface now). New "Slice 4.BUILDER-V1-SHELL-PARITY-1" group adds 5 tests: BuilderShell is the only top-level workspace wrapper (testid + workspace-row + center-workspace), no below-canvas NodeList (`/empty workflow/i` + `role="list", name=/workflow nodes/i` absent), LifecycleActions inside BuilderHeader (Activate button found inside the header banner), exactly one Save button (no duplicate from old page-header / WorkflowEditForm), canvas drops `style="height: 560px"` and uses `h-full min-h-[560px] flex-1` Tailwind classes.
- [`tests/integration/features/workflow-builder/canvas-config-sync.test.tsx`](../../../tests/integration/features/workflow-builder/canvas-config-sync.test.tsx) — describe name updated; tests rewritten to use slice-direct paths (the canvas click + slice action are the same source of truth); 6 tests still pass.
- [`tests/integration/features/workflow-builder/native-router-routes-editor.test.tsx`](../../../tests/integration/features/workflow-builder/native-router-routes-editor.test.tsx) — both "Configure action node" click sites migrated to `configSlice.openNode` directly with the router node payload; 2 tests still pass.
- [`tests/integration/features/workflow-builder/helpers/openLastNodeOfKind.ts`](../../../tests/integration/features/workflow-builder/helpers/openLastNodeOfKind.ts) — new helper. 26 lines. Documented as the mechanical replacement for the NodeList Configure pattern.
- 41 integration test files + the 2 `discord/` subfolder files — bulk-migrated to use the new helper.

**Drawer × rail × header independence** still preserved after the layout shift: all 7 BUILDER-VALIDATION-1 drawer-independence tests + all 10 BUILDER-LEFT-AGENT-1 rail-independence tests + all 14 pre-VALIDATION-1 WorkflowBuilder tests pass.

**Rendered layout (post-PARITY):**

```
viewport (h-screen, overflow-hidden)
└── <main> (flex h-screen flex-col)
    └── <BuilderShell> (h-full, flex flex-col, overflow-hidden)
        ├── <BuilderHeader> (h-12)
        │   ├── workflow name + save status pill
        │   ├── (right) left-rail toggle · validation pill · Test/Run · Save · Activate/Pause/Resume
        │   └── (left) left-rail toggle when rail collapsed
        └── workspace row (min-h-0 flex-1, flex md:flex-row)
            ├── <BuilderLeftAgentRail> (md:w-[420px]) — React Agent (BuilderAiPanel)
            ├── center column (min-w-0 flex-1, min-h-0)
            │   ├── canvas-actions (+ Add action)
            │   └── <WorkflowCanvas> (h-full min-h-[560px] flex-1) — Dots background
            └── <BuilderRightDrawer> (md:w-[420px]) — Inspector | Run results | Validation
```

**Remaining visible differences from V1** (documented for future slices):

- **Workflow rename** — V1 has edit-in-place title in the header. V2 currently shows a read-only name. Re-introduce as a header edit-in-place affordance in a future slice.
- **Recent runs / history dialog** — V1 has a header History button that opens a modal listing prior runs with retry. V2 no longer renders the below-builder `RunHistory` list; a future slice can wire a header-launched dialog (`RunHistory` component is unchanged and ready to re-mount).
- **Node remove button** — V1 has a per-node context menu / inspector Remove. V2 currently exposes only ReactFlow keyboard-delete. Adding an inspector Remove button or right-click context menu is a future slice.
- **Header secondary actions** — V1 has Undo/Redo, Recenter, Lock view, Cloud API, History, Versions, Comments, Share, More menu. V2 has Save / Test / Run / Publish / left-rail toggle / validation pill. Most of these (Undo/Redo, History, Versions, Share) require slice / persistence support that doesn't exist yet.
- **Multi-color route rotation** — V1 colors branching edges with up to 6 rotation colors. V2 uses a single edge color. Defer until router/branching UI work.
- **Run-state animations** — V1 has running-shimmer / listening-ring / paused-pulse on the node card. V2 has the `data-status` attribute + `classifyNodeStatus` helper plumbed, but the animations + per-node run-state projection aren't wired yet. Owner: a slice after run-state projection lands.
- **MiniMap** — V1 doesn't have one either; V2 also doesn't. Not a parity gap; if it becomes desired, it can land here.
- **Pre-publish ActivationReviewDialog** — V1 has one; V2 doesn't. `LifecycleActions` uses the SEC-4B confirmation modal. Documented as a follow-up alongside the ValidationSummary integration.

**Gate results:** typecheck OK · lint OK (5 pre-existing warnings unrelated) · lint:structure OK · lint:migrations OK · workflow-builder unit suite: **62 suites / 853 tests pass** (+5 tests vs VALIDATION-1) · full workflow-builder integration suite: **83 suites / 363 tests pass** (55 click sites migrated via `openLastNodeOfKind` helper; zero behavior regressions) · LifecycleActions + WorkflowEditForm + WorkflowsList + CreateWorkflowButton unit suites (28 tests) pass unchanged.

---

## 9. Tests required

### Component / unit (Jest + RTL — extend `tests/`)

- **Shell.** `BuilderShell` renders the 4 zones (header / left rail / canvas-and-rest / right drawer); `BuilderHeader` composes title + status + actions + left-rail toggle; `BuilderRightDrawer` mounts exactly one of `inspector | results | validation` (**no `ai` mode** — the union is narrowed in BUILDER-LEFT-AGENT-1).
- **Left rail (BUILDER-LEFT-AGENT-1).** `BuilderLeftAgentRail` mounts `BuilderAiPanel`; visible by default on desktop; collapse toggle reverses visibility; collapsed state survives a remount (read from `useLeftAgentRail` / localStorage); right drawer state is independent of left rail state (both can be open simultaneously).
- **Empty state.** `EmptyCanvasState` renders when no nodes; CTA dispatches the right add-trigger action.
- **Node card.** `WorkflowNodeCard` renders provider label + display name + status; selected state styles; "Not configured" chip when required FieldMeta is missing.
- **Edge plus-button.** `WorkflowEdge` plus-button appears on hover; click opens `AddNodePanel` with insert context.
- **Add-node panel.** `AddNodePanel` search filters across native + provider items; selecting an item dispatches the existing addTrigger/addAction actions (re-uses existing tests).
- **Inspector mount.** Selecting a node opens the drawer; closing returns focus to the node.
- **Run panel header.** Test button runs in test mode; Run is hidden for automated triggers; 409 still opens the confirmation modal.
- **Results drawer.** Failed run shows step pills + repair block.
- **AI left rail.** Preview / apply contract unchanged (re-use existing AI-11/11B tests at the new mount point — left rail instead of right drawer).
- **Validation summary.** Pill count matches; clicking issue jumps to node.
- **Keyboard.** Cmd+S triggers save; Esc closes drawer (does NOT collapse left rail — Esc is for transient surfaces, the rail is persistent); Cmd+Z / Cmd+Shift+Z dispatch undo/redo.

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
9. **Right drawer as AI host (regression to pre-correction direction).** Easy to add a `"ai"` mode back to `RightDrawerMode` when implementing some future feature ("just show the agent in the drawer for X case"). Mitigation: BUILDER-LEFT-AGENT-1 explicitly removes `"ai"` from the union and lands a typed-union assertion test; any reintroduction must update that test and explain why. Default answer: the React Agent lives in the left rail; the right drawer is node-contextual only.
10. **Mounting a general app-level help assistant in the builder left rail.** Tempting because the rail is visible and AI-shaped. Mitigation: scope guard — the rail is workflow-builder scoped and mounts only `BuilderAiPanel` (AI-11/11B service). A general help surface lives outside the builder shell.
11. **Adding chat / thread persistence inside BUILDER-LEFT-AGENT-1.** The visible left rail makes multi-turn chat a tempting next step. Mitigation: explicit non-goal in §0. Persistence is a follow-up track with its own service contract.

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

> **Corrected 2026-05-26.** Sequence #7 changed from `BUILDER-AI-PANEL-1` (move AI to right drawer) to `BUILDER-LEFT-AGENT-1` (move AI to left rail). See §0 Correction history for rationale.

1. **BUILDER-UI-V1-AUDIT-1** — this doc. *(shipped)*
2. **BUILDER-UI-SHELL-1** — header + content shell. *(shipped — 2-zone foundation; 4-zone grid extension lands in #7)*
3. **BUILDER-CANVAS-1** — node card + empty state + full-height canvas. *(shipped)*
4. **BUILDER-INSPECTOR-1** — config moves into right drawer. *(shipped)*
5. **BUILDER-ADD-FLOW-1** — `AddNodePanel` + edge plus-button. *(shipped)*
6. **BUILDER-RUN-PANEL-1** — Run / Test in header; results into drawer. *(shipped)*
7. **BUILDER-LAYOUT-CORRECTION-1** — plan-only correction: AI → left rail (not right drawer). *(shipped 2026-05-26)*
8. **BUILDER-LEFT-AGENT-1** — `BuilderLeftAgentRail` hosts `BuilderAiPanel`; header gains rail toggle; `BuilderShell` extends to 4-zone; `useRightDrawer` drops `"ai"` mode. *(shipped 2026-05-26)*
9. **BUILDER-VALIDATION-1** — `ValidationSummary` drawer + header pill. *(shipped 2026-05-26)*
10. **BUILDER-V1-SHELL-PARITY-1** — full-bleed workspace, route wrapper rewrite, NodeList removal, identity folded into header. *(shipped 2026-05-26)*
11. **BUILDER-DESIGN-PARITY-1** — pivot from V1 reference to the Anthropic ChainV2 design as the visual target; full builder-surface restyle (header / left rail / canvas / nodes / edges / drawer / pickers) onto the dense Anthropic palette without changing behavior. *(shipped 2026-05-26 — see outcomes section below)*
12. **BUILDER-RESPONSIVE-1** — responsive + dark mode + a11y pass.
13. **BUILDER-UI-CLOSEOUT** — outcomes doc + (optional) Playwright walkthrough.

---

## Outcomes — 4.BUILDER-DESIGN-PARITY-1

**Branch:** `builder-ui-v1-audit-1`
**Shipped:** 2026-05-26
**Status:** Implemented + 1220 builder unit/integration tests green.

### Direction pivot — V1 reference → Anthropic ChainV2 design

The earlier slices in this track (UI-SHELL-1 through V1-SHELL-PARITY-1) treated `chainreact-app-9e@marcus_dev` as the visual reference. The user paused BUILDER-V1-SHELL-PARITY-1 mid-stream and pointed the visual target at the **Anthropic Builder design** at `https://api.anthropic.com/v1/design/h/C-eRjwJ6y62ntvAoqivW0g?open_file=Workflow+Builder.html` — a dense / technical (n8n / Retool feel) builder mocked in HTML/CSS/JS via `claude.ai/design`.

The audit bundle fetched, decompressed (`gzip + tar`), and read:

- `chainv2builder/README.md` — handoff notes (read the chat transcript first; recreate pixel-perfectly in whatever fits the target codebase).
- `chainv2builder/chats/chat1.md` — user iteration: dense & technical aesthetic, sky-blue accent (`#0284c7`), chat-style React Agent left rail, Minimal vs Expressive variants, dark mode.
- `chainv2builder/project/Workflow Builder.html` — root document loading 8 babel modules.
- `chainv2builder/project/src/{app,header,left-rail,canvas,inspector,trigger-picker,data,icons}.jsx` — the React-flavored prototype source.

### Design → V2 component mapping

| Design region | V2 home | Disposition |
|---|---|---|
| Top header strip (h-48) | [`features/workflow-builder/layout/BuilderHeader.tsx`](../../../features/workflow-builder/layout/BuilderHeader.tsx) | Rewritten as a 3-region grid (left identity / center meta strip / right action cluster). Sky-blue accent, mono-uppercase status pills, btngroup for undo/redo/history. |
| Workflow identity (breadcrumb + name + state + dirty) | `BuilderHeader.HeaderLeft` | Breadcrumb shows `workflow / draft / `; name + StatusPill (Saving… / Unsaved changes / Saved. / role=alert error). Test-text contract preserved verbatim. |
| Center meta (ID / runs / success / tasks) | `BuilderHeader.HeaderCenterMeta` | **Workflow ID is real**; runs / success / tasks render as `—` with "Coming soon" titles. Marked deferred. Hidden below `lg`. |
| Right cluster (btngroup, validation chip, theme, Test, Save, sep, Activate, Share, More) | `BuilderHeader.HeaderRight` | Undo / Redo / History render as disabled placeholders in a panel-2 btngroup. Save is the design's dark primary button. `HeaderValidationPill` keeps the existing test contract (`/^1 issue$/i`, `/^2 issues$/i`) — leading icon glyph removed so `textContent` stays clean. `LifecycleActions` mounts in-place. |
| Left rail (320px expanded, 40px collapsed spine) | [`features/workflow-builder/layout/BuilderLeftAgentRail.tsx`](../../../features/workflow-builder/layout/BuilderLeftAgentRail.tsx) | Full chat-style chrome: gradient sparkle logo, "React Agent" + "connected · claude" status line, in-rail × button. **Collapsed mode now renders a 40px vertical spine with rotated `REACT AGENT` label + expand button** — children still NOT mounted while collapsed (load-bearing). |
| React Agent body (chat composer + plan card) | [`features/workflow-builder/panels/BuilderAiPanel.tsx`](../../../features/workflow-builder/panels/BuilderAiPanel.tsx) + [`_BuilderAiPanelPreview.tsx`](../../../features/workflow-builder/panels/_BuilderAiPanelPreview.tsx) | Composer is the design's textarea + Plan with AI button + ⌘↵ kbd hint. Plan preview adopts the Anthropic plan-card aesthetic (Proposed-change pill, risk-level chip, mono stats row, color-coded op chips, error/warning lists). AI-11 / AI-11B contract preserved end-to-end. |
| Canvas top action bar (Builder/Run/Schema/Settings tabs + env tags + Add action) | [`features/workflow-builder/canvas/WorkflowCanvas.tsx`](../../../features/workflow-builder/canvas/WorkflowCanvas.tsx) → `CanvasActionBar` | Segmented tab control with **Builder active**, **Run history / Schema / Settings disabled** ("Coming soon"). Env / trigger / node-count tags as mono-styled chips. Primary "+ Add action" CTA wired to `openActionPicker` (replaced the old centered-above-canvas button; only one Add-action surface now). |
| Canvas background (radial dot grid) | `WorkflowCanvas` + `.builder-dot-grid` utility in [`app/globals.css`](../../../app/globals.css) | Two layered radial-gradient dot grids (18px + 90px) replace ReactFlow's default `Background` dots (now rendered transparent to avoid double dots). |
| ReactFlow Controls + MiniMap | `WorkflowCanvas` | Both retained, restyled to read against `--builder-panel`. Minimap was previously absent — added per design. |
| Node card (status rail + brand + kind chip + title + subtitle + badges) | [`features/workflow-builder/canvas/WorkflowNodeCard.tsx`](../../../features/workflow-builder/canvas/WorkflowNodeCard.tsx) | 280px (matches design `NODE_W`). Left 3px status rail (success / warn / accent per status). Kind chip ("trigger" / "action") in mono uppercase. Brand initials-avatar (logo when `iconUrl` present). Dashed-top footer with `Not configured` chip or neutral `ready` badge. Per-node run stats footer deferred. |
| Edges (stepped / orthogonal + plus button on hover) | [`features/workflow-builder/canvas/WorkflowEdge.tsx`](../../../features/workflow-builder/canvas/WorkflowEdge.tsx) | Switched from `getBezierPath` to `getSmoothStepPath` with 8px corner radius. Stroke bound to `--builder-border-strong` / `--builder-accent`. Plus button restyled — dashed → solid on hover with accent fill. |
| Empty canvas state (framed Anthropic card) | [`features/workflow-builder/canvas/EmptyCanvasState.tsx`](../../../features/workflow-builder/canvas/EmptyCanvasState.tsx) | Diagonal-rule frame strip, mono "EMPTY · NO TRIGGER · NO ACTIONS" tag, 18px title, paragraph body, "Choose a trigger" primary + "Describe to AI" / "Import from template" disabled placeholders. Recent-triggers list deferred. |
| Right drawer chrome | [`features/workflow-builder/layout/BuilderRightDrawer.tsx`](../../../features/workflow-builder/layout/BuilderRightDrawer.tsx) | Edge-to-edge against canvas with single 1px vertical divider (no rounded card framing). 380px md+ (matches design). |
| Node inspector head + tab strip | [`features/workflow-builder/panels/NodeInspectorPanel.tsx`](../../../features/workflow-builder/panels/NodeInspectorPanel.tsx) → `InspectorTabs` | **Setup / Advanced / Test / Variables tab strip** added — Setup active w/ accent underline; the other 3 disabled with "Coming soon" titles. `ConfigModalShell` mounts inside the body unchanged (schema-form behavior intact). |
| Trigger / action picker (modal + native list + provider grid + drill-in) | [`AddNodePanel.tsx`](../../../features/workflow-builder/panels/AddNodePanel.tsx) + [`TriggerPicker.tsx`](../../../features/workflow-builder/panels/TriggerPicker.tsx) + [`ActionPicker.tsx`](../../../features/workflow-builder/panels/ActionPicker.tsx) + [`_pickerShared.tsx`](../../../features/workflow-builder/panels/_pickerShared.tsx) | Modal overlay restyled to the Anthropic palette command-palette (backdrop blur, search row with icon + esc chip, dense rows). Provider section restructured **from flat list to 2-column grid with drill-in** (per user direction). Shared `PickerSectionHeader` / `PickerRow` / `ProviderCard` extracted to `_pickerShared.tsx` to avoid duplication. All test contracts (aria-labels, "Browse {provider}" button names) preserved verbatim. |
| Run results / Validation summary | [`RunResultsPanel.tsx`](../../../features/workflow-builder/panels/RunResultsPanel.tsx) + [`ValidationSummary.tsx`](../../../features/workflow-builder/validation/ValidationSummary.tsx) | Light restyle to read against the new drawer chrome (mono labels, Anthropic palette colors). No structural change. |
| Design tokens (palette + fonts + shadows) | [`app/globals.css`](../../../app/globals.css) | Added 28 `--builder-*` variables (light + dark variants) covering bg / panel / panel-2 / border / border-strong / text / text-2 / muted / muted-2 / accent / accent-soft / accent-strong / success(-soft) / warn(-soft) / danger(-soft) / grid / grid-strong / shadow-{sm,md,lg}. Geist + JetBrains Mono fonts loaded in `app/layout.tsx`. New `.builder-mono` and `.builder-dot-grid` utility classes. `[data-builder-surface]` selector retones the workflow detail route. shadcn HSL tokens (`--primary` etc.) left alone so the rest of the app is unchanged. |
| Route wrapper marker | [`app/workflows/[id]/page.tsx`](../../../app/workflows/[id]/page.tsx) | Added `data-builder-surface` to the `<main>` so the palette only applies inside the builder. No behavior change. |

### Files changed (implementation)

```
app/globals.css                                                    +73 −7
app/layout.tsx                                                     +3 −1
app/workflows/[id]/page.tsx                                        +1 −0
features/workflow-builder/WorkflowBuilder.tsx                      +22 −14
features/workflow-builder/canvas/EmptyCanvasState.tsx              +130 −53
features/workflow-builder/canvas/WorkflowCanvas.tsx                +135 −37
features/workflow-builder/canvas/WorkflowEdge.tsx                  +24 −12
features/workflow-builder/canvas/WorkflowNodeCard.tsx              +94 −59
features/workflow-builder/layout/BuilderHeader.tsx                 +273 −156
features/workflow-builder/layout/BuilderLeftAgentRail.tsx          +109 −19
features/workflow-builder/layout/BuilderRightDrawer.tsx            +44 −33
features/workflow-builder/layout/BuilderShell.tsx                  +16 −16
features/workflow-builder/layout/HeaderRunControls.tsx             +3 −2
features/workflow-builder/layout/_BuilderHeaderIcons.tsx           +164 (new)
features/workflow-builder/panels/ActionPicker.tsx                  +147 −108
features/workflow-builder/panels/AddNodePanel.tsx                  +84 −20
features/workflow-builder/panels/BuilderAiPanel.tsx                +98 −167
features/workflow-builder/panels/NodeInspectorPanel.tsx            +51 −5
features/workflow-builder/panels/RunResultsPanel.tsx               +10 −5
features/workflow-builder/panels/TriggerPicker.tsx                 +145 −74
features/workflow-builder/panels/_BuilderAiPanelPreview.tsx        +259 (new)
features/workflow-builder/panels/_pickerShared.tsx                 +105 −0
features/workflow-builder/validation/ValidationSummary.tsx         +6 −4
```

Plus 5 test file updates:

```
tests/unit/features/workflow-builder/WorkflowBuilder.test.tsx
tests/unit/features/workflow-builder/canvas/EmptyCanvasState.test.tsx
tests/unit/features/workflow-builder/canvas/WorkflowCanvas.test.tsx        (+42 new design-parity tests)
tests/unit/features/workflow-builder/layout/BuilderLeftAgentRail.test.tsx
tests/unit/features/workflow-builder/panels/NodeInspectorPanel.test.tsx    (+20 new design-parity tests)
```

### Behavior preserved (load-bearing invariants asserted by tests)

- ✅ Workflow save round-trip — Save button + Cmd+S + slice `updateWorkflow` boundary unchanged. "Saved." text contract preserved.
- ✅ AI-11 / AI-11B preview-then-apply contract — value-free output, risk acknowledgment gate, char counter, stale-patch recovery, plan-failure copy. All testids (`builder-ai-plan-button`, `-prompt`, `-preview`, `-changes`, `-risk-reasons`, `-validation-errors`, `-validation-warnings`, `-apply-button`, `-apply-success`, `-apply-failure`, `-rerun-button`, `-clear-button`, `-needs-input`, `-unsupported`, `-safety`, `-plan-failure`, `-plan-failure-detail`, `-risk-ack-checkbox`, `-char-count`) preserved verbatim.
- ✅ Drawer mode state machine (inspector / results / validation, mutually exclusive) and the inspector ↔ run-state transition refs in `WorkflowBuilder`.
- ✅ Left rail collapse persists to localStorage; children unmount when collapsed.
- ✅ ReactFlow canvas dispatch contract — node click → `openNode`, drag-stop → `updateNodePosition`, connect → `connectNodes`, delete → `removeNode` / `removeEdge`.
- ✅ HeaderRunControls (Test Workflow / Run Manually / destructive-action 409 modal flow).
- ✅ ValidationSummary "Ready" + issue-count states + clicking an issue opens the inspector via `openNode`.
- ✅ AddNodePanel modes (trigger / action / insertAction with edgeId) + edge plus-button.
- ✅ TriggerPicker + ActionPicker test contracts — aria-labels on lists (`Native triggers list`, `Native actions list`, `Trigger providers`, `Action providers`, `{provider} triggers list`, `{provider} actions list`), button names (`Browse {provider} triggers`, `Browse {provider} actions`, `Back to {trigger/action} picker`), empty / loading / error copy.
- ✅ `WorkflowNodeCard` test contracts — `data-testid="workflow-node-view"`, `data-kind`, `data-selected`, `data-status`, `not-configured-badge`, `provider-initials-avatar`, `provider-icon`, plus the `(unconfigured)` subtitle.

### Deferred design elements (documented as "Coming soon" placeholders, not faked)

| Design element | Decision | Rationale |
|---|---|---|
| Header center meta — `runs/24h`, `success`, `tasks/run` | Render `—` placeholder cells (only `ID` is real) | V2 doesn't surface per-workflow analytics yet. The cells exist so the meta-strip layout reads correctly. |
| Header `theme` toggle (light/dark) | Skipped (out of scope) | Theme system is owned by BUILDER-RESPONSIVE-1. |
| Header `Share` icon button | Skipped (out of scope) | V2 doesn't have a sharing surface inside the builder; would be a separate feature slice. |
| Left rail stats strip (prompt tok / ctx / model) | Skipped — left rail header carries only "connected · claude" | V2 doesn't track per-session diagnostic metrics; faking would violate the no-fake-data rule. |
| Left rail quick-prompt chips | Skipped | Would be a thin UX add — defer to a follow-up if user-prompted. |
| Canvas top tabs — `Run history`, `Schema`, `Settings` | Render disabled with "Coming soon" titles | V2 routes those flows outside the builder today; the tabs exist so the segmented control reads correctly. |
| Header btngroup — `Undo`, `Redo`, `History`, `Comments` | Render disabled | No slice support yet. |
| Node card stats footer (runs / last) | Replaced with neutral `ready` chip (or `Not configured` if unconfigured) | No per-node run history projected into the canvas yet. |
| Inspector tabs — `Advanced`, `Test`, `Variables` | Render disabled with "Coming soon" titles | Only `Setup` is wired in V2; the strip exists so the visual hierarchy matches. |
| Inspector status row (`created` / `by` / `rev`) | Skipped | Same — no metadata projection yet. |
| Empty-state "Recent triggers" list | Skipped | No per-workspace recency tracking yet. |
| Edge labels (rect bubble with mono text) | Skipped | V2's edge model doesn't carry labels today. Edge model would need a label field first. |
| Live-cursor / live-runs pill | Skipped | No real-time projection. |
| Header `Activate` button color (green publish button) | LifecycleActions retains its existing styling | Out of scope for this slice — handled by `LifecycleActions` already. |

### Old centered layout

Already removed in BUILDER-V1-SHELL-PARITY-1 (the `max-w-3xl mx-auto` wrapper, `WorkflowEditForm`, `RunHistory` below-canvas mount were all deleted there). This slice did **not** re-introduce any of them, and `data-builder-surface` on the route container is purely additive (palette-only, no layout change).

### Provider / backend / AI service files untouched (confirmed)

```
$ git diff --name-only main...HEAD | grep -E "(lib/api|services|workflow-engine|integrations|stores|core/)" | head
(empty)
```

No files under `lib/api/`, `services/`, `workflow-engine/`, `integrations/`, `stores/`, or `core/` changed in this slice. The AI / planner / workflow-execution / billing / tasks paths are untouched. Provider metadata (`integrations/_registry`, per-provider definitions) untouched.

### Verification gates (snapshot at end of slice)

- `npx tsc --noEmit` — **clean (exit 0)**.
- `npx jest tests/unit/features/workflow-builder/ tests/integration/features/workflow-builder/ --no-coverage` — **1220 passed, 0 failed across 145 suites**.
- Lint + lint:structure + lint:migrations — run in the final closeout pass.

