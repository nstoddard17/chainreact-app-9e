# AI Agent Enhancement Roadmap

This document captures the staged rollout plan for the richer AI Agent experience—human-in-the-loop approvals, chat-based review, deeper context, and fully autonomous execution. Use it as the north star when we revisit this body of work.

---

## Stage 0 · Foundations in Place

- **Persist agent controls**  
  Extend the AI Agent config schema (UI + backend) with new fields, leaving the runtime untouched for now:
  - `agentMode`: `"human_review" | "hybrid" | "autonomous"`
  - escalation thresholds (cost/time budget, confidence, tool allow-list)
  - review-channel selector (Slack, Discord, email, none)
  - optional “default approvers” list
- **Version the config** so older workflows keep working even if the new fields are absent.

> ✅ Goal: Users see the knobs but nothing changes under the hood yet.

---

## Stage 1 · Pause / Resume Infrastructure

- **Introduce AgentReviewService**
  - Supabase table for pending approvals: `workflow_id`, `execution_id`, `node_id`, `step_payload`, `status`, timestamps.
  - API endpoints / server actions:
    - `POST /agent/review` — create a pause record.
    - `POST /agent/review/:id/approve` — resume the agent with optional reviewer note.
    - `POST /agent/review/:id/reject` — abort step with structured feedback.
- **Runtime plumbing**
  - AI agent loop emits a pause event instead of executing when `agentMode === human_review` (or when hybrid escalation rule matches).
  - Agent execution context must serialize current state (prompt, tool history, variables) so we can rehydrate on approval.
  - Support manual resume via CLI/admin panel for early testing.

> ✅ Goal: We can interrupt the agent, store state, and resume on demand.

---

## Stage 2 · Chat-Based Approvals

- **Slack / Discord messaging helpers**
  - Utility to post approval cards with Approve/Reject buttons, summarizing the attempted action, target integration, estimated impact, and cost.
  - Embed a review token that maps back to the AgentReviewService row.
  - Surface optional diff (e.g., “will send this Slack message”).
- **Interaction handling**
  - New webhook routes to capture button clicks / slash commands.
  - Update the review record, resume or abort the agent, log reviewer notes.
  - Add configurable timeouts; auto-fail or auto-approve on expiry per workflow setting.
- **Notification UX**
  - Optional DM/mention when a request is waiting.
  - Activity log entry in the workflow execution timeline.

> ✅ Goal: Reviewers approve in-chat; agent picks up where it left off.

---

## Stage 3 · Context & Variable Intelligence

- **Context assembly**
  - Build a rich `workflowContextMap` (field name → latest value, source node, type, timestamp).
  - Pass the map into the planner prompt; keep append-only history for traceability.
- **Smart suggestions**
  - Model proposes a field mapping per required input, with justification.
  - In the builder, show “Suggested variable: {{Gmail → Body}} — Reason: matches user email content”.
  - Accept button updates the config; override keeps manual control.
- **Telemetry**
  - Track acceptance vs override rate per suggestion.
  - Promote high-confidence suggestions to auto-fill defaults or new templates later.

> ✅ Goal: Reduce manual wiring while keeping humans in control.

---

## Stage 4 · Autonomy & Guardrails

- **Autonomous execution**
  - When `agentMode === autonomous`, skip the pause logic but enforce guardrails:
    - Max steps per run.
    - Max cost / token usage.
    - Max runtime duration.
  - Emit a summary step at completion (actions taken, resources touched, approvals skipped).
- **Safety valves**
  - Auto-stop if a guarded threshold triggers; surface a review item with the reason.
  - Provide a “panic button” in the UI to cancel active agent runs.
- **Audit trail**
  - Ensure every tool invocation logs inputs/outputs, timestamps, and whether it was auto-approved.
  - Make the history browsable from the workflow execution view.

> ✅ Goal: Agent can run end-to-end responsibly, and ops teams can audit everything.

---

## Supporting Workstreams

- **UX / UI**
  - Configuration modal updates, visual cues for paused steps, inbox for pending approvals.
  - Pipeline to surface suggested variables directly in field editors.
- **Integrations**
  - Chat providers (Slack, Discord) need new message templates & interaction handlers.
  - Email fallback for orgs without chat connected.
- **Testing & Rollout**
  - Feature flags per org.
  - Seed workflows with mock review channels for internal dogfood.
  - Metrics dashboard (approval latency, auto vs manual rate, overrides).
- **Documentation & Onboarding**
  - Update docs with agent modes, best practices, cost implications.
  - Provide quick-start templates for “manual review” and “autonomous” agents.

---

## Suggested Implementation Sequence

1. **Stage 0** (schema & UI)  
2. **Stage 1** (pause/resume)  
3. **Stage 2** (chat approvals)  
4. **Stage 3** (variable suggestions)  
5. **Stage 4** (autonomy + guardrails)

Ship incrementally—every stage should leave workflows stable and backwards compatible.
