# DOC-CONFIG-SYNC-1 — Document ↔ configuration-panel field synchronization

**Status:** implemented (local commit; not pushed)
**Surface:** Document Builder (`documentBuilderEnabled`) + the right-side Node
configuration panel.

## Problem

Clicking an editable value in a Document sentence opened the inline Guided Stop,
but the matching field in the right-side Node configuration panel stayed visually
passive — the two surfaces read as unrelated even though they edit the same node
configuration.

## What was already true (audit)

The two surfaces were **never** separate state. Both render the real field
renderers over the same `configSlice` draft:

| | Inline Guided Stop | Right config panel |
|---|---|---|
| open | `configSlice.openNode` | `configSlice.openNode` |
| read | `drafts[nodeId].values` | `drafts[activeNodeId].values` |
| write | `configSlice.updateField` | `configSlice.updateField` |
| commit | `commitNodeConfigDraft` (Done) | `commitNodeConfigDraft` (Save) |

So this batch layered **guidance** over an already-shared draft. No unification
was required, and no second pending copy, save path, or API request was
introduced.

## The contract

**Field identity is `(nodeId, FieldMeta.name)`** — never display text, never a
bare field key. Two steps can each own a field called `property`.

`configSlice` carries the guidance focus:

```
focusFieldKey     : string | null   // FieldMeta.name
focusFieldNodeId  : string | null   // the node half (null = legacy unscoped caller)
focusFieldOrigin  : "reveal" | "inline" | null
focusField({ nodeId, fieldKey, origin })   // set/clear; navigation only
```

`GuidedStopEditor` **publishes** the field it is drawing; `ConfigModalShell`
**consumes** it (reveal + ring + tab switch). Neither surface reaches into the
other.

### Highlight lifetime — the `origin` split

The existing `revealNode` guidance (AI-REPAIR-2F, validation navigation,
`?focus=setup`) is a one-shot *"go to this field"* nudge: editing the field
consumes it. That behaviour is unchanged (`origin: "reveal"`).

An `origin: "inline"` highlight is **not** a nudge — it is a live *"this is the
field you are editing"* indicator, so it must survive edits to that field. It is
bound to the inline editor's lifetime: it moves when the drawn field changes and
is released on Done / Cancel / Escape / inspector handoff.

**Deliberate decision:** no timeout timer. Binding to an open editor is a
stronger, non-arbitrary signal than an arbitrary duration, and it is
deterministic to test.

## Superseded decision

5.DUAL-BUILDER-1 **CS-2 suppressed the inspector drawer** for a Guided-Stop-driven
selection, reasoning that two editors for one field is one too many
(`guidedStopNodeRef` in `WorkflowBuilder`). **DOC-CONFIG-SYNC-1 reverses this.**
The panel is not a second editor — it is the second *view* of the same shared
draft, and users read the sentence and the panel as one thing. The ordinary
`activeNodeId` transition now opens the drawer for every selection path, and the
suppression ref is gone.

The superseded test (`guidedStop.test.tsx`, "does NOT open the inspector drawer
for a Guided-Stop selection") was rewritten to assert the new behaviour, with the
supersession noted inline.

## Dependent fields

`planGuidedStop` gained a third outcome, `prerequisite`. When the clicked field
has an unanswered `dependsOn` parent, the stop draws **the parent** (the real next
decision) with an explanatory line, and — because the plan is recomputed from the
live draft values — advances to the originally requested field on its own the
moment the parent is filled. The panel highlight follows both hops.

Rules:

- **Provider-agnostic by construction.** It reads only `dependsOn` + values, so
  account→property, team→channel, workbook→worksheet, database→table all behave
  identically. No provider knowledge lives in a Document component.
- **Left-to-right, one question at a time** for multi-level chains.
- **No redirect to a parent the Document can't honestly ask** (secret, composite,
  structural, hidden) — the requested field is drawn as-is and its renderer keeps
  its existing "Select `<parent>` first" hint.
- **A mis-authored `dependsOn` cycle terminates** (a visiting set), never hangs.

## Accessibility

- Keyboard focus **stays in the inline editor**; the panel reveal is a store write
  only. Proven by test.
- The revealed field is announced once, politely
  (`data-testid="config-focus-announcement"`), and the text only changes when the
  target changes — a re-render never re-announces.
- The field **label stays visible**; the ring is never the only signal.
- The guidance ring uses the accent colour — deliberately not the
  destructive/validation colour and not the Document's selection treatment.
- `prefers-reduced-motion` ⇒ `scrollIntoView({ behavior: "auto" })` and the ring's
  transition is suppressed. Proven by test.
- The highlight never touches the user's Document step selection.

## Files

| File | Change |
|---|---|
| `features/workflow-builder/state/configSlice.ts` | `focusFieldNodeId` / `focusFieldOrigin` / `focusField()`; node-scoped clearing |
| `features/workflow-builder/document/guidedStopModel.ts` | `prerequisite` plan outcome (pure) |
| `features/workflow-builder/document/GuidedStopEditor.tsx` | publishes the drawn field; draws + explains a prerequisite |
| `features/workflow-builder/config-modal/ConfigModalShell.tsx` | node-scoped highlight, tab follow, polite announcement |
| `features/workflow-builder/config-modal/SchemaForm.tsx` | reduced-motion scroll; ring comment |
| `features/workflow-builder/WorkflowBuilder.tsx` | drawer suppression removed |
| `tests/unit/features/workflow-builder/document/documentConfigSync.test.tsx` | 19 focused tests (new) |

## Deliberately not changed

Document sentence layout, step overflow menus, insertion controls, Group
behaviour, React Agent dock, Visual-mode canvas, workflow execution semantics,
Save/Done ownership, provider schemas, database structure, per-step disable.

The Document **sentence chip** still projects the canonical graph, not the pending
draft — the existing pending-edit contract. While a stop is open the chip carries
`data-chip-state="editing"`; it takes the new value on Done. Unchanged here.
