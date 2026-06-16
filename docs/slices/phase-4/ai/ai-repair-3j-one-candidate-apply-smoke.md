# AI-REPAIR-3J — exact one-candidate Apply smoke

Goal: a reliable, intentionally-reproducible workflow shape where the deterministic
variable-reference repair surfaces the **Apply** button — to manually confirm the
3G→3H→3I→3D/3E path end-to-end without the LLM, credits, or model telemetry.

This is the **happy** counterpart to the zero/multiple-candidate "Needs attention +
Open field, no Apply" cases (AI-REPAIR-3I).

## The shape (simplest UI-reproducible)

| # | Node | Provider:type | Notes |
|---|------|---------------|-------|
| 1 | Manual Trigger | `native:manual.run` | exposes only `inputs` |
| 2 | Send Email | `gmail:send_email` | exposes outputs `id`, `threadId`, `to`, `subject`, `labelIds` |
| 3 | Send Channel Message | `slack:send_channel_message` | Message field (`text`) holds the broken ref |

Edges: Manual Trigger → Send Email → Send Channel Message.

- **Broken token (Slack Message field):** `{{deleted-step.subject}}`
- **Sole replacement candidate:** `{{<gmail node id>.subject}}`

Why exactly one candidate: `subject` is exposed by **only** the Gmail step among
Slack's upstream nodes (the Manual Trigger exposes `inputs`, not `subject`). The
Slack Message field key is `text` — not a recipient/secret/credential key — so the
`repairVariableReference` op is **applyable** (not safety-blocked).

`subject` is illustrative; `to` works identically (Gmail also outputs `to`, and the
apply-safety gate keys on the **target field** `text`, never on the referenced path).

## Reproduce in the UI

1. Build the three nodes above and connect them in order.
2. In the Slack **Message** field, type the literal token `{{deleted-step.subject}}`
   (a reference to a node id that isn't in the workflow). This mimics the production
   bug where a deleted step's reference is left behind in a config field.
3. Run **Check workflow**. It flags *"A step references a deleted or missing step."*
   with replacement reason **one** (one safe upstream replacement exists).
4. Run **Preview** (the deterministic, model-free repair). It produces an applyable
   patch: *"Repairs variable reference in field 'text' of 'Send Channel Message'."*
5. The **Apply** button appears.
6. **Apply** rewrites the Slack Message field to `{{<gmail node id>.subject}}` and
   saves the draft. The workflow is **not** run, activated, or otherwise mutated.

To see the **no-Apply** cases instead: point the token at a path no upstream node
exposes (`{{deleted-step.no_such_output}}` → zero candidates), or add a second
upstream Gmail step so two nodes expose `subject` (→ multiple candidates). Both
surface "Needs attention + Open field" with no Apply.

## Guarantees on this path

- **No LLM / no credits / no model telemetry.** The repair-preview route runs
  `runDeterministicRepairPreview` **before** the OpenAI-config check, the
  `aiCreditGate`, the model client, and the `ai_cost_events` recorders (AI-REPAIR-3H).
- **No bypass.** Candidate matching is the real `getAvailableVariablesForAI` +
  `buildVariableRepairOutcome`; the Apply artifact comes from the real
  `previewWorkflowPatchForAI` (validation + apply-safety), not a forced button.

## Automated coverage

`tests/unit/services/ai/repair/oneCandidateApplySmoke.integration.test.ts` — runs the
whole path against the **real** discovery registry, real candidate matching, and the
real preview/validate/apply-safety engine (only `getById` / `isMember` /
`ensurePersonalAccount` are mocked). Proves: one broken ref detected, exactly one
`subject` candidate (reason "one"), applyable preview with a typed
`repairVariableReference` op + base revision, and that zero/multiple candidates both
return null (no Apply).
