# React Agent — Live QA Matrix (Slice 4.AI-35)

**Date:** 2026-05-27
**Scope:** product-correctness + UX fixes from Marcus's live testing after AI-33 / AI-34C.
**Non-goals:** no OpenAI patch generation, no default-planner switch, no execution / activation-runtime-safety / provider-metadata / billing change. Planner stays Anthropic / Sonnet 4.6.

---

## Root product rule (this slice)

- **Apply** = create / update the **draft** workflow graph in the builder.
- **Activate** = the **readiness** gate (connections + complete config).
- A **disconnected integration** makes a node / workflow **not-ready**; it does NOT block applying the draft.

Required-input kinds and whether they block **Apply** (`isApplyBlockingRequiredInputKind`):

| Kind | Blocks Apply? | Why |
|---|---|---|
| `config_value` | **yes** | needed to form a correct draft (AI-20 floor) |
| `provider_choice` | **yes** | the node type is ambiguous until resolved |
| `choose_trigger` / `variable_reference` / `clarification` | **yes** | unresolved draft shape |
| `select_integration` | **no** | connect-a-provider is an *Activation* concern → not-ready draft node |

---

## Findings → fixes → status

| # | Live finding | Root cause | Fix | Status | Test |
|---|---|---|---|---|---|
| 1 | "When I get an email…" asks Gmail/Outlook but as STATIC text, not a control | ambiguity entry had no `nodeId/field` → bullet branch; and no `options` | `provider_choice` kind + `deriveProviderChoiceInputs` (category→options) + UI renders options-bearing entries as controls | ✅ | `deriveProviderChoiceInputs.test.ts`, `BuilderAiPanel.applyVsActivate.test.tsx` |
| 2 | Disconnected providers (Connect Stripe/Gmail/Outlook) block Apply | planner gate counted every required input incl. `select_integration` | `isApplyBlockingRequiredInputKind` — `select_integration` non-blocking; planner + UI gates filter to blocking kinds; non-blocking "connect before activating" note | ✅ | `planWorkflowFromPrompt.test.ts`, `BuilderAiPanel.applyVsActivate.test.tsx` |
| 3 | Existing Slack-DM edit ("send to a different person") follow-up didn't update the node | enrichment ignored `updateNodeConfig` (no patch addNode); follow-up closing said "Create the workflow…" (create-biased) | enrich resolves `updateNodeConfig` identity from the current canvas; edit-aware follow-up closing + provider-choice citation | ✅ (unit) — live edit flow is Marcus to verify | `enrichRequiredUserInputs.test.ts`, `composeFollowUpPrompt.test.ts` |
| 4 | Delete + plan "email→Slack" shows static list, not controls | same as #1 for the provider choice; channel/text are null-patch (no node to enrich) | provider-choice control renders; channel/text become controls once a patch exists (re-plan after provider chosen) | ✅ provider choice / ⚠️ channel+text deferred (see limitation) | covered by #1 tests |

---

## Known limitation (intentional, documented)

In a **fully-ambiguous turn** the model returns a **null patch** (no nodes). Non-provider-choice config questions (Slack channel, message text) reference no node identity yet, so they cannot be **field-enriched** (no `optionsSource` combobox, no node-scoped picker). **As of AI-35E** a bare `config_value` still renders an **interactive text control** (not a static bullet) — see below — so the user can answer the message text in-place; the **dynamic resource picker** (e.g. a Slack channel combobox) still only materializes on the **re-plan** once a patch exists to carry the field's `optionsSource` metadata. Closing the picker case fully would require the planner to draft the action node even when the trigger provider is ambiguous, which means changing the R1/R7 prompt discipline this slice is told not to weaken. Deferred.

---

## AI-35B — deterministic required-input completion (cost + edit fix)

After AI-35, every "Send details" re-ran the full Anthropic planner — wasteful, and the cause of the existing-Slack-DM-edit failure (the model re-plan failed → "AI assistant is unavailable"). AI-35B adds a deterministic completion path: when the staged answers map 1:1 to fields the planner already identified, the pending patch is completed + previewed **without a model call**.

| Submission | Resolution | Model call? |
|---|---|---|
| Pick a dropdown / type in a field control | (no submit yet — staged only) | no |
| Send details — only structured answers for known config fields | `completePlanWithRequiredInputs` → preview → apply-ready | **no** |
| Send details — existing-node edit (Slack DM recipient) | `updateNodeConfig` on the existing node → preview | **no** |
| Send details — **bare config_value text control** (no node identity) with a pending patch (AI-35F) | server infers the unique missing required text field → fills → preview | **no** |
| Send details — includes free text (possible new instruction) | model re-plan | yes |
| Send details — explicit shape-changing **correction** ("this is to a channel", "no, use Outlook") (AI-35I) | deterministic SKIPPED → model re-plan with override context (`intent_correction`) | yes |
| Send details — resolves a `provider_choice` (shape change) | model re-plan | yes |
| Send details — bare answer is ambiguous (≥2 fillable text fields) or has no patch | `NEEDS_REPLAN` (`ambiguous_target` / `no_target_node`) → model re-plan | yes (fallback) |
| Deterministic fill didn't preview-validate | `NEEDS_REPLAN` → model re-plan | yes (fallback) |

Dev visibility: with `ENABLE_AI_COST_DEBUG=true`, a deterministic completion logs `[ai-cost] … resolution=deterministic(config_values_applied)` (no model cost); a re-plan shows the normal `follow_up` planner cost line.

**Existing Slack DM edit (the AI-35 #3 fix), now resolved at the deterministic layer:** "change this to send the message to a different person" → the agent asks for the user id → `user123` → the server builds `updateNodeConfig` on the existing DM node (`userId: "user123"`), previews apply-ready, **no model call, no new node**. `userId` is a free-text field, so `user123` is accepted as typed (a non-Slack-id only fails at run time, per Apply-vs-Activate).

## AI-35E — required-input control parity

**Live regression:** "Send me a Slack DM when I manually run this workflow" → the agent says *"What should the Slack DM say?"* but **no input control appeared** — only a static bullet.

**Root cause:** the panel's control-vs-bullet gate (`isControlRenderable`) only treated an entry as a control when it had **node+field identity, static `options`, an `optionsSource`, or `kind === provider_choice`**. A **bare `config_value`** — which is exactly what a null-patch plan emits for an unspecified message body (no `nodeId`/`field`, no options) — failed all four checks and dropped to the bullet branch. The `RequiredInputControl` renderer itself already handled a bare entry (text fallback); the gate simply never routed it there.

**Product rule:** the React Agent chat renders the **same class of control the workflow builder config panel would render** for the underlying field. Static bullets are reserved for **non-field clarifications** that map to no known field/control.

**Fix (metadata-driven, NOT provider-specific):** a single shared resolver — [`resolveRequiredInputControl`](../../../features/workflow-builder/ai/resolveRequiredInputControl.ts) — maps one `requiredUserInput` entry to a control kind from the server-enriched FieldMeta hints (`options` / `optionsSource` / `fieldType` / `multiple`) + `kind`. Both the renderer (`RequiredInputControl`) and the gate (`isControlRenderable`) consume it, so they cannot drift. There are **no provider id branches** — Slack/Gmail/Outlook/Stripe/Sheets/Airtable/Trello/Notion/HubSpot/Microsoft/native all flow through the same metadata.

| Metadata | Control | Mirrors config-panel renderer |
|---|---|---|
| static `options`, single | `select` | SelectField |
| static `options`, `multiple` | `multiselect` (checkbox group) | SelectField + multiple |
| `optionsSource` | `combobox` (async picker) | ComboboxField |
| `fieldType: boolean` | checkbox/toggle | BooleanField |
| `fieldType: number` | number input | NumberField |
| `fieldType: textarea` | `<textarea>` | TextareaField |
| `fieldType: text` / `cron` / `string-array` / `file` / `keyvalue` / … | text input (safe fallback) | TextField |
| `provider_choice` | `select` (its own options) | — |
| **bare `config_value`** / field identity, no renderer hint | **text input** (known config field, renderer unknown) | TextField |
| `clarification` / `choose_trigger` / `variable_reference` with **no** field identity | **bullet** (not a control) | — |

**Date / datetime:** the `FieldType` vocabulary (`contracts/actionMeta.ts`) has **no `date`/`datetime` renderer**, so a date-shaped config field surfaces as `text`/`cron` today and resolves to the closest available control (a text input). When a dedicated date renderer lands in the contract, add a case to the resolver + a branch to `RequiredInputControl` — no provider code changes.

**Deterministic completion (AI-35B) interaction:** the completion route writes the staged answer **verbatim as a string** into the patch config. That is correct only for string-scalar renderers (`text` / `textarea` / `select` / `combobox` / `cron`). AI-35E adds a guard in `evaluateDeterministicCompletion` so `number` / `boolean` / array / object fields (and multi-select, already guarded) route to the **model planner**, which builds the correctly-typed config value. String-scalar and legacy/bare (`fieldType` absent) entries still complete deterministically — no model call.

## AI-35F — deterministic completion for rendered required text controls

**Live regression (after AI-35E):** "Send me a Slack DM when I manually run this workflow" → the agent asks *"What should the Slack direct message say?"*, AI-35E renders a text control, the user types "Hey" and hits **Send details** → the request hit `POST /ai/plan` (OpenAI follow-up, **502**) and the UI showed *"AI assistant is unavailable."* It should have hit `POST /ai/complete` (no model).

**Root cause.** AI-35E let a **bare `config_value`** (no `nodeId`/`field`) render as a control, but `evaluateDeterministicCompletion` rejected any blocking entry without `nodeId`/`field` (`unmapped_required_input`) → every bare-control answer fell to the model planner. The answer carried no field identity, so neither the client nor the server ever tried to map it to the pending patch's missing field.

**Fix (generic, metadata-driven — NOT Slack-specific).** A rendered required text control now completes deterministically when its answer maps to a unique missing config field:
- **Client** (`evaluateDeterministicCompletion`): a bare `config_value` answer is no longer rejected. When the plan carries a `proposedPatch`, the answer is forwarded **untargeted** (`{ value }`, no `nodeId`/`field`); with no patch to infer against it still re-plans (`no_target_node`).
- **Server** (`completePlanWithRequiredInputs`): for a bare answer it collects every **required `text`/`textarea` field** on the patch's pending `addNode`/`replaceTrigger` nodes whose value is still fillable (empty or an `{{AI_FIELD:…}}` placeholder), from `ActionMeta`/`TriggerMeta`/`FieldMeta` — no provider branches. It fills the field **only when exactly one candidate** uniquely matches; otherwise it returns `NEEDS_REPLAN`:
  - `ambiguous_target` — ≥2 fillable required text fields, or ≥2 bare answers (never guess the pairing).
  - `no_target_node` — no fillable required text field (and none was covered by a targeted answer).
- It still threads through `WorkflowPatchSchema` + the AI-5 preview + the apply-readiness gate, never auto-applies, and logs `requiredInputResolutionMode` = `deterministic(config_values_applied)` / `model_replan(ambiguous_target)` / `model_replan(no_target_node)` via the AI-35D `aiCostDebug` hook.

**Generic coverage.** The inference keys off FieldMeta `type ∈ {text, textarea}` + `required`, so it applies to any provider/native action with a unique missing required text field — Slack/Teams message text, email subject/body, HubSpot note text, Trello card title/description, HTTP request URL/body, native text/string config. Id/enum/select/combobox/number/boolean fields are NOT inferred from a bare text answer (they render their own controls with field identity via AI-33 derivation + AI-22/AI-35E, or route to the model).

**Targeted answers (AI-35B) unchanged.** An enriched entry with `nodeId`+`field` (e.g. the existing Slack-DM-recipient edit, or AI-33-derived empty fields) still completes via the explicit mapped path. Only entries that arrive *without* a target use the new inference.

## AI-35G — vertical layout + optionsSource control parity

Two live findings from "When I manually run this, send a Slack message saying Hello":

### A. AI-applied nodes rendered side-by-side

**Root cause.** The planner model gets NO positioning guidance, so its `addNode` positions are arbitrary (often same-`y` → side-by-side). The apply path persisted those positions verbatim — `applyPatchToDefinition` copies `node.position` as-is, and the builder re-hydrates the persisted definition after Apply.

**Fix.** New deterministic helper [`normalizeLinearWorkflowLayout`](../../../services/ai/apply/normalizeLinearLayout.ts), called in `applyWorkflowPatchForAI` before persist. For a **simple linear chain** it re-stacks nodes into the builder's vertical column (anchored on the head/trigger position; each node `VERTICAL_NODE_SPACING = 120`px below, all sharing the head's `x`). Conservative guards — leaves positions untouched when:
- the patch has no structural add (`addNode`/`replaceTrigger`) → a pure config edit never relayouts;
- the patch carries an explicit `moveNode` → respect the chosen position;
- the graph is NOT a simple linear chain (fan-out/fan-in, labeled branch/router edges, cycle, or disconnected/multi-head) → branch/router layouts preserved.

Result: AI-created trigger→action(→action) workflows read top-to-bottom; trigger `y` < action `y`; actions x-aligned with the trigger. The model is never trusted for positions.

### B. Channel required-input rendered as plain text instead of a combobox

**Root cause.** The Slack channel field IS a `combobox` + `optionsSource: "slack:channels"` (and `resolveRequiredInputControl` already maps that to a combobox), but the **required-input entry was BARE** — the model asked "Which Slack channel should receive the message?" with no `nodeId`/`field`, so `enrichRequiredUserInputs` had no field to attach the `optionsSource` metadata to → it fell to the bare-text fallback. Typing `channel1` then failed because a free-text label isn't a channel id.

**Fix (generic, metadata-driven — NOT Slack-specific).** New planner pass [`reconcileBareConfigValueEntries`](../../../services/ai/planner/enrichRequiredUserInputs.ts): when the pending patch has exactly ONE fillable required field (empty or `{{AI_FIELD:…}}`) not already targeted, and there's exactly ONE bare `config_value` question, it attaches that node/field identity to the bare entry. `enrichRequiredUserInputs` then attaches the field's FieldMeta — so an `optionsSource` field renders its combobox, a `select` field renders a select, a text field renders text. Applies to any provider/native field with `optionsSource` (Slack channel/user, Gmail label, Sheets/Airtable/Trello/Notion pickers). Ambiguous (≥2 fillable fields or ≥2 bare entries) or null-patch → left bare (documented limitation).

**Deterministic completion for picker fields.** `evaluateDeterministicCompletion` now requires the **selected option value (id)** for any picker-backed field (`options` or `optionsSource`) — it uses `answer.value`, never the free-text `answer.display`. A free-text-only answer for a picker → `model_replan(picker_requires_option)`, so a display label (e.g. `channel1`) is **never** written where an id is required. The completion route writes the id; the AI-35F bare-text server inference only ever targets `text`/`textarea` fields, so a picker field is never filled from a bare text answer.

## AI-35H — optionsSource reconciliation for follow-up plans

**Live regression (after AI-35G).** "Send me a Slack DM…" → agent asks for message text → user replies "This is to a channel" + "Hey" → the agent correctly switches to **send a Slack channel message** and asks "Which Slack channel should receive the message?" — but the channel renders as a **plain text box**, not the searchable channel combobox.

**Root cause.** The follow-up re-plan goes through the SAME orchestrator (`/ai/plan` → `planWorkflowFromPromptForAI`), so AI-35G's `reconcileBareConfigValueEntries` DID run. But it only matched bare `kind: "config_value"` questions — and the model emitted "Which Slack channel?" as a **`clarification`**. So the bare clarification was never reconciled to the patch's missing `channel` field → `enrichRequiredUserInputs` had no field identity to attach the `slack:channels` `optionsSource` to → plain-text fallback. (Investigation also confirmed: a patch whose `channel` is left *empty* already renders the combobox via `deriveMissingRequiredFieldInputs` + the preview returning `ok:true` with `canApplyLater:false`; the failure was specifically the **bare, non-`config_value`-kind** question.)

**Fix (generic, pipeline, not Slack-specific).** [`reconcileBareConfigValueEntries`](../../../services/ai/planner/enrichRequiredUserInputs.ts) now reconciles bare questions of kind `config_value` **OR `clarification`** (`RECONCILABLE_BARE_KINDS`) — a "which/what X?" question is a field-value question in practice — and normalizes the attached entry's kind to `config_value`. Still strictly guarded: fires only when there's exactly ONE bare reconcilable question AND exactly ONE fillable required field (empty / `{{AI_FIELD}}`) on the patch's `addNode`/`replaceTrigger` nodes, not already targeted. `provider_choice` / `select_integration` / `choose_trigger` / `variable_reference` are NOT reconciled (provider/trigger/wiring concerns, not a single missing field). Once attached, enrichment surfaces the field's FieldMeta so the channel renders its `slack:channels` combobox; works identically for any provider/native field with `optionsSource` (Gmail label, Sheets/Airtable/Trello/Notion pickers, …).

**Deterministic completion** (unchanged from AI-35G): a picker field (`options`/`optionsSource`) completes only from a **selected option value (id)**; a free-text-only answer → `picker_requires_option` re-plan, so a label is never written where an id is required.

**Remaining limitation (documented).** When the follow-up returns a **null patch** (no node to infer from) or the patch has **≥2 fillable required fields** for one bare question, the field identity cannot be safely inferred → the question renders as a text fallback and deterministic completion safely re-plans (never writes a label as an id). Closing the null-patch case would require the planner to always emit the action node; deferred to avoid a prompt-behavior change.

## AI-35I — follow-up intent-correction reconciliation

**Live regression (after AI-36).** "Send me a Slack DM when I manually run this workflow" → answer the message text → reply "This is to a channel" → the agent kept DM semantics ("Which Slack user should receive the DM?", then "Slack DMs require a userId, not a channel"). The explicit correction did NOT override the earlier inferred Slack-DM action — a **stale-intent** bug. (AI-35G/H fixed channel-field *rendering* but assumed the action had already switched; once AI-36 moved the planner to OpenAI, the action stopped switching.)

**Root cause.** (1) **Primary:** `composeFollowUpPrompt` closed with *"Produce the workflow patch for **the original request**…"* — the original "Slack DM" read as binding, the correction as a subordinate detail, and nothing said the latest message overrides prior intent. (2) **No correction signal:** the re-plan happened (free text already forces it) but the prompt gave the planner no reason to abandon the DM action; `priorFollowUpAnswers` reinforced it. The OpenAI planner reads the weak wording more literally than Sonnet did.

**Fix (generic, provider-agnostic).** New pure detector [`detectIntentCorrection`](../../../features/workflow-builder/ai/detectIntentCorrection.ts) flags override/contrast markers in the latest follow-up. [`useBuilderAi.submitFollowUp`](../../../features/workflow-builder/hooks/useBuilderAi.ts) skips deterministic completion on a correction (so a stale `proposedPatch` is never completed) and flags the re-plan; [`composeFollowUpPrompt`](../../../features/workflow-builder/ai/composeFollowUpPrompt.ts) makes the latest message **authoritative** (original request / questions / current plan / prior answers become CONTEXT ONLY) and adds a `Correction:` directive to REPLACE the obsolete provider/action/trigger and discard inputs that only applied to the replaced choice. Stale required inputs are replaced (not merged) because a re-plan fully replaces `planResult`.

**Decision rule.** Deterministic completion is for **direct field-filling only** (a plain "Hey" still completes with no model call). A **shape-changing correction forces a model re-plan** with explicit override context. Provider/action/trigger corrections are never resolved deterministically against the obsolete patch.

**No new boundaries crossed.** Planner stays OpenAI (AI-36); Anthropic not called; no execution / billing / provider-metadata / general-help change; no graph mutation before Apply.

## AI-35J — preserve compatible follow-up answers across corrections

**Live behavior after AI-35I.** "Send me a Slack DM…" → answer "hey" → "this is to a channel" → the agent correctly switched to a channel message but then **re-asked "What should the message say?"** instead of reusing "hey". A correction must replace obsolete shape WITHOUT throwing away compatible user-supplied details.

**Root cause.** The prior answer "hey" was NOT lost — it rides in `priorFollowUpAnswers` (the message turn re-planned with the recipient still outstanding, so the chain stayed open). The AI-35I `Correction:` directive + closing only told the planner to DISCARD inputs tied to the replaced choice and framed prior answers as "CONTEXT ONLY", with no PRESERVE instruction → the model rebuilt from scratch.

**Fix (prompt-only, generic, semantic).** [`composeFollowUpPrompt`](../../../features/workflow-builder/ai/composeFollowUpPrompt.ts) now instructs the planner to PRESERVE earlier user-provided values that still apply (message text/body/content, schedule times, filter terms) and NOT re-ask for a value already supplied when compatible, while still discarding values tied to the replaced field/action/provider. Destination details (recipient / channel) transfer **only when the destination type is unchanged** — so a DM user id is never reused as a channel id, nor a channel as a recipient. Generic across DM↔channel, Gmail↔Outlook, Slack↔email. No hook/state change (`priorFollowUpAnswers` already carries the labeled prior answers); no new structured semantic-kind summary (deferred unless live QA shows the prompt-only fix is insufficient).

**Compatibility rules.** message/body/text → transfers across communication actions; recipient/channel/destination → transfers only when destination type unchanged; provider-specific ids/settings → not across provider corrections; filters/search terms → if the trigger domain remains; schedules/dates → if the trigger stays schedule-based.

**Known limitation.** A prior answer that fully completed the plan deterministically (chain closed) is not carried into a later fresh-plan correction — deferred (would need persisted completed-answer state).

## AI-35K — combobox manual-entry fallback when optionsSource can't load

**Live issue.** The agent asked for a Slack channel (rendered as an `optionsSource` combobox). Slack wasn't connected, so options couldn't load and the UI showed a load error with no way to type a value — drafting was blocked purely because the picker couldn't fetch.

**Root cause.** [`RequiredInputOptionsSourceControl`](../../../features/workflow-builder/ai/RequiredInputOptionsSourceControl.tsx) only rendered the "Use '…' as-is" commit button when `input.allowFreeText` was true, so a picker with `allowFreeText:false` + a failed load discarded the typed text; and [`deterministicCompletion`](../../../features/workflow-builder/ai/deterministicCompletion.ts) bounced a display-only picker answer to the model (`picker_requires_option`).

**Fix (UI + client; no new unresolved-value architecture).** The commit affordance now also appears when the options load fails (`state.status` `disconnected`/`error`). A SELECTED option still submits its `value`/id; a typed manual value submits the typed `display` text. Deterministic completion uses `answer.value ?? answer.display` (selected id wins; typed value otherwise). The typed string is written to config and the AI-5 preview / activation validation decides acceptability (a preview-rejected value still re-plans). Generic for any `optionsSource` field, not Slack-specific.

**Apply vs Activate unchanged.** Provider disconnection still emits a non-apply-blocking `select_integration` that gates Activation — so the user can Apply a draft with a typed channel, but Activation stays blocked until the provider is connected. No runtime/execution change.

## Manual verification (Marcus — live dev server)

1. **Provider choice** — empty canvas, prompt "When I get an email send a Slack message" → a **select** with Gmail + Microsoft Outlook renders; Apply hidden; picking one + Send re-plans with "The email provider is Gmail."
2. **Disconnected apply** — "When a Stripe payment fails send me a Slack DM" with Stripe disconnected → preview shows; **Apply is enabled**; a "Connect Stripe before activating" note shows; after Apply the node/workflow is **not-ready** and **Activate is blocked** until Stripe is connected.
3. **Missing config still blocks** — a Slack message with no channel/text → Apply stays hidden until provided.
4. **Existing edit** — canvas has Manual Trigger → Slack DM; "change this to send to a different person" → asks recipient; answer `user123` → produces an **updateNodeConfig** on the existing DM node (no new node), apply-ready if recipient was the only gap.
5. **AI-35E regression** — "Send me a Slack DM when I manually run this workflow" → the *"What should the Slack DM say?"* question renders an **interactive text control** (a textarea when the plan carries the `text` field's `textarea` FieldMeta; a single-line text input for a bare null-patch question), **not** a static bullet. Typing an answer + Send completes the plan.
6. **AI-35F regression** — same prompt; type "Hey" into the rendered control and hit **Send details**. With `ENABLE_AI_COST_DEBUG=true`, the server console shows `[ai-cost] … event=ai_required_input_completed … resolution=deterministic(config_values_applied)` and the Network tab shows `POST /api/workflows/.../ai/complete` (**not** `/ai/plan`) — no OpenAI call, no "AI assistant is unavailable". The plan becomes apply-ready with the message filled in.
7. **AI-35G layout** — "When I manually run this, send a Slack message saying Hello" → Apply → the canvas shows the **Manual Trigger on top and the Slack action below it** (vertical, x-aligned, edge routing downward), not side-by-side. Adding a second action stacks it further down. Editing a node's config does not relayout the graph.
8. **AI-35G channel picker** — "send a Slack channel message" (channel unspecified) → the agent's "Which Slack channel should receive the message?" renders a **searchable channel combobox** (same picker as the config panel), not a plain text box. Picking a channel + Send details completes deterministically (writes the channel **id**). Typing a name without picking → re-plans (never writes the label as the id).
9. **AI-35H follow-up correction** — "Send me a Slack DM when I manually run this workflow" → answer the message text → reply "This is to a channel" → the agent switches to Send Channel Message and asks "Which Slack channel should receive the message?" → that follow-up question renders the **searchable channel combobox** (even when the model phrased it as a clarification), not a plain text box. Picking a channel completes with the channel id.
10. **AI-35I intent override** — same prompt → answer the message text "Hey" → reply "This is to a channel" → the action **switches from Send DM to Send Channel Message**; the agent NO LONGER asks "Which Slack user should receive the DM?" / "Slack DMs require a userId" — it asks for a channel and reuses "Hey". Then test other corrections: "No, use Outlook" (provider switch), "Actually send an email instead" (action switch), "make it manual" (trigger switch) — each replaces the prior inferred shape rather than re-asking the obsolete action's inputs. A plain answer ("Hey", "#general") is NOT treated as a correction and still completes deterministically (no model call).
11. **AI-35J preserve compatible value** — "Send me a Slack DM when I manually run this workflow" → answer "hey" → reply "this is to a channel" → the agent switches to Send Channel Message and asks ONLY for the channel; it does **NOT** re-ask "What should the message say?" — "hey" is reused. The previously-asked Slack **user id** is dropped (not reused as a channel). Repeat for Gmail→Outlook (downstream message text preserved) and Slack→email (message body preserved, Slack channel/user dropped).
12. **AI-35K combobox manual fallback** — ask for a Slack channel with Slack **disconnected** → the channel combobox shows a load error/hint but the input stays editable; type `#general` → a "Use '#general' as-is" action appears → click it → the value is staged. Send details → completes WITHOUT a model call (`POST /ai/complete`, the channel written as the typed text). Apply creates the draft; Activate stays blocked ("Connect Slack before activating"). If options DO load, picking an option still submits its id. Repeat with a non-Slack picker (e.g. a Gmail label) to confirm it's generic.
