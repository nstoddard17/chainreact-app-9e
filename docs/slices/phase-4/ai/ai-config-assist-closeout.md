# AI-CONFIG-ASSIST — arc closeout (CS-0 → CS-11)

**Status:** shipped + deployed to production. Latest production `origin/v2-main` at
write time: `363e38fbc` (CS-1→CS-10). CS-11 (this doc + the secret-key helper
cleanup) is a local commit on `v2-main`, not yet pushed.

This is the "fill a missing field by chatting" arc: turn the read-only **Check
workflow** diagnosis into actionable issue cards, let the user open + fill a missing
required field directly from the React Agent composer, and commit that field locally
— without ever touching the server save, run, Apply, or graph structure.

## Commit chain

| Slice | Commit | What landed |
|-------|--------|-------------|
| CS-0 | `f9638a4a2` | Plan doc (`ai-config-assist-chat-fill-plan.md`) |
| CS-1 | `498f60554` | Pure chat-fill **eligibility + value validation** (`chatFillEligibility.ts`) |
| CS-2 | `f315a9f07` | Inert local **pending-fill action** (`chatFillAction.ts` — `applyChatFillToDraft`) |
| CS-2A | `db950e521` | Shared secret-key classifier `core/security/secretKeys.isSecretLikeKey` (de-dup chat-fill vs redactor) |
| CS-3 | `1db875e85` | Chat-fill affordance + (then) confirmation UI |
| CS-3B | `7255ff371` | Removed the chat-fill feature flag — live by default |
| CS-4 | `255be77b3` | Direct Open-field action + closer canvas focus/zoom (`useCanvasNodeFocus` 1.2→1.75) |
| CS-5 | `6aaec3128` | Actionable **Open-field on the Check card** (single missing field) |
| CS-6 | `55d7bae3b` | Composer **discoverability hint + field placeholder** (eligibility-gated) |
| CS-7 | `521393514` | **Exit** field-fill mode via Escape / "Ask something else" |
| CS-8 | `77f268b3c` | **Multi-issue** Check cards — one Open-field action per missing field across nodes |
| CS-9 | `6193b1567` | **Direct fill on Send** — no Confirm/Cancel proposal bubble |
| CS-10 | `bdd4bdaca` | Direct fill **commits the node config locally** (config-rail Save path) |
| CS-11 | (this commit) | Secret-key helper cleanup (`sanitizeAgentMessage` → shared classifier) + this closeout |

## Product behavior shipped

- **Check workflow** produces actionable issue cards. For missing required fields it
  renders a **"Needs your input"** group with one **"Open `<field>` field"** action per
  `(node, empty required field)` across every affected node — no Suggest/Preview first.
- Clicking an action **selects the node, zooms/pans the canvas to it, opens the config
  rail, and highlights the field** (the shared `revealNode` / `useCanvasNodeFocus` seam).
- While an eligible field is highlighted, the composer shows a **hint** (`Type the
  missing "Message" below…`) and a field-specific **placeholder** (`Type Message value…`).
- Typing a value and pressing **Send fills the field immediately** and **commits the
  node config locally** (so the user need not click the config-rail Save). An after-fill
  **summary** shows previous → new value + **"Workflow not saved yet"**.
- **Escape** or **"Ask something else"** exits field-fill mode back to normal AI chat,
  preserving the already-committed value.

## Safety boundaries (held across the whole arc)

- **No Apply.** There is no apply/persisted-patch control anywhere in this arc.
- **No workflow server save.** `graphSlice.save` is never called automatically.
- **No run.** No execution is triggered.
- **No graph-structure mutation.** No add/remove of nodes or edges; only the target
  node's config object is replaced via the local-commit path.
- **No WorkflowPatch / no server NL parser.** Value extraction is the deterministic,
  client-side `extractChatFillValue` (quoted span wins; imperative-without-quotes is
  ambiguous → safe guidance).
- **Eligibility gating (CS-1).** Secret-shaped, recipient/destination, destructive, and
  confirmation-required fields are **blocked from chat-fill**. Open-field navigation may
  still highlight an ineligible field, but the hint is not shown and a typed value is
  refused with safe guidance — and a blocked/secret value is **never echoed** into chat.
- **Labels only.** No raw node ids, field keys, `provider:type`, or schema text is ever
  rendered; copy uses display labels.

## Write tiers (the important distinction)

1. **Config draft fill** — `configSlice.updateField` (via CS-2 `applyChatFillToDraft`).
   The in-progress rail draft only; identical to a manual keystroke.
2. **Node config local commit** — `commitNodeConfigDraft(nodeId)` =
   `graphSlice.updateNodeConfig` + `configSlice.markSaved`. Writes the draft into the
   **canvas-pending** node and flips the **workflow's `graphSlice.isDirty`** → the
   toolbar Save is still required. This is **exactly** what the config-rail Save button
   does (CS-10 refactored `ConfigModalShell.handleSave` to share this one helper).
3. **Toolbar / main workflow Save** — `graphSlice.save` (server persistence). **NEVER
   triggered by this arc.** The workflow stays unsaved until the user clicks it.

## What Check workflow does deterministically (no LLM)

- The diagnosis itself (`diagnoseWorkflowForAgent` → readiness + connection + run report)
  is deterministic: missing-required-field, connection/setup, structural, and run findings.
- Open-field target resolution (`missingFieldNodeIds`, `useRepairFieldTargets`) is
  deterministic client-side metadata resolution — no model call.
- Chat-fill value extraction, eligibility, validation, draft fill, and local commit are
  all deterministic.

## What still uses the LLM

- **Explain with AI** — plain-language explanation of the diagnosis.
- **Suggest a fix** — repair proposal (recommended changes / affected steps / risk).
- **Preview fix** — validated patch preview, used when an actual automatic model patch
  is worth inspecting before anything changes (proposal card; AI-REPAIR-2 path).
- **Plan / chat** — the general builder React Agent planning flow.

These remain on the proposal/preview path and are **not** required for the missing
user-input field flow.

## Future work (explicitly deferred)

- **Richer multi-issue grouping** — beyond "Needs your input", structured "Needs setup"
  and "Can be previewed" groups on the Check card (today setup/structural/run findings
  stay in the deterministic `nextSteps` guidance).
- **Setup / reconnect action cards** — inline reconnect affordances for
  disconnected / token-expired / missing-account findings.
- **AI-REPAIR-3** — executable **Apply** / persisted-patch flow (still not started; the
  whole arc deliberately has no Apply).
- **Optional server / NL parsing** — only if a future need outgrows the deterministic
  client-side `extractChatFillValue`.

## Verification baseline (CS-11)

Measured for the CS-11 cleanup commit (not inherited):

- `tests/unit/services/ai/builderAgent/sanitizeAgentMessage.test.ts`,
  `tests/unit/core/security/secretKeys.test.ts`, `tests/unit/services/ai/tools/redact.test.ts`,
  `tests/unit/repositories/builderAgentThreads.test.ts` — **pass**.
- The builder-AI + repair suites that exercise the shipped arc remained green through
  CS-10 (full `tests/unit/features/workflow-builder` group at CS-10 push: 116 suites /
  1633 tests). CS-11 changes no runtime behavior of that arc.
- `npx tsc --noEmit`, `npm run lint`, `npm run lint:structure` — see the CS-11 slice
  report. No `db:push`, no migration, no env/flag change.

## Key files (reference)

- Eligibility/value: `features/workflow-builder/ai/chatFillEligibility.ts`,
  `features/workflow-builder/ai/extractChatFillValue.ts`
- Fill action: `features/workflow-builder/ai/chatFillAction.ts`,
  `features/workflow-builder/panels/useChatFill.ts`
- Local commit: `features/workflow-builder/state/commitConfigDraft.ts`
- Targets/cards: `features/workflow-builder/ai/firstMissingFieldNodeId.ts`,
  `features/workflow-builder/ai/useRepairFieldTarget.ts`,
  `features/workflow-builder/panels/_BuilderAiPanelRepairGoTo.tsx`
- Composer/diagnosis UI: `features/workflow-builder/panels/_BuilderAiPanelComposer.tsx`,
  `_BuilderAiPanelDiagnosis.tsx`, `_BuilderAiPanelChatFill.tsx`,
  `features/workflow-builder/hooks/useCanvasNodeFocus.ts`
- Shared secret-key classifier: `core/security/secretKeys.ts` (used by
  `chatFillEligibility`, `services/ai/tools/redact.ts`, and — CS-11 —
  `services/ai/builderAgent/sanitizeAgentMessage.ts`)
