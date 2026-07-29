# React Agent conversation persistence

**Slice:** REACT-AGENT-CONVERSATION-PERSISTENCE-1 · **Status:** shipped (local),
migration applied · **Applies to:** anything that stores, restores, or acts on
React Agent conversation state.

## The rule

> **Conversation history remembers what happened.**
> **The saved workflow determines what actually exists.**
> **Current readiness determines what the React Agent should do next.**

Three separate questions, three separate sources of truth. The failure this rule
exists to prevent is any one of them answering another's question — most of all,
a stored client-side hint claiming a workflow contains work that was never saved.

Two hard consequences:

1. **A persisted conversation may never resurrect unsaved nodes.** Restoring a
   transcript is a read. It never applies a patch, never re-shows a preview on
   the canvas, and never re-issues an AI request.
2. **A persisted conversation may never independently start the guided setup
   flow.** Connect / Configure / Test / Activate are derived from the saved
   workflow plus current readiness. History is not evidence that a step is due.

## Where each fact lives

| Fact | Owner | Never |
|---|---|---|
| What was said | `builder_agent_messages` (one thread per `(user, workflow)`) | …a stage, a token, a popup state |
| What a proposal's lifecycle did | `agent_change_history.status` | …duplicated onto the message; the message stores `agent_change_id` and READS the status |
| What exists | `workflows.draft_definition` + `hydratedRevision` | …inferred from the transcript |
| What to do next | `computeAgentReadiness` → `deriveGuidedBuildStage` | …restored from storage |

`applied_saved` is the lifecycle status that separates "reached the local draft"
from "reached the saved workflow". Only the second may resume a guided journey.

## Guided-session state

`useGuidedBuildSession` persists a hint **bound to the saved graph revision**, and
only once the applied work has actually been saved:

- unsaved session → **memory only**; leaving the page ends it,
- saved session → hint `{ v, savedGraphVersion }`, re-bound on every later save,
- on return the hint is honoured **only** while it matches the current saved
  revision of a non-empty workflow; anything else (including the legacy bare
  `"1"` marker) is deleted on sight,
- cleared on exit, discard, checkpoint restore, workflow replace, activation, and
  when no setup work remains.

Never store a stage. Never let localStorage alone resume setup.

## Preview reconciliation

Every restored proposal is re-judged by `core/workflows/reactAgentPreviewReconciliation.ts`
against three present-tense inputs — the change-history status, the proposal's
`baseGraphVersion`, and the workflow's current saved revision:

| Situation | Label | Reopen? |
|---|---|---|
| shown, never applied, still fits | Not applied | yes |
| applied to the draft, never saved | **Not saved** | yes (if it still fits) |
| applied and saved | Applied | no |
| saved workflow changed since | **Stale** | no — regenerate first |
| discarded / undone / kept-as-preview | Discarded | no |
| apply failed | Not applied | no |

An **unpinned** proposal (a new-workflow additive skeleton, which has no
`baseGraphVersion` by construction) is judged on its own terms — never called
stale. A **pinned** proposal whose saved revision is unknown fails **closed**.
While the change-history timeline is still loading, show **no** badge: a wrong
label reads as data loss.

## Storage rules

Persist: user text, assistant text, review/error turns, timestamps, the
structured proposal, `base_graph_version`, `request_id`, `client_message_id`,
`agent_change_id`.

Never persist: OAuth tokens, credentials, secret field values, raw provider
payloads, private model prompts, popup/session UI state, or a guided stage.

`services/ai/builderAgent/sanitizeAgentMessage.ts` is the only writer of a
persistable message:

- `safe_payload` is **allowlisted** — it is a lossy display projection.
- `proposal` is **deep-scrubbed, not allowlisted** — it must round-trip well
  enough that reopening proposes the *same* graph, so allowlisting would
  silently change what a preview would apply. Secret-shaped keys and values are
  removed at every depth; an over-cap proposal is dropped **entirely** rather
  than truncated.

## Security

Threads and messages are scoped to `auth.uid() = user_id` **AND** membership in
the workflow's account (RLS policies join `workflows` → `account_memberships`).
Routes gate on `loadWorkflowForMember` first, so a non-member gets the standard
404 with no existence leak. Ownership is always taken from the session and the
route param, never from the request body. Messages have no UPDATE policy.

## Billing

Restoring, reading, and clearing a transcript are deterministic database
operations: no model call, no credits. Writes are fire-and-forget and never
re-issue a request. Idempotency is enforced by a partial unique index on
`(thread_id, client_message_id)`, so a retried write returns the stored row
instead of duplicating a turn — a restored thread can never re-bill.

Recent-turn context sent to the model still obeys the existing
`MAX_GUIDANCE_CONVERSATION_TURNS` / per-turn text caps; a restored transcript is
never sent whole.
