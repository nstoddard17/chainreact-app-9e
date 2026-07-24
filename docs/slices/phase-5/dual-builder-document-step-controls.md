# Document Builder — step controls & grouping (DOC-STEP-CONTROLS-1)

Durable UX decisions for the document-style workflow builder surface
(`features/workflow-builder/document/`). Implemented in commit `86991c5fe`.
This note records the *rules*; the stored shapes live in the contracts linked
below and are not duplicated here.

## Rail

The left rail carries **reading-order markers only** — the `When` badge for the
trigger and a numeral for each action, in one fixed-width column so every
provider pill and sentence shares a left edge. No control is ever painted on or
over the rail. Multi-selection is shown as a left spine on the block
(`data-document-selected`) and is toggled from the step's overflow menu, never
by an unlabeled checkbox/switch on the marker.

## Lifecycle

Workflow-level **Draft / Active / Paused** lives in the builder header only:
the breadcrumb states the real `WorkflowState`
(`builder-header-workflow-state`) and the existing `LifecycleActions` cluster
owns Activate / Pause / Resume / Reactivate. The Document surface never renders
a lifecycle control — its banner explains setup state and nothing more.

## Discoverability without hover

Step management must be visible before the pointer arrives:

- every sentence has a quiet, **always-rendered** overflow button
  (`document-step-menu-<nodeId>`) in a **reserved** right-hand column, so
  hovering a sentence can never reflow it;
- every insertion point — between the trigger and the first action, between
  actions, at the tail, and at a branch-lane start — is an **always-painted**
  compact `＋` (`.crv2-insert`) that only *widens* to its label on hover/focus;
  the label text and `aria-label` are present at all times.

Hover may change contrast or width. Hover must never be what makes a control
exist. Both menus share one keyboard model
(`document/documentMenuKeyboard.ts`: ArrowDown opens, arrows/Home/End rove,
Escape and blur close), and the Document surface carries a single
`:focus-visible` ring.

## Configuration

**Clicking the sentence is the primary configure action** — the step title is
the button that opens the existing inspector
(`document-configure-step-<nodeId>`). Clicking an unresolved field chip still
opens that field's Guided Stop. The overflow menu repeats "Configure step" for
discoverability; it never becomes the main path.

## Groups (formerly "Sections")

The user-facing concept is **Group**. A group header is labelled `GROUP`, is
renamed inline (a newly created group opens straight into naming — never an
unexplained default card), collapses/expands, and states in place:

> Grouping is visual only — it doesn't change the order your steps run in.

That is literally true: grouping is **presentation-only**. It is stored as the
optional `presentation` block on the workflow definition and the execution
engine never reads it — it consumes only `nodes`/`edges`. `nodeIds` is
membership, not order.

- Contract + normalization rules: [`contracts/workflowPresentation.ts`](../../../contracts/workflowPresentation.ts)
- Where it hangs off the definition: [`contracts/workflowDefinition.ts`](../../../contracts/workflowDefinition.ts)
- Draft state + commands: `features/workflow-builder/state/presentationCommands.ts`
  (via `graphSlice`), grouping applied *after* projection in
  `document/documentSections.ts`.

Grouping is reached from the step overflow menu ("Group steps", "Add to
*<group>*", "Move out of group") and from the multi-select toolbar ("Group
steps"). It is **not** an insertion action, so the insert menu offers no
Section/Group entry. The stored shape did not change in this slice, so
workflows created before the rename keep their titles, membership and collapse
state with no migration.

## Per-step disable — deliberately not shipped

There is **no per-step enable/disable**. V2 has no node-level `disabled` flag in
`WorkflowNodeSchema` and the execution engine has no skip-and-rewire semantics
for one, so a "Disable" menu entry (or a dimmed "Disabled" sentence) would be UI
with no runtime meaning. Shipping it is a contract + engine change — readiness
treatment of a disabled node, AI patch/export/template handling, activation
gating — and belongs in its own slice, not in a builder-UX pass.
