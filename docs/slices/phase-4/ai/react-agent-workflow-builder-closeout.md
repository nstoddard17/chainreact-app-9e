# React Agent — Conversational Workflow-Builder / Edit-Preview Arc — Closeout

**Type:** Closeout / handoff. **Docs-only — no source, test, migration, schema, UI, or behavior
change in this slice. Nothing pushed.**
**Date:** 2026-06-26
**Branch:** `v2-main` (local-only; the arc is unpushed)
**Marker:** REACT-AGENT-WORKFLOW-BUILDER-CLOSEOUT-1

Closes out the arc that turned the builder's left rail into a calm, chat-style React Agent surface
that proposes **workflow previews**, auto-shows them on the canvas as a **diff graph**, and lets the
user conversationally edit a workflow — while keeping the structured workflow-patch payload entirely
separate from the visible chat, and keeping save / run / activate as separate, explicit, controlled
actions. Marcus manually confirmed the full flow works (see §E).

Related prior closeouts: the homepage→anonymous-builder live-skeleton arc is
[`../workflows/homepage-anonymous-builder-live-skeleton-closeout.md`](../workflows/homepage-anonymous-builder-live-skeleton-closeout.md);
the React Agent governance arc is [`./react-agent-governance-closeout.md`](./react-agent-governance-closeout.md);
the architecture framing is [`./react-agent-hermes-architecture.md`](./react-agent-hermes-architecture.md).

---

## A. Executive summary

A user describes what they want to automate in plain language. The React Agent proposes a workflow
(new build) or a workflow **edit** (change an existing draft). A valid proposal **auto-shows on the
canvas** — there is no manual "send to canvas" step. The user keeps editing conversationally ("change
the Slack step to a Gmail send email", "change it back to Slack"); each change renders on the canvas
as a **diff preview** (unchanged / added / removed / changed). The user then **explicitly** chooses
**Apply preview** or **Discard preview** from the top preview bar. Applying replaces the local draft
with the proposed graph; it does **not** save, run, or activate anything — those remain separate,
user-controlled steps. The left rail is conversation/help only.

## B. Final product behavior

- **Homepage / anonymous start flow.** A homepage prompt hands off into a local builder; an anonymous
  visitor gets a free, deterministic skeleton preview that auto-shows on the canvas (no paid AI / no
  provider / no DB), and the draft + prompt are restored into a real workflow after sign-up.
- **Authenticated React Agent flow.** In the builder, the left rail is the single AI entry point. It
  calls only the ChainReact account route (`/api/accounts/[id]/ai/workflow-guidance`) via the client
  helper — never a model vendor / gateway token directly from the browser.
- **Valid proposal auto-shows.** When a turn carries a valid, meaningful plan + preview, the canvas
  shows it automatically. A same-shape restatement is intentionally **not** auto-shown (it would ghost
  duplicate nodes over the existing graph) and stays in the rail as text.
- **No manual "Show on canvas".** The button was removed entirely — auto-show owns canvas display.
- **Rail conversation model.** The intro/help copy is the first React message inside the scrollable
  transcript (it scrolls away like any message); there is no static "Build with me" header.
- **User bubbles.** User messages render in a distinct right-offset rounded bubble; React replies are
  left-aligned text with an accent "React:" speaker label (ChainReact sky-blue theme tokens).
- **Structured workflow-patch handling.** The model's structured edit payload (operations / candidate
  graph) is consumed by the route + services and never rendered in the rail. The visible reply is the
  plain-language summary only.
- **Visible diff graph.** An edit renders as ONE composed graph with per-node `diffStatus`:
  unchanged = normal, added = green, removed = red/removing, **changed = orange only for a
  same-provider:type config edit**. A provider/type (capability) swap reads as the old node **removed**
  + the new node **added**, never a single orange "changed" card.
- **Apply / Discard.** The top preview bar is the only primary preview action surface. Apply commits
  the candidate to the local draft (dirty via the normal mechanism); Discard restores the current draft
  unchanged.
- **Setup / required fields.** Surfaced on the canvas node ("Needs setup"), the right config panel, and
  the guided-setup card/footer — not as orphaned chat text.
- **Invalid / clarification.** An invalid or unsupported proposal renders a safe, actionable message
  (no preview, no button); a clarification-only turn renders the question.

## C. Architecture summary

- **Visible text vs structured payload are separate.** The rail shows only the assistant summary; the
  structured edit (operations / candidate definition) flows through the route + services.
- **Editable-graph contract with safe opaque refs.** The model is handed an editable graph with opaque
  refs (no raw system ids); the server resolves refs → real ids and rejects unknown/stale/real-id refs
  ([`services/ai-guidance/mutation/`](../../../../services/ai-guidance/mutation/), editable-graph builder
  + `resolveEditableGraphRefs` + `runWorkflowEditFromModel`).
- **Workflow patch validation.** Operations are materialized (fresh system ids for new nodes) then
  atomically applied + catalog/structure-validated to produce the exact candidate end-state
  ([`materializeAiPatchNodeIds`](../../../../services/ai/patch/materializeAiPatchNodeIds.ts),
  [`validateWorkflowPatch`](../../../../services/workflows/patch/), `proposeWorkflowMutation`). Missing
  ordinary config is non-blocking ("needs setup"); only catalog/structural/unknown-ref failures block.
- **Preview generation + diff rendering.** The candidate → display `DraftPreview`; the canvas composes
  current draft + candidate into a single diff-tagged graph via
  [`buildPreviewDiffGraph`](../../../../features/workflow-builder/utils/buildPreviewDiffGraph.ts) (capability
  swaps re-keyed so a reused id reads as removed + added; non-overlapping positions).
- **Apply / Discard.** Apply replaces the local draft with the candidate via the graph slice; Discard
  clears the overlay. Both are local-draft only.
- **No model JSON in the UI.** Defensive fenced-JSON stripping + a route-owned edit message ensure raw
  model JSON / operation blocks never render in the rail.

## D. Safety boundaries

- **No auto-save, no auto-run, no auto-activate.** Auto-show and Apply are display / local-draft only.
- **No provider connect / OAuth and no provider option-source calls from preview.** Preview generation
  is pure + model-free + I/O-free over the user's own draft.
- **No leakage in the rail:** no secrets, credential ids, raw provider payloads, node ids, edge ids,
  `editVersion`, operation JSON, or `provider:type` keys. Field names in any setup hint are humanized.
- **Model proposes; ChainReact validates; user applies.** The model never writes; the deterministic
  validator owns the candidate; the user owns Apply/Discard/save/run/activate.

## E. Manual testing confirmed by Marcus

Marcus manually exercised the flow and confirmed it works (his words: works perfectly now):

- Changed a Slack **Send Channel Message** action to a **Gmail Send Email** — preview auto-showed.
- Changed it **back to Slack** — preview auto-showed.
- Diff preview looked correct: Manual Run unchanged, Slack removing (red), Gmail added (green).
- Rail cleanup looked correct: intro as first message, user bubbles, no static header.
- No "Show on canvas" button.
- No false "couldn't show that preview" message.
- No orphaned "Still needs" line.
- No raw / internal data (ids, refs, JSON, provider:type) in the chat.

> Note: this is Marcus's local manual smoke. A production smoke after deploy is still recommended (§F).

## F. Known caveats / future follow-ups

- **Editing breadth is catalog-bounded.** Edits only succeed for catalog-supported actions/triggers;
  unsupported requests are surfaced as a safe message, not faked.
- **Branch/route label semantics are not fully modeled.** Labeled-edge / route-membership validation is
  still best-effort (a suspicious-branch-label warning exists but route membership is deferred).
- **Anonymous AI limiting is best-effort.** The `/start` anonymous AI planning limit relies on a signed
  cookie and fails closed when it can't be signed; there is no durable KV/Redis backing yet.
- **Large-rewrite UX.** For a big multi-node rewrite, a Before / After / Diff toggle may later improve
  legibility; today it's a single diff graph.
- **Auto-show "failure" UI was removed, not hidden.** There is no reliable explicit canvas render-failure
  signal today, so the rail shows no failure line; if a real signal is added later, a calm one-line
  message could be re-introduced on that signal.
- **`features/workflow-builder/WorkflowBuilder.tsx` is over the soft `max-lines` ESLint warning** (504 /
  490) — a pre-existing warning (this arc reduced it); non-blocking.
- **Production smoke still needed after deploy** (the arc is unpushed; see §H checklist).
- **Shared-worktree hygiene.** This arc's commits were made in a shared worktree alongside an active
  parallel session (smoke-actions / microsoft-onenote work). Confirm only this arc's commits are
  included before any push.

## G. Completed commit chain (real `git log`, chronological)

Anonymous / start builder + live-skeleton foundation:

- `2e2dd8b70` — anonymous homepage prompt → local builder handoff (ANON-BUILDER-1) _(2026-06-23)_
- `668766cd4` — restore anonymous draft + prompt into a real workflow after sign-up (ANON-BUILDER-2) _(2026-06-23)_
- `e72827d1e` — harden anonymous draft restoration (ANON-BUILDER-3) _(2026-06-23)_
- `663ae0178` — React Agent live skeleton preview while chatting (REACT-LIVE-SKELETON-1) _(2026-06-23)_
- `812b48293` — limited anonymous AI planning on /start (REACT-LIVE-SKELETON-3) _(2026-06-23)_
- `a7a9797eb` — fail closed when the anonymous AI limit cookie can't be signed in prod (REACT-LIVE-SKELETON-3) _(2026-06-23)_
- `319612f96` — honest, actionable live skeleton when a plan fails validation (REACT-LIVE-SKELETON-4) _(2026-06-24)_
- `3ecb5319f` — hide redundant rail "Show on canvas" for the preview already on the canvas (HERMES-AGENT-PREVIEW-SHOWN-DEDUP) _(2026-06-24)_

Conversational mutation / editable-graph editor:

- `c151476d8` — preview + apply workflow MUTATIONS during conversation, not just prose (HERMES-AGENT-MUTATION-PREVIEW) _(2026-06-25)_
- `a4054cbd5` — general catalog-validated workflow-edit proposals, replacing the narrow Slack↔email mutation (HERMES-AGENT-WORKFLOW-EDITOR) _(2026-06-25)_
- `a005f0a27` — live model-driven conversational editing via a safe editable-graph contract (HERMES-AGENT-WORKFLOW-EDITOR-LIVE) _(2026-06-26)_
- `a3334ff2c` — stop raw-JSON / contradictory mutation replies in the rail; route owns the edit message (HERMES-AGENT-WORKFLOW-EDITOR) _(2026-06-26)_
- `995777caa` — restore official-template-matching wiring dropped by the prior stale-baseline commit _(2026-06-26)_

Diff-aware preview + rail cleanup:

- `4aec6e906` — render workflow-edit previews as ONE diff-aware graph, not a stacked overlay (HERMES-AGENT-PREVIEW-DIFF-GRAPH) _(2026-06-26)_
- `044e4cf30` — drop redundant rail "Proposed change" card for edit previews (HERMES-AGENT-RAIL-EDIT-PREVIEW-NO-CARD) _(2026-06-26)_
- `2e3b346c3` — classify provider/type swaps as remove+add in the preview diff, not a single "changed" card (HERMES-AGENT-PREVIEW-DIFF-GRAPH) _(2026-06-26)_
- `bc1afaf87` — chat-style rail: scrollable intro message + user bubbles + accent speaker labels (HERMES-AGENT-RAIL-CHAT-POLISH) _(2026-06-26)_
- `cc3aeceed` — remove "Show on canvas" entirely — auto-show owns the canvas (HERMES-AGENT-RAIL-NO-MANUAL-CANVAS-PUSH) _(2026-06-26)_
- `be882b0ae` — calm the edit-preview rail — drop the noisy auto-show error + orphaned "Still needs" (HERMES-AGENT-RAIL-CALM) _(2026-06-26)_

(An intermediate `HERMES-AGENT-RAIL-EDIT-PREVIEW-CLEANUP` step — drop node-id leak + redundant Show-on-canvas
— also shipped between `bc1afaf87` and `cc3aeceed`; the net behavior is captured by the commits above.)

## H. Post-deploy manual smoke checklist

Run after deploy (React Agent rail requires `HERMES_AGENT_ENABLED=true` + a resolved account; see §I):

1. Homepage prompt → `/start` hands off into the builder.
2. Anonymous: a skeleton preview auto-shows on the canvas.
3. Sign up → the anonymous draft + prompt restore into a real workflow.
4. Authenticated: type a builder prompt in the rail.
5. React Agent creates a preview that auto-shows on the canvas.
6. Edit "change the Slack step to a Gmail send email" → Slack removing / Gmail added diff.
7. Edit "change it back to Slack" → Gmail removing / Slack added diff.
8. Apply preview → draft updates; Discard preview → draft restored.
9. Configure required fields (canvas node / config panel / setup card).
10. Save the workflow.
11. Test / manual run.
12. Run history + error display render correctly.
13. Activate (only when valid).
14. Confirm the rail shows no "Show on canvas", no false preview-failure line, no orphaned "Still needs",
    and no raw ids / refs / JSON / provider:type anywhere.

## I. Verification baseline (run THIS session, 2026-06-26)

All commands run now on `v2-main` at the arc HEAD (`be882b0ae`) and observed green:

- `npm run typecheck` → **pass** (exit 0).
- `npm run lint:structure` → **pass** (every leaf folder ≤ 50 files).
- `eslint` on the arc's source files
  (`WorkflowGuidancePanel.tsx`, `GuidanceSuggestionSections.tsx`, `SingleShotGuidancePanel.tsx`,
  `BuilderGuidanceRail.tsx`, `buildPreviewDiffGraph.ts`, `proposeWorkflowMutation.ts`) → **0 problems**.
  (Separately, `WorkflowBuilder.tsx` carries a pre-existing non-blocking `max-lines` warning — §F.)
- Targeted Jest (per file, all **pass**):
  - `tests/unit/features/workflows/WorkflowGuidancePanel.test.tsx` — 54/54
  - `tests/unit/features/workflows/guidancePreviewEdit.test.tsx` — 4/4
  - `tests/unit/features/workflows/workflowGuidanceUiSafety.test.ts` — 8/8
  - `tests/unit/features/workflow-builder/panels/BuilderGuidanceRail.test.tsx` — 13/13
  - `tests/unit/features/workflow-builder/panels/BuilderPreviewSetupCard.test.tsx` — 13/13
  - `tests/unit/features/workflow-builder/utils/buildPreviewDiffGraph.test.ts` — 11/11
  - `tests/unit/features/workflow-builder/canvas/WorkflowNodeCard.diff.test.tsx` — 5/5
  - `tests/unit/features/workflow-builder/AnonymousAgentRail.test.tsx` — 7/7
  - `tests/unit/services/ai-guidance/proposeWorkflowMutation.test.ts` — 13/13
  - `tests/unit/services/ai-guidance/workflowEditorPipeline.test.ts` — 17/17
  - `tests/integration/features/workflow-builder/hermes-guidance/builder-apply-preview.test.tsx` — 28/28
  - `tests/integration/features/workflow-builder/hermes-guidance/builder-preview-overlay.test.tsx` — 5/5
  - `tests/integration/features/workflow-builder/anon-live-skeleton.test.tsx` — 3/3

**Not run this session:** the full Jest tree, `npm run build`, and `npm run lint` (full) — only the
targeted arc suites above were run. **No migrations** were added by this arc (nothing to `db:push`).

**Feature flag:** the builder React Agent rail is server-gated by `isHermesAgentEnabled()`
(`HERMES_AGENT_ENABLED`, **default OFF**); when off (or no account resolved) the rail renders a safe
"unavailable" note. Enabling it in production is a separate, deliberate step.

## J. Recommended next tracks

- Production enablement of `HERMES_AGENT_ENABLED` + a real post-deploy smoke (§H).
- Durable anonymous-AI rate limiting (KV/Redis) to replace the best-effort signed-cookie limit.
- Branch/route-label membership validation for edits that touch labeled edges.
- Before / After / Diff toggle for large multi-node rewrites.

## K. Closeout confirmation

Docs-only. Nothing pushed. Doc: `docs/slices/phase-4/ai/react-agent-workflow-builder-closeout.md`.
