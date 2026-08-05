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
against present-tense inputs — the change-history status, the proposal's
`baseGraphVersion`, and the **current graph fingerprint**:

| Situation | Label | Reopen? |
|---|---|---|
| shown, never applied, still fits | Not applied | yes |
| applied to the draft, never saved | **Not saved** | yes (if it still fits) |
| applied and saved, still the current state | Applied | no |
| applied and saved, workflow moved on since | Applied (superseded) | no |
| saved workflow changed since | **Stale** | no — regenerate first |
| base version not confirmable | **Can't verify** | no — regenerate first |
| discarded / undone / kept-as-preview | Discarded | no |
| apply failed | Not applied | no |

An **unpinned** proposal (a new-workflow additive skeleton, which has no
`baseGraphVersion` by construction) is judged on its own terms — never called
stale. While the change-history timeline is still loading, show **no** badge: a
wrong label reads as data loss.

### Freshness is fingerprint-to-fingerprint (RESTORED-EDIT-PROPOSAL-STALE-MISMATCH-1)

Two different "version" spaces meet in the builder and they are **not**
interchangeable:

| Value | What it is | Produced by | Right question for |
|---|---|---|---|
| `baseGraphVersion` | 8-char content **fingerprint** of the draft the proposal was built against | `computeEditableGraphVersion` | "is this the same graph?" |
| `graphSlice.hydratedRevision` | the workflow's `updatedAt` **timestamp** | server save/hydrate | "did the saved workflow move?" |

The builder used to hand `hydratedRevision` to the reconciliation as the value to
compare against `baseGraphVersion`. A timestamp can never equal a fingerprint, so
**every** restored edit proposal was reconciled as "the workflow moved on" —
permanently badged Stale with Apply withdrawn, even when nothing had changed.
(New-workflow proposals were unaffected: they are unpinned.)

The canonical contract is therefore:

- **One function, both sides.** `computeEditableGraphVersion` stamps the proposal's
  base *and* derives the current version. There is no second hashing scheme, and
  no client/server divergence.
- **Compare the PENDING graph**, not the saved one — it is the same graph
  `replaceGraphLocal` re-checks at Apply time, so the badge and Apply can never
  disagree with each other.
- **Fail closed on anything that is not a fingerprint.** `isEditableGraphVersion`
  validates both sides; a malformed or missing value yields **`version_unknown`**
  ("Can't verify"), never `stale`. "We can't check" is not "your workflow changed",
  and saying the second when we mean the first is a false accusation.
- **Applied-and-saved is judged by the proposal's END state** (`proposedGraphVersion`),
  never by its base. The base is the graph *before* the change, so judging by it
  would tell every user their workflow had changed since — when the only thing that
  changed it was their own apply.

**Fingerprint contents.** Included: node id / kind / provider / type / config
(keys and values) / `displayName`, and edge id / from / to / label. Node and edge
**order is normalized** (sorted by id) — a graph is a set, so serialization order
must never register as a change. Object keys are sorted recursively. Excluded:
everything not in the definition — transient builder state, selection, readiness,
loading, conversation and proposal state, and non-semantic database metadata.

**Layout is semantic — deliberately.** Positions are part of the fingerprint,
because Apply replaces the whole definition including positions: a node the user
moved is a real edit a stale proposal must not silently clobber. Moving a node
therefore makes a pending proposal stale, and that is the intended trade.

**Legacy.** No migration was needed: `base_graph_version` has always stored a
fingerprint, so stored proposals reconcile correctly under the fixed comparison.
Any value that is not a well-formed fingerprint fails closed to "Can't verify".

**Client checks are not the last word.** The badge is a UI affordance; the
enforcement is `replaceGraphLocal`'s `expectedBaseVersion` guard, which refuses to
replace a draft whose fingerprint has drifted. Note that the builder's ordinary
Save is still last-write-wins (`updateDraftDefinition`); cross-session save
concurrency is a separate, pre-existing gap tracked outside this contract.

Diagnostics: `describeProposalReconciliation` emits presence booleans, the
comparison enum, the resulting state, and **4-character** fingerprint prefixes —
never a workflow definition, config value, prompt, or full digest.

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

## Retention and deletion (REACT-AGENT-CONVERSATION-RETENTION-1)

**A conversation lives exactly as long as its workflow ROW does.** Nothing
expires a thread by age. There is no TTL column, no retention sweep, and no
lifecycle-state predicate anywhere in the retention path.

Enforced entirely by the database — no route, cron, or browser cleanup is
involved, and none may be added:

```
workflows.id
  └─ builder_agent_threads.workflow_id   NOT NULL · ON DELETE CASCADE
       └─ builder_agent_messages.thread_id   NOT NULL · ON DELETE CASCADE
  └─ builder_agent_messages.workflow_id  NOT NULL · ON DELETE CASCADE   (second path)
auth.users.id
  └─ builder_agent_threads.user_id       NOT NULL · ON DELETE CASCADE
  └─ builder_agent_messages.user_id      NOT NULL · ON DELETE CASCADE
```

| Event | What happens to the conversation |
|---|---|
| Active workflow | Retained indefinitely. |
| **Soft-delete (trash)** | Retained. Trash is an UPDATE (`state='deleted'`, `deleted_at`, `purge_after`); the row survives, so the conversation survives the entire restore window. |
| **Restore** | The same thread and messages are available again — they never left. |
| **Hard delete** (purge cron past `purge_after`) | Thread and every message cascade away. |
| **Account purge** | `deleteWorkflowsByAccount` removes the workflow rows; the same cascade clears every conversation. The purge never touches these tables directly. |
| Workflow A deleted | Workflow B's conversation is untouched — the cascade is per-row. |
| User deleted | Their threads and messages cascade away. |

The **restore window is 7 days** (`WORKFLOW_TRASH_RETENTION_DAYS`), not 30. The
30-day figure is `DEFAULT_GRACE_PERIOD_DAYS`, the *account*-deletion grace
period — during which the workflow rows still exist, so conversations are
likewise retained. Both windows are the workflow row's lifetime, which is the
only thing this contract depends on.

**Orphan sweep.** `deleteOrphanedThreadsServiceRole` (run from the trash-purge
cron) removes threads whose workflow row is missing. It is a **drift backstop**:
with the FK `NOT NULL` + `CASCADE` + validated, an orphan is structurally
impossible, and a live census found zero. It exists so that a future migration
weakening the constraint cannot silently leave unreachable transcripts behind.
A thread whose workflow is merely soft-deleted is **not** an orphan — the
existence check is state-blind on purpose.

Regression guard: `tests/unit/repositories/builderAgentThreadsRetention.test.ts`
reads the shipped migrations and fails if any of them drops, nullifies, or
re-adds these foreign keys without `ON DELETE CASCADE`, or adds `NOT VALID`.

## Billing

Restoring, reading, and clearing a transcript are deterministic database
operations: no model call, no credits. Writes are fire-and-forget and never
re-issue a request. Idempotency is enforced by a partial unique index on
`(thread_id, client_message_id)`, so a retried write returns the stored row
instead of duplicating a turn — a restored thread can never re-bill.

Recent-turn context sent to the model still obeys the existing
`MAX_GUIDANCE_CONVERSATION_TURNS` / per-turn text caps; a restored transcript is
never sent whole.
