# Dual Builder CS-7 — Document Keyboard & Accessibility Model

**Slice:** 5.DUAL-BUILDER-1 CS-7 (polish / a11y / exposure readiness).
**Status:** implemented behind `ENABLE_DOCUMENT_BUILDER` (default OFF).
**Scope:** the Document Builder surfaces only. The Visual Builder is unchanged.

This is the documented keyboard-interaction and accessibility model the Document
Builder implements and is tested against. It is a reference for reviewers and for
the exposure checklist — not new runtime behaviour beyond what CS-7 shipped.

## Keyboard interaction model

| Action | Behaviour | Where |
|---|---|---|
| **Tab / Shift+Tab** | Traverses actionable Document controls in document order — value/blank chips, insertion `+`, section header controls, selection-toolbar actions, map rows, Ask React bar. Every control is a real `<button>`/input (focusable, not a div). | all Document surfaces |
| **Enter / Space** | Activates the focused chip, insertion control, section control, map row, or toolbar action (native button semantics). | all |
| **Escape** | Priority order: (1) an open Guided Stop closes (cancel semantics, focus returns to origin); (2) an open insertion menu closes; (3) the open Whole Workflow map closes; (4) selection/preview state as applicable. Each overlay `stopPropagation()`s its own Escape so the priority never double-fires. | GuidedStopEditor, DocumentInsertMenu, WholeWorkflowMap |
| **Arrow ↑/↓** | Inside the insertion menu, moves focus among menu items (wraps); **Home/End** jump to first/last; **ArrowDown** on the closed trigger opens the menu. | DocumentInsertMenu |
| **Arrow (sibling lanes)** | Sibling-lane chips inside a Guided Stop are focusable buttons (switch lane = focus only, never a mutation). | GuidedStopEditor lane context |
| **Previous / Next setup** | Finish Setup queue controls are ordinary focusable buttons reachable by Tab. | FinishSetupControls |
| **Global builder shortcuts** | Continue to work unless focus is inside a text input/textarea (unchanged from the Visual Builder). CS-7 adds no override of standard text-editing shortcuts. | shared |

### Focus management

- **Guided Stop** captures the element focused when it opened (the originating
  phrase/chip) and **returns focus to it** after Done, Cancel, or Escape — so
  keyboard and screen-reader users land back on the sentence they were editing,
  never the page root. An inspector handoff (`All settings`) deliberately does
  **not** restore (the drawer takes focus). Implemented in
  `useDocumentGuidedStop` (`originElementRef` → `restoreFocusRef`), tested in
  `guidedStop.test.tsx` ("Cancel/Escape returns focus to the originating chip").
- **DOC-CONFIG-SYNC-1** — revealing the matching field in the right configuration
  panel is a **display** action: it never moves keyboard focus out of the inline
  editor. The reveal is announced once, politely, and the field label stays
  visible (the ring is never the only signal). Details:
  [`dual-builder-document-config-sync.md`](./dual-builder-document-config-sync.md).
- **On mount** the Guided Stop editor focuses its own container (`tabIndex={-1}`,
  `role="group"`) so Escape works immediately and SR users land on the question.
- **No keyboard trap** in the map, Guided Stop, agent rail, or inspector — each
  overlay is closeable by Escape and by its visible close control, and focus
  leaves cleanly.

## Accessibility semantics

- **Not falsely modal.** The Guided Stop is an inline `role="group"` editor (the
  Document reflows around it) — it does **not** claim `role="dialog"`/`aria-modal`
  because it is not modal. The Whole Workflow map **is** a right-sheet overlay and
  correctly uses `role="dialog"` + `aria-label` + Escape.
- **Menus** use `aria-haspopup="menu"`, `aria-expanded`, `role="menu"` /
  `role="menuitem"`, and arrow-key traversal.
- **Buttons are real buttons.** Chips, insertion controls, toolbar, section
  controls, and map rows are `<button>` elements (never click-handling divs).
- **Status is never color-only.** Ready / needs-detail / missing / structural /
  locked states carry text or `data-*` equivalents in addition to colour (e.g.
  blank chips read the plain-language field label; the router editor shows the
  "Changing route labels may require reconnecting their paths." note; complex
  regions render a textual "This part is easier on the canvas" card).
- **Form controls keep labels/descriptions/errors** because the Guided Stop hosts
  the real `SchemaForm` field renderers (same metadata-driven labels/errors as the
  inspector) — no parallel control set.
- **Provider icons are decorative** (`aria-hidden` / empty alt) with the provider
  name carried by adjacent text, so they add no noise to the accessibility tree.
- **Reduced motion.** Every morph/scale/opacity transition on Document surfaces is
  paired with the Tailwind `motion-reduce:transition-none` (or
  `motion-reduce:animate-none`) guard, so `prefers-reduced-motion` disables the
  animation while preserving origin indication, focus movement, and all state and
  interaction behaviour. Correctness never depends on animation.

## Tests

- `guidedStop.test.tsx` — focus return on Cancel/Escape; inline editor semantics;
  Escape parity with Cancel.
- `insertMenuKeyboard.test.tsx` — menu roles, ArrowDown-opens, Arrow/Home/End
  navigation + wrap, Escape closes.
- `documentTelemetry.test.ts` — status/analytics safety (no content leaves the UI).
- Existing CS-1..CS-6 Document suites — map dialog semantics, chip buttons, Guided
  Stop role, lane-context navigation.

## Known limitations (before broader exposure)

- A full automated axe/RTL a11y-violation sweep across every rendered Document
  state is recommended but not yet added (would need a small dev-only test tool;
  not added in CS-7 without approval per the "no large new dependency" constraint).
  The manual + role/label/focus tests above cover the load-bearing surfaces.
- Roving-`tabindex` refinement of the menu (single tab-stop) is deferred; today
  each menu item is individually tabbable, which remains fully operable.
