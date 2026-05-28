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

In a **fully-ambiguous turn** the model returns a **null patch** (no nodes). Non-provider-choice config questions (Slack channel, message text) reference node ids that don't exist yet, so they can't be enriched into controls and render as bullets — they become interactive controls on the **re-plan** after the user resolves the provider choice (or any time the model proposes a patch). Closing this fully would require the planner to draft the action node even when the trigger provider is ambiguous, which means changing the R1/R7 prompt discipline this slice is told not to weaken. Deferred.

---

## AI-35B — deterministic required-input completion (cost + edit fix)

After AI-35, every "Send details" re-ran the full Anthropic planner — wasteful, and the cause of the existing-Slack-DM-edit failure (the model re-plan failed → "AI assistant is unavailable"). AI-35B adds a deterministic completion path: when the staged answers map 1:1 to fields the planner already identified, the pending patch is completed + previewed **without a model call**.

| Submission | Resolution | Model call? |
|---|---|---|
| Pick a dropdown / type in a field control | (no submit yet — staged only) | no |
| Send details — only structured answers for known config fields | `completePlanWithRequiredInputs` → preview → apply-ready | **no** |
| Send details — existing-node edit (Slack DM recipient) | `updateNodeConfig` on the existing node → preview | **no** |
| Send details — includes free text (possible new instruction) | model re-plan | yes |
| Send details — resolves a `provider_choice` (shape change) | model re-plan | yes |
| Deterministic fill didn't preview-validate | `NEEDS_REPLAN` → model re-plan | yes (fallback) |

Dev visibility: with `ENABLE_AI_COST_DEBUG=true`, a deterministic completion logs `[ai-cost] … resolution=deterministic(config_values_applied)` (no model cost); a re-plan shows the normal `follow_up` planner cost line.

**Existing Slack DM edit (the AI-35 #3 fix), now resolved at the deterministic layer:** "change this to send the message to a different person" → the agent asks for the user id → `user123` → the server builds `updateNodeConfig` on the existing DM node (`userId: "user123"`), previews apply-ready, **no model call, no new node**. `userId` is a free-text field, so `user123` is accepted as typed (a non-Slack-id only fails at run time, per Apply-vs-Activate).

## Manual verification (Marcus — live dev server)

1. **Provider choice** — empty canvas, prompt "When I get an email send a Slack message" → a **select** with Gmail + Microsoft Outlook renders; Apply hidden; picking one + Send re-plans with "The email provider is Gmail."
2. **Disconnected apply** — "When a Stripe payment fails send me a Slack DM" with Stripe disconnected → preview shows; **Apply is enabled**; a "Connect Stripe before activating" note shows; after Apply the node/workflow is **not-ready** and **Activate is blocked** until Stripe is connected.
3. **Missing config still blocks** — a Slack message with no channel/text → Apply stays hidden until provided.
4. **Existing edit** — canvas has Manual Trigger → Slack DM; "change this to send to a different person" → asks recipient; answer `user123` → produces an **updateNodeConfig** on the existing DM node (no new node), apply-ready if recipient was the only gap.
