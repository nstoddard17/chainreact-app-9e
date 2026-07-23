# Dual Builder CS-7B — Visual Fidelity & Acceptance Record

**Slice:** 5.DUAL-BUILDER-1 CS-7B. **Base:** `0424a6cae` (CS-7).
**Branch:** `dual-builder-cs7b-visual-acceptance`. **Flag:** `ENABLE_DOCUMENT_BUILDER`
default **OFF**. **Design source:** claude.ai/design *ChainV2Builder*
(`3c6250cb-…`), read this session via the design MCP — the warm-paper Document mock
(`ChainV2 Builder - Document + Guided Stops.html`) is the vocabulary source of truth.

Governing rule unchanged: **two editors, one workflow — not two workflow types.** No
new workflow schema, store, AI route, save path, entitlement, engine behaviour,
loops, or autosave were added.

## What changed (visual system)

A scoped **warm "paper" Document surface** was introduced without a disconnected
design system: `[data-document-surface]` (set on the Document root) **remaps the
existing `--builder-*` tokens** to the mock's palette (paper `#f6f3ec`, card
`#fffdf8`, clay `#b0532b`, olive `#4b7a4e`, amber `#b8801f`, blue `#3f6d8c`) so the
whole CS-1..CS-7 Document picks up the warm vocabulary automatically, while the app
shell (header, rails, canvas) keeps the neutral builder palette. Serif prose
(Newsreader intent, Georgia fallback — no network font added) is applied to the
workflow title and step sentences.

The signature Document visuals were moved from scattered inline `var()` styles into
scoped CSS classes in `app/globals.css` (`.crv2-chip*`, `.crv2-provider`,
`.crv2-banner*`, `.crv2-fork*`, `.crv2-lane-label--{yes,no,route,always}`,
`.crv2-section*`, `.crv2-btn-*`, `.crv2-composer`, `.crv2-terminal`). This both
tightens the design system and lets the components render faithfully in a headless
harness (jsdom strips `var()`-valued inline styles on serialization).

Per required state, implemented + screenshot-verified:

- **Empty** — serif "What should this workflow do?", eyebrow + composer, primary
  "Draft it with React" (clay) + secondary "Start with a trigger", "or" divider,
  "AI is the fastest start — never the only one."
- **Linear** — eyebrow "WORKFLOW" + serif title, serif sentences, provider chips,
  **clay value chips**, **amber-dashed blank chips**, gradient **setup banner** with
  the clay sparkle mark + solid "Finish setup [N left]" + "Whole workflow", Ask
  React bar anchored at the bottom.
- **Guided Stop** — the clicked phrase highlights (clay), the editor emerges
  directly below it, distant content gently recedes (dim), Cancel/All settings/Done
  footer; focus returns to the phrase (CS-7).
- **Branch** — a **compact framed fork block** ("IT SPLITS · condition" header,
  **olive "IF YES" / blue "OTHERWISE"** lane labels, styled chips, dashed "THEN THE
  PATHS COME BACK TOGETHER" rejoin) — read in a second, never a node canvas.
- **Sections** — a **light** named container (collapse toggle, subtle grouping,
  "Move step out") — document organization, not a dashboard card.
- **Whole Workflow map** — a right-anchored sheet (header + ×, trigger + steps with
  textual "Needs a detail"/"ready" status — not colour-only), document still
  readable behind it.
- **Narrow width (430px)** — banner reflows, chips wrap, no horizontal overflow, no
  clipped buttons; the Guided Stop is full-column-width in place, retaining origin.

## Screenshots (local, uncommitted)

Captured from a real headless Chromium render of the actual components (harness:
`tests/tools/documentScreens.harness.test.tsx` → `owner-review/shoot.mjs`), read
back and iterated on this session. Stored under **`owner-review/png/`**
(gitignored): `01-empty`, `02-linear`, `03-guided-stop`, `04-branch`,
`05-sections`, `06-insertion-menu`, `07-finish-setup`, `08-map`,
`10-narrow-linear`, `11-narrow-guided-stop`. Regenerate with:
`npx jest --testMatch="**/tests/tools/documentScreens.harness.test.tsx"` →
`npx tailwindcss -c tailwind.config.ts -i app/globals.css -o owner-review/_compiled.css`
→ `node owner-review/shoot.mjs`.

Harness limitation (honest): jsdom serialization drops `var()`-valued *inline*
styles, so any component still using inline `var()` styling (the Guided Stop
container, insertion menu popover, ghost preview, warning rows) renders slightly
flatter in the harness than in the real browser. The signature surfaces above were
converted to classes specifically so the screenshots are faithful; the remaining
inline-styled surfaces are correct in the real app.

## Live browser journey — BLOCKED (not beta-ready on this axis)

The authenticated Playwright journey (`tests/e2e/dual-builder-document-journey.spec.ts`,
from CS-7) is valid and discoverable (`--list` shows both the flag-off and full
journey), but **cannot execute here**: the worktree has no `.env.local`, so the dev
webServer crashes on every request with *"Your project's URL and Key are required to
create a Supabase client!"*, and the e2e harness additionally requires a
`SUPABASE_SERVICE_ROLE_KEY` to create/delete test users. Pointing it at the main
tree's production Supabase is unsafe (destructive user/run writes against live prod)
and forbidden. **Status: blocked by missing local test infrastructure.** Per the
CS-7B contract, a blocked browser journey means the feature is **not yet beta-ready**
until run against a dedicated local/test database.

## Verification (this slice)

- `tsc --noEmit` — **clean** (fixed 2 *pre-existing* CS-7 type errors: an
  `@jest/globals` `expect` + jest-dom mismatch in `insertMenuKeyboard.test.tsx`, and
  a `b.tier` access on the complex block in `DocumentView.tsx` telemetry — the
  latter also fixed a latent bug that always reported tier "b").
- `lint:structure`, `lint:migrations` — OK. eslint (touched files) — 0/0.
- Document folder — **32 suites / 351 tests green** (incl. new `projectionPerf` (4)
  and `documentA11y` (5)).
- Broad workflow-builder regression — 2240 pass; **2 pre-existing failures**
  (`WorkflowCanvas` action-bar tabs, `NodeInspectorPanel` delete-dialog) verified
  identical at `0424a6cae` with CS-7B changes absent.

## Remaining visible gaps vs. the mocks

- Ghost/agent preview, insertion-menu popover, and lane-warning rows still use inline
  `var()` styling (correct in-app, flatter in harness) — a follow-up class conversion
  would make them screenshot-faithful too.
- Provider chips are neutral boxes (the mock tints them per provider) — acceptable,
  consistent.
- Step-to-step vertical rhythm is generous; a tighter insertion-affordance footprint
  is a possible refinement.
- True phone-width (<400px) is not separately certified beyond the 430px pass.
