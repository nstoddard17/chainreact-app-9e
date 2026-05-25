# Slack 2.5 — File-uploaded trigger plan

**Status:** Plan. Not yet implemented. Awaiting Marcus's decisions on §9.
**Branch:** `v2-provider-port-local` (local-only).
**Master plan:** [`docs/slices/phase-2-plan.md`](phase-2-plan.md).
**Provider audit:** [`docs/slices/parity-slack.md`](parity-slack.md).
**Predecessors:**
- [`docs/slices/slack-2-1-messaging-reactions-plan.md`](slack-2-1-messaging-reactions-plan.md) (shipped)
- [`docs/slices/slack-2-2-private-channels-and-lifecycle.md`](slack-2-2-private-channels-and-lifecycle.md) (shipped)
- [`docs/slices/slack-2-3-channels-users-plan.md`](slack-2-3-channels-users-plan.md) → [`slack-2-3-outcomes.md`](slack-2-3-outcomes.md) (shipped)
- [`docs/slices/slack-2-4-files-plan.md`](slack-2-4-files-plan.md) → [`slack-2-4-outcomes.md`](slack-2-4-outcomes.md) (shipped)
**Direct platform dependency:** P-S3 file output contract — shipped. Plan: [`docs/slices/p-s3-file-output-contract-plan.md`](p-s3-file-output-contract-plan.md). Outcomes: [`docs/slices/p-s3-file-output-contract-outcomes.md`](p-s3-file-output-contract-outcomes.md).
**V1 source:** `c:\Users\marcu\source\repos\nstoddard17\chainreact-app-9e`
**V2 surface:** [`integrations/slack/`](../../integrations/slack/)

Slack 2.5 ships the deferred file trigger from Slack 2.4 plan §10
decision #2. It introduces one Slack trigger — `slack_trigger_file_uploaded`
canonicalized as `slack.file_shared` — and zero new platform primitives,
manifest scopes, or file-action changes. The composition pattern
`slack.file_shared → slack:get_file_info → <downstream>` becomes the
canonical way to react to a Slack file upload.

---

## 1. Slack 2.5 scope

### Proposed trigger (1)

| Trigger key (V2-canonical) | Slack event | What it does | V1 reference |
|---|---|---|---|
| `slack.file_shared` | `file_shared` | Fires when a file is shared in a Slack channel. Payload carries the raw Slack `event` object verbatim. Optional `channelId` config filter. | `lib/workflows/nodes/providers/slack/triggers/fileUploaded.schema.ts` + `lib/webhooks/normalizer.ts:127` + `lib/triggers/providers/SlackTriggerLifecycle.ts:224` |

V2 normalizer already auto-derives `slack.<event.type>` for every Slack
event type other than `message` (which has its four-channel-kind split).
That means Slack 2.5 needs zero changes to
[`integrations/slack/webhooks/normalize.ts`](../../integrations/slack/webhooks/normalize.ts).
A `file_shared` envelope already emits a canonical `slack.file_shared`
TriggerEvent today — there's just no filter registered, so the
dispatcher drops with `matched=0`. Slack 2.5 adds the filter.

### Out of scope (Slack 2.5)

- **No file action changes.** `upload_file`, `download_file`, `get_file_info` ship in Slack 2.4 — frozen for 2.5.
- **No `provider_url` fetch adapter.** Slack 2.4 plan §10 decision #1 (reject `provider_url` at `upload_file` entry) stands; cross-provider URL fetching is future platform work.
- **No inline bytes / base64 / `content` arms.** Anywhere. P-S3 contract is the file shape, but this trigger emits no FileRef (see §5).
- **No `fileTypes` filter** (V1 had a multi-select: images/documents/spreadsheets/etc.). Knowing a file's type requires a `files.info` round-trip; the raw `file_shared` event carries only ids. Workflow authors that want to branch on `filetype` compose `slack:get_file_info` downstream and gate. **Defer to 2.6 if there's appetite — needs design.**
- **No `file_created` / `file_public` / `file_change` / `file_unshared` / `file_deleted` event variants.** Slack ships several file lifecycle events; `file_shared` is what V1 used and what fits the "new file appeared" workflow trigger. Other variants can be added in follow-up slices if Marcus surfaces a use case.
- **No FileRef on the trigger payload.** See §5 / §9 decision A.
- **No new manifest scopes.** `files:read` already added in Slack 2.4 — that unlocks `file_shared` event delivery (Slack docs: file events require `files:read`).

---

## 2. V1 source audit

| V1 file | Status | Notes |
|---|---|---|
| `lib/workflows/nodes/providers/slack/triggers/fileUploaded.schema.ts` | **Reference only — V1 schema is fiction.** | V1 output schema documents 17 fields including `fileName`, `fileType`, `fileSize`, `fileUrl`, `fileUrlPrivate`, `fileThumbUrl`, `userName`, `channelName`, `timestamp`, `title`, `initialComment`, `isPublic`, `mode`. **None of these are in the raw Slack `file_shared` payload.** V1 must have populated them via a hidden `files.info` lookup, or the schema is aspirational and unwired. V2 emits only what Slack actually delivers (file_id, user_id, channel_id, event_ts, event_id, team_id from envelope). Workflow authors who want metadata compose `slack:get_file_info` downstream — same pattern Slack 2.4 already establishes for cross-action composition. |
| `lib/webhooks/normalizer.ts:127` (`file_shared` branch) | **Reference.** V1 emits `{ file, user, channel, eventTs, team, raw }` on the normalized trigger. | V2 differs: emits canonical `slack.file_shared` (auto-derived) with the inner Slack `event` object passed through verbatim as `payload`. Same convention as every other V2 Slack trigger. No normalizer code change required. |
| `lib/triggers/providers/SlackTriggerLifecycle.ts:224` (`'slack_trigger_file_uploaded': 'file_shared'`) | **Reference.** Confirms the V1 short-name → Slack-event mapping. | V2 has no per-workflow `registerActivation` step for Slack — Slack subscribes to events at the workspace level via the bot app manifest. The filter registry is the entire activation surface. |
| `lib/workflows/testing/fixtures/webhooks/slack/file-shared.json` | **Port to V2 e2e fixture format.** | Confirms Slack's `file_shared` envelope carries `event.type: "file_shared"`, `event.file_id: "F0001"`, `event.user_id: "U0001"`, `event.channel_id: "C0001"`, `event.event_ts: "1711900808.000900"`, `event.file: { id: "F0001" }` (partial — id only, NOT full metadata). No name, no mimetype, no size, no url. **This is the empirical proof that the trigger cannot emit a FileRef.** |
| V1 `fileTypes` filter logic (if implemented) | **Not located.** | The V1 schema declares the filter but the runtime side (which would need `files.info` after every event) does not appear in `normalizer.ts:127`. Treat as V1 dead-code: don't port. |
| V1 `workspace` config selector | **Not ported.** Same V2 rule as every other Slack trigger / action: workspace is resolved via `triggerEvent.accountId` (the Slack `team_id` from the envelope) → integration row, not a per-trigger config field. Inherited from Slack 2.3 §2.4 / Slack 2.4 §2.3. |

### V1 rot to NOT port

1. **17-field "synthetic" output schema** (`fileName`, `fileType`, `fileSize`, `fileUrl`, `fileUrlPrivate`, `fileThumbUrl`, `userName`, `channelName`, `title`, `initialComment`, `isPublic`, `mode`). These require `files.info` + `users.info` + `conversations.info` enrichment — none of which the raw event carries. **V2 emits only what Slack actually delivers.**
2. **`fileTypes` filter** without a `files.info` enrichment step. Lying about being able to filter by filetype when the trigger payload doesn't carry it is V1 rot — defer.
3. **`workspace` per-trigger selector.** Resolved by `triggerEvent.accountId`.
4. **Raw `fileUrl` / `fileUrlPrivate` flat output fields.** Even if added via enrichment, these would be P-S3 violations — bare URLs without auth / scope context. The proper shape is `FileRef(provider_url)`, and that requires `name` + `mimeType` + `sizeBytes` + `url`, which the raw event lacks. So nothing of this shape ships on the trigger payload (see §5).

---

## 3. V2 current Slack trigger model

Slack 2.5 fits the existing model with zero infrastructure changes.

### 3.1 Normalizer ([`integrations/slack/webhooks/normalize.ts`](../../integrations/slack/webhooks/normalize.ts))

Forward-compatible: `slack.<event.type>` for every event type that
isn't `message` (which has its own channel-kind split). A `file_shared`
envelope already produces a `slack.file_shared` canonical TriggerEvent
today — there's just no filter registered for it yet. The inner Slack
`event` object is passed through verbatim as `payload`. Slack 2.5
requires **zero changes** to the normalizer.

### 3.2 Filter registry ([`integrations/slack/triggers/index.ts`](../../integrations/slack/triggers/index.ts))

9 filters registered today: 4 message channel kinds, 2 reactions, 3
lifecycle (`channel_created`, `member_joined_channel`,
`member_left_channel`). Slack 2.5 adds one entry:
`registerTriggerFilter(fileSharedFilter)`. The module's side-effect
import semantics are well-documented in the file header.

### 3.3 Per-filter design — current shape

Each filter is one `filter.ts` file at
`integrations/slack/triggers/<name>/filter.ts` exporting a
`TriggerFilter<Config>` value with:
- `provider: "slack"`
- `eventType: "slack.<short>"`
- `parseConfig(rawConfig): Config` — Zod parse, fail-closed
- `evaluate(event, config): FilterResult` — `{kind: "match"}` or `{kind: "no-match", reason}`

The `memberJoinedChannel` filter is the closest precedent for Slack 2.5
— it accepts an optional `channelId` field with the same `^[CG][A-Z0-9]+$`
regex pattern Slack 2.5 will use, and gates on `event.payload.channel`.

### 3.4 Lifecycle / activation

Slack uses Events API workspace-level subscriptions: the bot app
manifest declares which event types it wants, Slack delivers them to
the webhook endpoint, and V2's filter registry decides per-workflow
matches. There is **no per-workflow `registerActivation`** for Slack
(unlike Trello / Notion / GitHub). Slack 2.5 inherits this: the trigger
is "live" the moment a workflow has it on the active draft, no resource
registration needed. The bot already receives `file_shared` events when
`files:read` is granted (added in Slack 2.4).

### 3.5 Dispatch path

Mirroring the existing Slack 2.1/2.2/2.3 flow:
1. Slack POSTs the `event_callback` envelope to `/api/webhooks/slack`.
2. `receiveSlackWebhook` verifies HMAC + parses → returns `TriggerEvent[]`.
3. Dispatcher looks up all active workflows whose trigger node matches
   `event.eventType` (here: `slack.file_shared`).
4. For each candidate, the registered filter's `parseConfig` + `evaluate`
   decides match / no-match. Workflows that match enqueue runs.

No new dispatch primitives required.

### 3.6 E2E walkthrough pattern

[`tests/e2e/slice-1-slack-walkthrough.spec.ts`](../../tests/e2e/slice-1-slack-walkthrough.spec.ts)
contains the multi-workflow fan-out pattern (Slack 2.1 + 2.2 + 2.3 + 2.4
combined). Each Slack 2.2 trigger test creates 2–5 workflows wired to a
trigger + simple action, fires a signed Slack envelope, and asserts
which workflow_runs appear in the DB. Slack 2.5 extends this same file
with file_shared phases — see §8.

The mock-Slack server at [`tests/e2e/helpers/mockSlackServer.ts`](../../tests/e2e/helpers/mockSlackServer.ts)
already has `files.info` + `url_private_download` mocks from Slack 2.4
(if §9 decision C → "include downstream `get_file_info`"). No mock
additions required if §9 decision C → "trigger-only".

---

## 4. Trigger design

### 4.1 Trigger key

| Layer | Value |
|---|---|
| Canonical V2 eventType | `slack.file_shared` |
| Filter file | [`integrations/slack/triggers/fileUploaded/filter.ts`](../../integrations/slack/triggers/fileUploaded/filter.ts) (proposed) |
| Filter export | `fileUploadedFilter` |
| V1 reference name | `slack_trigger_file_uploaded` (NOT preserved; V2 canonical names are `slack.<short>` per Slack 2.1 convention) |
| `trigger_resources.event_type` | Not applicable — Slack does not use per-workflow `registerActivation`. |

### 4.2 Config schema (Zod)

```ts
const ConfigSchema = z.object({
  channelId: z
    .string()
    .regex(/^[CG][A-Z0-9]+$/, "channelId must be a Slack channel id (C… or G…).")
    .optional(),
});
type Config = z.infer<typeof ConfigSchema>;
```

Mirrors `memberJoinedChannel` exactly. The regex permits both `C…`
(public + modern private) and `G…` (legacy private) ids. Files
genuinely shared into DMs (`D…`) or MPIMs do not fire `file_shared`
under bot scopes in practice; if Marcus wants to support DM-shared
files in a later slice, the regex extends to `^[CDG][A-Z0-9]+$`.

**Open decision in §9 #B** — should v1 of this trigger include the
channelId filter, or ship match-all-only?

### 4.3 Filter `evaluate` behavior

```ts
evaluate(event, config) {
  if (config.channelId === undefined) return { kind: "match" };
  const eventChannel = event.payload.channel_id;  // NB: file_shared uses channel_id, not channel
  if (eventChannel === config.channelId) return { kind: "match" };
  return {
    kind: "no-match",
    reason: `channel ${String(eventChannel)} does not match filter ${config.channelId}`,
  };
}
```

**Detail worth pinning:** Slack's `file_shared` event uses
`event.channel_id` (snake_case, with `_id` suffix) — NOT
`event.channel` like the `message` event. Same is true for `event.user_id`
and `event.file_id`. The filter must read `payload.channel_id`, not
`payload.channel`. Easy to get wrong by copy-pasting from
`memberJoinedChannel` (which uses `event.channel`).

This is documented inline in the filter file and verified by the unit
test against the V1 fixture shape.

### 4.4 No FileRef emitted

The trigger payload does **not** emit a `FileRef`. Rationale below in §5.
Workflow authors that need file metadata or bytes compose
`slack:get_file_info` (→ `FileRef(provider_url)` + flat metadata) or
`slack:download_file` (→ `FileRef(v2_storage)` + staged bytes)
downstream.

---

## 5. Payload design

### 5.1 What Slack actually delivers

From V1 fixture `lib/workflows/testing/fixtures/webhooks/slack/file-shared.json`
and Slack docs (https://api.slack.com/events/file_shared):

```jsonc
{
  "token": "…",
  "team_id": "T0001",
  "api_app_id": "A0001",
  "event": {
    "type": "file_shared",
    "file_id": "F0001",         // top-level id
    "user_id": "U0001",
    "file": { "id": "F0001" },  // partial — id only, NO metadata
    "channel_id": "C0001",
    "event_ts": "1711900808.000900"
  },
  "type": "event_callback",
  "event_id": "Ev0009TEST",
  "event_time": 1711900808,
  …
}
```

That's the entirety of the file metadata Slack ships in the event.
**No name. No mimetype. No size. No url.** The `file` sub-object is a
stub `{ id }`. Anything richer requires a `files.info` round-trip.

### 5.2 V2 normalized TriggerEvent shape

```ts
{
  provider: "slack",
  eventType: "slack.file_shared",
  eventId: "Ev0009TEST",                       // from envelope event_id
  occurredAt: "2024-03-31T15:20:08.000Z",      // from envelope event_time × 1000
  accountId: "T0001",                          // from envelope team_id
  payload: {
    type: "file_shared",
    file_id: "F0001",
    user_id: "U0001",
    file: { id: "F0001" },
    channel_id: "C0001",
    event_ts: "1711900808.000900"
  },
}
```

The payload is the inner Slack `event` object passed through verbatim
— same convention as every other Slack trigger. Workflow authors index
`{{trigger.payload.file_id}}`, `{{trigger.payload.user_id}}`,
`{{trigger.payload.channel_id}}`, `{{trigger.payload.event_ts}}`.

### 5.3 No FileRef on the trigger payload

P-S3's `FileRefSchema` is `.strict()` per arm. The `provider_url` arm
requires `url: z.string().url()`, `name: z.string().min(1)`,
`mimeType: z.string().min(1)`, `sizeBytes: z.number().int().nonnegative()`,
`providerFileId: z.string().min(1)`. Slack's raw `file_shared` event
carries only `file_id`. Constructing a `provider_url` FileRef with
`name: ""` / `mimeType: ""` / `sizeBytes: 0` would either fail Zod
parsing or lie about the data. Neither is acceptable.

The principled answer is the one already documented in
[`docs/slices/slack-2-4-files-plan.md`](slack-2-4-files-plan.md) §4.4
(option B): **do not emit a FileRef on the trigger payload.** Workflow
authors compose `slack:get_file_info` downstream, which emits a
properly populated `FileRef(provider_url)` along with the structured
metadata fields. Slack 2.5 follows this rule.

### 5.4 No bytes

Triggers never carry bytes. P-S3 durable rule #1 (no `content` / `bytes`
/ `base64` / `data` keys in action outputs) applies analogously to
trigger payloads — and is reinforced by `TriggerEventSchema`'s shape
which is just a generic `payload: Record<string, unknown>` without any
file-byte-shaped fields. Slack 2.5 has no temptation to violate this
because Slack itself doesn't ship bytes in the event.

### 5.5 Optional normalized sibling fields (open decision §9 #A)

Two options:

**A1 — Raw passthrough only (RECOMMENDED).** Workflow authors index
`payload.file_id`, `payload.channel_id`, `payload.user_id`,
`payload.event_ts` directly. Matches the existing Slack 2.1/2.2/2.3/2.4
convention — no other Slack trigger adds camelCase aliases. Workflow
authors who navigate from one Slack trigger to another use the same
snake_case index pattern throughout. No surface drift, no aliasing
ambiguity ("which one is canonical, `payload.fileId` or `payload.file_id`?").

**A2 — Add camelCase aliases at the canonical top level.** Emit
`fileId`, `userId`, `channelId` as siblings of `payload` for ergonomic
workflow indexing (`{{trigger.fileId}}`). Cost: surface drift from
existing Slack triggers (none have aliases today). Benefit: shorter
references in workflow builder UI.

Recommendation: **A1.** If Marcus picks A2, applying it retroactively
to the other 9 Slack triggers becomes a separate consistency PR, and
2.5 lands with the aliases as a one-off; that's worth being explicit
about.

---

## 6. Scope requirements

**No new scopes.**

`files:read` was added to the Slack manifest in Slack 2.4 Commit 2
(`fe8e7529e`). Per Slack docs (https://api.slack.com/events/file_shared#authorization),
the `file_shared` event is delivered to apps with `files:read`. The
scope add already unlocked event delivery; Slack 2.5 just adds the
filter that catches them.

If audit later reveals a per-channel-kind scope (e.g. `groups:read`
for files shared in private channels — Slack docs are ambiguous here),
that goes through a separate audit + manifest-bump PR. Current reading
of Slack docs: `files:read` is sufficient for file_shared delivery
regardless of the channel kind the file lives in.

---

## 7. Implementation batch plan

Three or four commits. Each commit lands behind a green full-gate
baseline; no commit is intermediate / WIP.

| # | Commit | Files added/touched | Tests |
|---|---|---|---|
| 1 | `docs(slack): plan Slack 2.5 file uploaded trigger` | This doc. | n/a (doc-only). |
| 2 | `feat(slack): add file_uploaded trigger filter` | `integrations/slack/triggers/fileUploaded/filter.ts` (new) + 1-line addition to `integrations/slack/triggers/index.ts`. **No normalizer change. No manifest change. No lifecycle change.** | Unit test for the filter at `tests/unit/integrations/slack/triggers/fileUploaded/filter.test.ts`: 4–6 cases (match-all, channelId match, channelId no-match, malformed channelId, missing payload.channel_id, V1-fixture-shape happy path). Index registration smoke test if not already covered. |
| 3 | `test(slack): extend walkthrough with file_shared dispatch` | Extension to `tests/e2e/slice-1-slack-walkthrough.spec.ts`. Optional mock additions: only required if §9 decision C → "include downstream `get_file_info`". Slack 2.4 already wired `files.info` + `url_private_download` into the mock, so even C requires no new mock endpoints. | 2–3 e2e scenarios per §8. |
| (4) | `docs(slack): document Slack 2.5 outcomes + CLAUDE.md notes` | Outcomes doc; CLAUDE.md note if a durable pattern lands (e.g. the §9 decision A outcome about raw-passthrough vs aliases). Likely thin — Slack 2.5 reuses everything Slack 2.4 + 2.1/2.2 established. | n/a (doc-only). |

Commit 4 lands regardless of whether a durable note is needed — the
outcomes doc itself is the durable artifact (matches the pattern from
Slack 2.3 and Slack 2.4). If CLAUDE.md doesn't need new content, the
outcomes doc commit is just the outcomes file.

**Total LoC estimate:** ~50 source (one filter file + one-line index
add) + ~150 tests (unit filter + e2e extension). Smallest Slack slice
to date.

---

## 8. E2E plan

Extend the Slack walkthrough at
[`tests/e2e/slice-1-slack-walkthrough.spec.ts`](../../tests/e2e/slice-1-slack-walkthrough.spec.ts).
Same fan-out pattern as Slack 2.2 lifecycle + Slack 2.4 file scenarios:
N workflows, 1 trigger event, assert which workflow_runs landed.

### Scenarios

1. **`file_shared` match-all dispatch.**
   - Seed: one workflow with trigger `slack.file_shared`, no channelId config, simple `send_channel_message` action.
   - Run: POST a signed `file_shared` envelope mirroring the V1 fixture (channel_id="C-MATCH-ALL", file_id="F-1234").
   - Assertions: workflow_run row appears (`status: "succeeded"`); trigger payload includes `payload.file_id === "F-1234"` and `payload.channel_id === "C-MATCH-ALL"`; downstream action ran against the mock.

2. **`file_shared` channelId match + no-match parity.** (Conditional on §9 decision B — only ships if channelId filter is part of v1.)
   - Seed: two workflows. WF-A `slack.file_shared` channelId="CMATCH001"; WF-B `slack.file_shared` channelId="COTHER999".
   - Run: POST a signed `file_shared` envelope for channel_id="CMATCH001".
   - Assertions: WF-A run row appears; WF-B run row does NOT appear; filter no-match drop is visible in dispatcher logs (optional).

3. **`file_shared` → downstream `slack:get_file_info` composition.** (Conditional on §9 decision C.)
   - Seed: one workflow with trigger `slack.file_shared` + downstream action `slack:get_file_info` consuming `{{trigger.payload.file_id}}`.
   - Run: POST a signed `file_shared` envelope for file_id="F-COMPOSE-001"; mockSlackServer's `files.info` returns metadata for that file.
   - Assertions: workflow run succeeds; `files.info` was called with `file=F-COMPOSE-001`; downstream action output contains a `FileRef(provider_url)` with the populated metadata; no `content` / `bytes` / `base64` keys anywhere in `workflow_runs.steps`.

### Run discipline

- `--workers=1` per Slack walkthrough convention. CI already pinned to workers=1.
- Real V2 internals: auth, OAuth dispatcher, integration rows, workflow create/activate, webhook receive + HMAC verification, normalizer, filter registry, dispatcher, action handlers. Mock only the Slack network boundary.
- `workflow_files` migration applied before running e2e (`npm run db:push`). Scenarios 1 + 2 don't use storage, but scenario 3 (`get_file_info`) only touches metadata — still no storage write. So strictly only scenario 3 needs `workflow_files` if Marcus's mockSlackServer instance is fresh; in practice it's already applied for Slack 2.4 e2e.

### Replay / dedup

`TriggerEventSchema` carries `eventId`; the dispatcher's existing dedup
path keys on `(provider, eventId)`. Slack 2.5 inherits this — no
trigger-specific dedup needed. If e2e wants an explicit replay
assertion (POST the same envelope twice → 1 workflow_run), that's a
fourth scenario and a stretch goal; defer unless Marcus wants it.

---

## 9. Open decisions for Marcus

| # | Decision | Options | Recommendation |
|---|---|---|---|
| A | **Output shape — raw passthrough vs camelCase aliases.** Should the trigger emit only the raw Slack inner event as `payload`, or also add normalized `fileId` / `userId` / `channelId` aliases at the top level of the TriggerEvent? | A1 — raw passthrough only. A2 — add `fileId` / `userId` / `channelId` aliases. | **A1.** Matches every other V2 Slack trigger (no aliases today). Adding aliases here without retroactively doing the others creates inconsistency. If aliases are wanted, that's a separate slice that bumps all 10 Slack triggers consistently. |
| B | **Channel filter in v1.** Should the first version of the trigger include the optional `channelId` config field, or ship match-all-only and add the filter later? | B1 — include `channelId` filter in v1. B2 — match-all-only in v1. | **B1.** ~10 lines of code; mirrors `memberJoinedChannel`'s precedent. Match-all-only is a strictly weaker starting point; workflow authors with mixed-channel workspaces lose the only useful filter. |
| C | **E2E downstream composition.** Should the e2e include a scenario where the file_shared trigger drives a downstream `slack:get_file_info` action (proving the composition pattern), or stay trigger-only? | C1 — include downstream `get_file_info` scenario. C2 — trigger-only e2e. | **C1.** The whole point of deferring the FileRef-on-payload question (§5) is that downstream `get_file_info` is the composition story. Proving it works end-to-end is the only way to validate the design. mockSlackServer already wires `files.info` from Slack 2.4 — incremental cost is small. |

### Lower-priority informational items

- **`fileTypes` filter (defer to 2.6 or skip).** V1 had a multi-select for image / document / spreadsheet / video / audio / code / archive — requires `files.info` enrichment to know the filetype. Skipping in 2.5; can revisit if a workflow author explicitly asks for it.
- **`file_created` / `file_public` / `file_change` / `file_unshared` / `file_deleted` event variants.** Defer all five to later slices on demand. `file_shared` covers the dominant "new file appeared in this channel" use case.

---

## 10. Exit checklist (to be completed before Commit 2 starts)

- [ ] Marcus reviewed sections 1–9.
- [ ] Decision A locked (raw passthrough vs aliases).
- [ ] Decision B locked (channelId filter in v1 vs defer).
- [ ] Decision C locked (e2e downstream composition vs trigger-only).
- [ ] Confirmed: **no manifest scope changes** (files:read already granted in Slack 2.4).
- [ ] Confirmed: **no normalizer changes** (forward-compat path emits `slack.file_shared` today).
- [ ] Confirmed: **no per-workflow lifecycle registration** (Slack workspace-level event subscriptions inherited from Slack 2.1).
- [ ] Confirmed: **no FileRef on trigger payload** (P-S3 strict-arm validation would reject).
- [ ] Confirmed: **no `fileTypes` filter in v1** (requires `files.info` enrichment; defer).
- [ ] Confirmed: §8 e2e scope (3 scenarios, or 2 if §9 decision B/C narrow).

---

## 11. After Slack 2.5

Slack closure candidates still tracked in
[`docs/slices/parity-slack.md`](parity-slack.md):

- **P-S1** — user-token storage (`xoxp-…`). Unblocks `update_user_status` and `set_user_presence`.
- **`userJoinedWorkspace`** — per-trigger scope-request design (open audit question; carried since Slack 2.3 outcomes §6).
- **`add_reminder`** — pending Slack API status check (parity audit §13).
- **`fileTypes` filter on `slack.file_shared`** — only ships if a workflow use case surfaces it.

None of these are committed for follow-up timing here.
