# 4.AI-CONFIG-ASSIST-0 — Chat-fill missing field Plan

**Type:** Planning / design only. **No source, migrations, tests, UI, or behavior
changes in this slice. Nothing pushed.**
**Date:** 2026-06-14
**Branch:** `v2-main`

**Source of truth (verified current state — files read for this plan):**
[features/workflow-builder/state/configSlice.ts](../../../../features/workflow-builder/state/configSlice.ts) (per-node pending config drafts + `openNode` / `revealNode` / `updateField` / `markSaved` / focus state) ·
[features/workflow-builder/state/graphSlice.ts](../../../../features/workflow-builder/state/graphSlice.ts) (saved vs pending nodes/edges, `updateNodeConfig`, `save`, dirty state) ·
[features/workflow-builder/config-modal/ConfigModalShell.tsx](../../../../features/workflow-builder/config-modal/ConfigModalShell.tsx) (rail Save = local `updateNodeConfig` + `markSaved`; "Modal Save does NOT call the workflow API") ·
[features/workflow-builder/config-modal/SchemaForm.tsx](../../../../features/workflow-builder/config-modal/SchemaForm.tsx) (controlled field form; `highlightFieldName` + per-field wrapper from 2F) ·
[features/workflow-builder/panels/_BuilderAiPanelRepairGoTo.tsx](../../../../features/workflow-builder/panels/_BuilderAiPanelRepairGoTo.tsx) (2F "Go to field" affordance → `revealNode`) ·
[features/workflow-builder/panels/useBuilderDiagnosisActions.ts](../../../../features/workflow-builder/panels/useBuilderDiagnosisActions.ts) (Check / Suggest / Preview chat actions) ·
[lib/api/ai/diagnostics.ts](../../../../lib/api/ai/diagnostics.ts) (`RepairPreviewIssue` incl. 2F `nodeLabel`/`fieldLabel`/`nodeId`/`path`) ·
[services/ai/preview/previewWorkflowPatch.ts](../../../../services/ai/preview/previewWorkflowPatch.ts) (label resolution + secret-key scrub) ·
[services/workflows/patch/types.ts](../../../../services/workflows/patch/types.ts) (`PatchValidationError`, `PatchOperation` incl. `updateNodeConfig`) ·
[contracts/actionMeta.ts](../../../../contracts/actionMeta.ts) (`FieldMeta`, `FieldType`, `ActionMeta.isDestructive`/`requiresConfirmation`/`riskLevel`) ·
[services/ai/tools/redact.ts](../../../../services/ai/tools/redact.ts) (`isSecretKey` secret-shaped key detection) ·
[core/integrations/credentialSharing.ts](../../../../core/integrations/credentialSharing.ts) (provider `personal`/`account` classification).

---

## 1. Context

AI-REPAIR-2F shipped (`dd1ec377c`) the **Go-to-field** affordance: a blocked repair
preview offers "Open Message field", and clicking it selects the node, opens the config
rail, pans the canvas, and highlights the field — **navigation only, no value written**.
The user still types the value by hand.

This doc plans the *next* idea: let the user type the missing value **in the React Agent
chat** ("put 'hello from ChainReact' in the message field") and have ChainReact place it
into the correct **pending** builder field. It is the natural follow-on to 2F's targeting
metadata, and it deliberately stops short of save/apply.

Parent arc: AI-REPAIR preview chain — [ai-repair-2 plan](./ai-repair-2-validated-patch-preview-plan.md) /
[closeout](./ai-repair-2-validated-patch-preview-closeout.md). This planning slice implements nothing.

---

## 2. Current codebase findings (verified)

- **Pending config edits are already a first-class, in-memory, unsaved layer.**
  `configSlice` holds per-node `drafts[nodeId]` with `values` / `initialValues` /
  `isDirty` / `errors`. `updateField({ nodeId?, name, value })` patches one field's draft
  value and recomputes `isDirty` ([configSlice.ts](../../../../features/workflow-builder/state/configSlice.ts) `updateField`). This is **purely local** — no API call, no graph write.
- **Local draft ≠ saved workflow.** The config rail's **Save** button calls
  `graphSlice.updateNodeConfig(...)` then `configSlice.markSaved()`
  ([ConfigModalShell.tsx](../../../../features/workflow-builder/config-modal/ConfigModalShell.tsx) `handleSave`).
  Its own doc comment states: *"Modal Save does NOT call the workflow API — that's still
  the toolbar Save path's job."* So there are **three** distinct write tiers:
  (a) `configSlice` draft (in-rail, unsaved), (b) `graphSlice` pending (canvas-committed,
  still unsaved to server), (c) `graphSlice.save()` (server persist).
- **2F already gives us the targeting seam.** `configSlice.revealNode({ nodeId,
  initialValues, fieldKey })` selects the node, opens the rail, sets `focusFieldKey`, and
  bumps the canvas-focus signal — *without changing a value* (draft mirrors
  `initialValues`, `isDirty` stays false). A chat-fill would reuse this exact entry point
  and then additionally call `updateField`.
- **The preview already carries safe targeting metadata.** `RepairPreviewIssue` exposes
  `nodeId` + `path` (opaque targets) and `nodeLabel` + `fieldLabel` (display)
  ([lib/api/ai/diagnostics.ts](../../../../lib/api/ai/diagnostics.ts)), resolved server-side in
  [previewWorkflowPatch.ts](../../../../services/ai/preview/previewWorkflowPatch.ts). Chat-fill needs no new targeting data for the missing-field case.
- **Field metadata classifies renderer type but NOT "recipient-visible".**
  `FieldType` is `text | textarea | select | combobox | number | boolean | file | cron |
  router-routes | string-array | file-array | keyvalue`
  ([contracts/actionMeta.ts](../../../../contracts/actionMeta.ts)). There is **no** existing per-field flag for
  "this value is sent to a recipient" or "this is a destination". Risk lives at the
  **action** level: `ActionMeta.isDestructive` / `requiresConfirmation` / `riskLevel`
  (same file). **This is a gap** chat-fill must close with a new field-eligibility
  classifier (see §4).
- **Secret-shaped keys are already detectable.** `isSecretKey(key)`
  ([services/ai/tools/redact.ts](../../../../services/ai/tools/redact.ts)) flags `token`/`secret`/`password`/etc.
  patterns; the preview already scrubs them. Chat-fill reuses it to hard-block secrets.
- **Provider credential class is centrally decided.** `credentialSharing.ts` classifies
  providers `personal`/`account`. Not directly a field classifier, but relevant: secrets
  and credentials are never builder-typed config; they flow through OAuth, so chat-fill
  never needs to touch them.
- **The patch layer can express a field edit deterministically.** `PatchOperation`
  includes `updateNodeConfig { nodeId, config }`
  ([services/workflows/patch/types.ts](../../../../services/workflows/patch/types.ts)), and the AI-3 validator validates one.
  This matters for §11 (whether chat-fill should ride the WorkflowPatch rails).
- **Chat actions are isolated, client-only, typed-API hooks.** `useBuilderDiagnosisActions`
  calls `lib/api/ai` clients and `appendMessage` — it imports no `@/services/**`. Any
  chat-fill UI must keep that boundary.

---

## 3. Product / model decision

**What chat-fill IS:** a convenience that converts an *explicit user-typed value* into a
**pending** `configSlice` draft edit on the **already-targeted** field, with a confirm
step and a visible before/after. The user typed the content; ChainReact only places it.

**What chat-fill is NOT (this arc):**
- NOT save. NOT run. NOT a `graphSlice.save()` call. NOT `graphSlice.updateNodeConfig`
  (that commits to the canvas-pending layer — see §2; v1 stays in the rail draft only).
- NOT graph-structure mutation (no add/remove node/edge).
- NOT AI *generating* recipient-visible content from thin air — it places what the user
  typed, not what the model invents (§5).
- NOT touching secrets/credentials/OAuth (§4).
- NOT Apply (AI-REPAIR-3).

Anchors: V2 account-scoped model is unaffected (pending drafts are client state, not
account data). Credential-sharing policy is unaffected (chat-fill never writes
credentials). No model ever receives a secret.

---

## 4. Field eligibility (the core safety classifier)

There is no existing field-risk flag (§2), so v1 needs a small, explicit **field-fill
eligibility** classifier. Proposed tiers:

| Tier | Examples | v1 policy |
|---|---|---|
| **Safe free-text** | `text`/`textarea` body fields not flagged below (Slack `text`, summary/notes) | **Allowed** — fill pending after confirm |
| **Secrets / credentials** | any key where `isSecretKey(key)` is true; password/token/apiKey | **Hard-blocked** — never fillable, never shown |
| **Recipient / destination** | Gmail/Outlook `to`/`cc`/`bcc`, Calendar `attendees`, Slack `channel`, webhook URLs | **Blocked in v1** (requires explicit per-target confirm — defer) |
| **Enum / structured** | `select`/`combobox`/`boolean`/`number`/`cron`/`router-routes`/`keyvalue`/`file*`/`string-array` | **Blocked in v1** — only `text`/`textarea` string fills ship first |
| **Destructive-behavior fields** | fields on actions where `ActionMeta.isDestructive` or `requiresConfirmation` | **Blocked in v1** |
| **Hidden / internal** | fields not in the node's `FieldMeta[]`, or non-string-typed | **Blocked** (no such target) |

**v1 = exactly one allowed shape:** a `text`/`textarea`, non-secret, non-recipient,
non-destructive field that the preview already flagged as the missing target. Everything
else is blocked with safe guidance. This is intentionally narrow; widening is a later
slice once the recipient/destination confirm UX exists.

The classifier is a **pure function** over `FieldMeta` + `ActionMeta` + `isSecretKey` —
no new server data, no model involvement. Recommendation: add an explicit
`isChatFillEligible(field, actionMeta): { ok: true } | { ok: false; reason }` helper
(client-safe, in `features/workflow-builder/...` or `core/`), so the rule is one
testable place.

---

## 5. Preventing dangerous fills

- **User intent, not model invention.** v1 fills only the *literal value the user typed*.
  The assistant does not author recipient-visible content. If parsing is used to extract
  the value from a sentence (§9), the extracted substring must be shown verbatim in the
  confirm step so the user sees exactly what will be placed.
- **Secrets:** `isSecretKey` → hard block, value never echoed, never sent to a model.
- **Recipients/destinations:** blocked in v1 (§4). When later allowed, require an explicit
  per-field "change the recipient/channel to X?" confirm distinct from the generic fill
  confirm.
- **Destructive-behavior fields:** blocked in v1 via `ActionMeta.isDestructive` /
  `requiresConfirmation`.
- **Stale / mismatched target:** the fill must match the *currently highlighted* issue and
  the node must still exist in the current draft (§10). A stale proposal is rejected.
- **No silent change:** every fill shows before/after and leaves an unsaved indicator
  (§7); nothing persists without the user's separate Save.

---

## 6. Recommended UX flow

1. Blocked preview: *"Required field 'Message' is missing on 'Send Channel Message.'"*
   with the 2F **"Open Message field"** button.
2. User clicks it → 2F selects the node, opens the rail, pans, highlights `Message`.
3. User types in chat: *"send hello from ChainReact"* / *"put 'hello…' in the message field"*.
4. Assistant renders a **pending-fill proposal** chat bubble:
   *"Put this in **Message** on **Send Channel Message**?"* + the exact value (quoted) +
   **Confirm** / **Cancel**. (Labels only; no raw `text`/node id.)
5. On **Confirm** → `configSlice.updateField({ nodeId, name: fieldKey, value })`. The rail
   shows the value, the field stays highlighted, **"Unsaved changes"** shows.
6. Assistant posts an **after-fill summary** (§7) and the next step: *"Review and click
   **Save**, or run **Check workflow** again."* No auto-save, no auto-run.

Recommendation: **always confirm** in v1 (even though the user typed the value), because
the chat→field mapping (which field, which node) is the AI's inference and deserves a
human check. Confirmation is cheap and trust-positive.

---

## 7. After-fill change visibility (no silent changes)

The after-fill bubble MUST show:
- **Field changed:** the `fieldLabel` ("Message") + node `nodeLabel` ("Send Channel
  Message"). Never the raw key/id.
- **Previous value:** the prior draft value (or "(empty)"), shown safely (truncated; never
  for secret fields — those can't reach here).
- **New value:** the placed value, verbatim.
- **State:** "Not saved yet."
- **Next step:** Save / Check workflow again.

This mirrors the existing no-leak, label-only rendering contract used by the preview card.

---

## 8. Code to reuse

| Need | Reuse |
|---|---|
| Select node + open rail + pan + highlight | `configSlice.revealNode` (2F) |
| Write the pending value | `configSlice.updateField` (existing) — **no new write path** |
| Targeting (node/field + labels) | `RepairPreviewIssue.{nodeId,path,nodeLabel,fieldLabel}` (2F) |
| Field meta (type, label) | node lookup in `graphSlice.pendingNodes` + provider/native meta hooks already used by `ConfigModalShell` |
| Secret detection | `isSecretKey` (redact.ts) |
| Action risk | `ActionMeta.isDestructive`/`requiresConfirmation` |
| Chat surface | `useBuilderDiagnosisActions` + `appendMessage` pattern (client-only) |
| Dirty/unsaved indicator | `configSlice` `isDirty` + existing rail footer |

**No new persistence, patch-apply, or server write path is needed for v1.**

---

## 9. Server involvement

**Recommendation: v1 is client-only after the user explicitly provides the value.**
The user typed the literal value; the field target already came from the (server-built)
preview. So the fill itself needs no server round-trip: a client helper validates
eligibility (§4) + value (§10) and calls `updateField`.

**Optional later:** a server **parse** step to extract the value from a natural-language
sentence ("put 'X' in the message field" → `X`) and disambiguate which field, if the
client-side heuristic proves too weak. If added, it MUST: send the model **no secrets**;
return only `{ fieldKey?, extractedValue }` validated against the known target; keep all
service/repository imports server-side (the chat hook stays on `lib/api/ai`). Default
position: try a minimal client-side extraction first; add the server parser only if the UX
demands it.

---

## 10. Validation before filling

A fill is applied only if ALL hold:
- The target **field exists** on the node's `FieldMeta[]` (by `name`).
- The field is **chat-fill eligible** (§4) — `text`/`textarea`, non-secret, non-recipient,
  non-destructive.
- The field **schema accepts a string** (renderer type is `text`/`textarea`).
- The **value passes field-level validation** (length / required-non-empty; reuse the
  rail's existing per-field soft validation).
- The **node still exists** in `graphSlice.pendingNodes` (not stale/deleted).
- The **proposal is not stale**: the fill target matches the *currently highlighted*
  issue (`configSlice.focusFieldKey` + `activeNodeId`) so an old chat bubble can't fill a
  field the user has moved past.

Any failure → no write; safe guidance ("That field can't be auto-filled — open it and
edit directly"), button-free, never throws.

---

## 11. Relation to WorkflowPatch

**Recommendation: v1 is a local pending-config edit only — NOT a WorkflowPatch.**

Rationale: a `updateNodeConfig` WorkflowPatch is the right shape for **apply/save** (it's
validated + materialized server-side and is AI-REPAIR-3's job). But chat-fill v1
deliberately stops at the *unsaved rail draft*, exactly where the user already lands after
2F + manual typing. Routing it through WorkflowPatch would prematurely couple it to the
apply pipeline and imply persistence. Keep v1 as `configSlice.updateField` (the same
write a keystroke makes). **When/if chat-fill later integrates with Save**, that work
belongs with AI-REPAIR-3 and would emit a real `updateNodeConfig` patch through the
existing preview→apply rails.

---

## 12. Tests required (for the implementation slices)

- Chat-fill populates the pending `Message` field after explicit user text (`updateField`
  called with the typed value).
- Does **not** call `graphSlice.save` / `updateNodeConfig` (no canvas-commit, no persist).
- Does **not** run anything; does **not** mutate graph structure (nodes/edges unchanged).
- Marks the draft **dirty/unsaved**.
- Shows before/after (prev value, new value, "not saved").
- **Secrets/credentials blocked** (`isSecretKey` field → no fill, no echo).
- **Recipient/destination + destructive fields blocked** in v1 (no fill without explicit
  confirm path, which v1 doesn't ship).
- **Stale target rejected** (node gone, or fill target ≠ currently highlighted issue).
- No raw node ids / field keys rendered (labels only).
- No `@/services/**` or `@/repositories/**` import in the client chat-fill module.
- Eligibility classifier unit tests cover every tier in §4.

---

## 13. Recommended implementation slice breakdown

- **CS-0 — this planning doc.** (done by this slice)
- **CS-1 — eligibility classifier + value validation** (`isChatFillEligible` pure helper +
  tests). No UI. Behind no flag (pure, inert until used).
- **CS-2 — local pending-fill action.** A thin client action (reuse `revealNode` +
  `updateField`) that applies a validated fill and exposes before/after data. Tests assert
  no save/run/graph mutation. Flag `ENABLE_AI_CHAT_FILL` (default OFF).
- **CS-3 — chat affordance + confirm + after-fill summary** in the AI panel
  (`useBuilderDiagnosisActions` + a proposal bubble). Labels only; confirm required.
- **CS-4 — (optional) server parse/validation** for NL value extraction, only if CS-3's
  client heuristic is insufficient. No secrets to model.
- **CS-5 — (separate, gated, later) Save/apply integration** — folds into AI-REPAIR-3 via
  a real `updateNodeConfig` WorkflowPatch. NOT part of AI-CONFIG-ASSIST v1.

**Product boundary recommendation:** ship as a **separate `AI-CONFIG-ASSIST` arc**, not
AI-REPAIR-3. AI-REPAIR-3 = "apply a validated *patch* (save/persist)". AI-CONFIG-ASSIST =
"fill *pending* config fields from chat (no save)". They have different blast radius
(persist vs unsaved), different confirmation needs, and different reuse (apply rails vs
`configSlice.updateField`). Keeping them separate keeps each small and lets chat-fill ship
behind its own flag without waiting on the apply pipeline.

---

## 14. Risks / open questions (each with a recommendation)

- **NL value extraction reliability.** "send hello" vs "put 'hello' in message" — which
  substring? *Rec:* require the value in quotes OR treat the whole message as the value
  when a field is actively highlighted; show it verbatim in confirm; add CS-4 server parse
  only if needed.
- **Field-risk metadata gap.** No per-field "recipient-visible" flag exists. *Rec:* v1
  whitelists only safe `text`/`textarea` and blocks the rest; add an explicit field flag
  (or a curated key denylist: `to`/`cc`/`bcc`/`channel`/`url`/…) when widening.
- **Multiple missing fields.** Which one does the typed value target? *Rec:* v1 fills only
  the *currently highlighted* field (`focusFieldKey`); if none highlighted, ask the user to
  open the field first (reuses 2F).
- **Confirm fatigue.** *Rec:* keep the single confirm in v1; revisit only with telemetry.
- **Draft vs canvas-pending.** Should the fill also commit to `graphSlice` pending? *Rec:*
  no — v1 stays in the rail draft (`configSlice`), exactly like manual typing; the user
  commits via the rail Save as today.

---

## 15. Acceptance criteria

**This planning slice:** doc exists at this path, grounded in the cited files, no source /
test / migration / UI changed, docs-only local commit, nothing pushed.

**The implementation must later meet:** v1 fills only eligible pending fields from explicit
user input, with confirm + before/after, no save/run/graph mutation, secrets &
recipients/destructive fields blocked, stale targets rejected, labels-only rendering, no
service/repository import in client, all behind `ENABLE_AI_CHAT_FILL` (default OFF).

---

## 16. Hard boundaries (what this slice did NOT change)

Docs only. No source, tests, migrations, schema, UI, or behavior changes. No
`db:push`, no env/flag changes, no Apply, no save/run, no graph mutation, no Hermes, no
MCP, no AI-REPAIR-3 work. Nothing pushed.

---

## 17. Recommended next step

Pick up **CS-1 — `isChatFillEligible` classifier + value validation** (pure, fully
testable, inert until wired) as the first implementation slice — but only on Marcus's
explicit approval to start AI-CONFIG-ASSIST. Until then, no chat-fill code lands.
