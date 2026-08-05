# React Agent — capability truth and conversation-turn integrity

**Slice:** REACT-AGENT-TRUTH-AND-TURN-INTEGRITY-AUDIT-1 (2026-08-04)

## The incident this rule set comes from

On a blank canvas the user asked *"when I get an email I want to be notified in slack"*, was
asked "Gmail or Microsoft Outlook?", answered *"gmail"* — and React replied that ChainReact could
not watch Gmail because it had no trigger for that source. `gmail:new_email` (a registered polling
trigger) had been in the discovery registry the whole time. The requested two-node workflow only
appeared later, as the apparent answer to an unrelated prompt.

Root causes (both proven by focused reproduction, `tests/unit/app/api/accounts/ai-workflow-guidance-owner-sequence.test.ts`):

1. **Capability truth** — the false claim was MODEL prose. No application code equates
   `webhookTrigger: false` with "no triggers" (every capability surface is derived from the
   discovery registry and includes polling triggers); but the preview-first classifier judged only
   the current turn's text, so the one-word clarification answer "gmail" (one named provider) let
   a plan-less reply pass with no repair and no comparison against the registry.
2. **Turn integrity** — the server holds no cross-turn proposal state; the late workflow was the
   later turn's own model output, re-derived from conversation history. Separately, the client's
   auto-show effect lived inside the guidance panel, so a proposal arriving while the panel was
   unmounted (collapsed Document workspace) was flushed onto the canvas only when the user's next
   message remounted the panel.

## Invariants (enforced in code; tests pin each)

**Capability truth**

- **Registered node metadata is authoritative for buildability.** The discovery registry
  (`services/discovery/_registry`) is the single source; every model-facing catalog, validator,
  fallback planner and guard derives from it. No hand-maintained capability list may be added.
- **Polling triggers count as supported triggers.** Webhook capability is never a synonym for
  trigger capability. The Stage-A compact catalog renders each trigger's activation
  (`[trigger, polling]`) and the prompt states explicitly that polling triggers watch the source
  automatically (`buildGatewayGuidancePrompt.ts`).
- **The model cannot override deterministic capability facts.**
  - A **plan-expected** turn never surfaces a plan-less reply: structured repair → deterministic
    registry fallback → typed `PREVIEW_PLAN_MISSING` failure (`enforcePreviewFirst.ts`). The
    model's withholding prose (including a false "unsupported" claim) is never shown.
  - On the remaining surface (clarification-allowed turns), the **capability-contradiction guard**
    (`services/ai-guidance/previewFirst/capabilityContradiction.ts`) replaces a sentence that
    denies a registered capability of a provider the USER named with honest registry-derived copy.
    It is deliberately narrow: the sentence must name the provider (an unattributed "can't watch
    that" is routinely true), and only user-named, registered providers are in scope.
- **Preview-first classification is conversation-aware** (`classifyPreviewFirst`): named providers
  are the union across the user's OWN turns, so a clarification answer ("gmail") is judged
  together with the request that gave it meaning ("…notified in slack") and is plan-expected. An
  either/or counts only while unanswered. Assistant turns never count as the user naming a
  provider — this also holds for the provider-selection guard's context (the route passes
  user-role turns only).
- **A plan is not discarded over a formatting slip (REACT-AGENT-LIVE-BROWSER-CERTIFICATION-RUN-1).**
  Live browser certification caught the model writing the full capability id into a step's `type`
  field (`{provider:"gmail", type:"gmail:new_email"}` → validated as `gmail:gmail:new_email`).
  `validateWorkflowPlan` correctly rejected it and the whole plan was thrown away, leaving a blank
  canvas on the turn the user had just answered a clarification. Three rules now apply:
  - `normalizePlanCapabilityKeys` strips a redundant `"<provider>:"` prefix before validation. It
    rewrites a key **only** when the original is unregistered AND the stripped key IS registered
    (role-respecting), so a valid plan is never altered and no capability is ever invented or
    substituted. Fail-closed behavior for genuinely unknown capabilities is unchanged.
  - The repair call must correct the ACTUAL failure. When the previous reply's plan failed capability
    validation, the repair names the rejected ids and asks for the same shape with catalog-exact ids
    — it must NOT claim the model "withheld the plan" (that instruction made the model re-emit the
    same invalid id, and the turn died in `PREVIEW_PLAN_MISSING`).
  - `invalidCapabilityKeys` / `normalizedCapabilityKeys` (public `provider:type` ids only) are
    carried in diagnostics and logged, so this failure class names the offending id in production.

**Turn integrity**

- **Every guidance response belongs to one request.** The workflow-guidance route is synchronous
  and stateless per turn: a proposal is returned only in its own turn's HTTP response; the server
  never buffers a proposal across turns.
- **A proposal renders during the turn that produced it.** Auto-show is hosted by
  `WorkflowBuilder` (`useAutoShowLatestProposal`), which is mounted for the whole builder session
  — never inside a panel whose mount state can defer it. A later user message must never be what
  flushes an earlier turn's proposal onto the canvas.
- **A handled turn stays handled.** A proposal skipped as not-meaningful is marked handled and can
  never pop onto the canvas later when the graph shape drifts. Restored (persisted-history) turns
  never auto-show.
- **Stale responses mutate nothing.** `useGuidanceConversation` records the latest authoritative
  request id at dispatch; a response (success or error) whose id has been superseded is dropped
  with a safe id-only diagnostic (`stale_response_dropped`) and cannot update chat, preview, or
  the loading flag owned by the newer request.
- **The composer never silently loses a message.** The Document composer refuses submission while
  a request is in flight (text stays in the box) instead of clearing text the conversation would
  then drop.
- **Check Workflow evaluates the live local draft** (pending nodes/edges) deterministically; an
  unapplied preview is not part of that draft, so an empty-canvas review of an empty draft is
  correct, not a defect.

## Observability

- `[workflow-guidance] capability_contradiction requestId=… provider=… handling=…` — a model
  reply denied a registered capability and was repaired (enum + registry id only).
- `[workflow-guidance] preview_first …` / `plan_stage …` / `latency …` — existing per-turn
  decision lines (classification, repair, fallback, plan stage).
- `[guidance-conversation] stale_response_dropped requestId=…` (client) — a superseded response
  was rejected. None of these lines ever carry goal text, model text, values, or identity.

## Known intentional behavior

- Conversation history is the only cross-turn memory. If a clarification goes unanswered and the
  user later asks something related, the model may legitimately use the visible history — the
  prompt instructs it that the latest user message is the request to answer now.
- The structured `providerClarification` payload (options with `providerId`/`isConnected`) is
  returned by the route but not yet rendered as chips client-side; the question text reaches the
  user via `guidanceText`. Rendering the options is an open follow-up.
