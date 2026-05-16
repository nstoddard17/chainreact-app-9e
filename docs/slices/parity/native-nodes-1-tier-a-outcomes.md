# Native-nodes Slice 1 — Tier A outcomes

**Status:** Shipped locally on `v2-provider-port-local`. **Retro.**
**Master plan:** [`docs/slices/phase-2-plan.md`](../phase-2-plan.md).
**Provider audit:** [`docs/slices/parity/parity-native-nodes.md`](./parity-native-nodes.md) (accepted before Commit 1 began).
**Implementation plan:** [`docs/slices/parity/native-nodes-1-tier-a-plan.md`](./native-nodes-1-tier-a-plan.md) (accepted before Commit 1 began).
**V1 source:** `c:\Users\marcu\source\repos\nstoddard17\chainreact-app-9e`.
**V2 surface:** [`integrations/native/`](../../../integrations/native/).

Native-nodes Slice 1 closes the Tier A parity gap defined in the accepted audit §7: **three pure-handler ports** (`http_request`, `format_transformer`, `delay`) shipped under a new non-OAuth pseudo-provider `native`, registered directly into [`services/execution/handlers/_registry.ts`](../../../services/execution/handlers/_registry.ts) with zero engine changes, zero contract widening, and zero migrations. Each handler conforms to the existing `ActionHandler` shape, proving V2's existing contracts already accommodate non-provider-scoped nodes.

Largest qualitative outcomes: (1) **first non-OAuth pseudo-provider** lands cleanly without needing a ProviderManifest. The structure-test + activation-precondition both got tiny exemptions (one each) and otherwise nothing in V2's existing platform tier needed to know about native. (2) **No new runtime dependencies.** V1's `turndown` runtime dep for HTML → Markdown stays out of V2 — the converter is vendored in-tree as ~80 LOC of regex over a curated tag set, accepted product decision. (3) **Engine variable resolution works end-to-end across native nodes** — proven by the Playwright walkthrough across a 5-node chain (`slack-trigger → http_request → format_transformer → delay → slack-action`). (4) **One real bug surfaced by the e2e** — the activation precondition gate rejected workflows whose only actions were native, because it required an `integrations` row for every node's provider. Fix landed as a NON_OAUTH_PROVIDERS skip in the same e2e commit.

Remaining native parity work is gated on Slice 2 (manual_trigger + scheduled_trigger + run-now API) and the separate engine-branching slice (if_then_condition + router). Phase 6 owns loop / wait_for_event / unbounded delay. Phase 5 owns the AI cluster + tavily_search. Phase 8 owns HITL. Six V1 orphan handlers (executePath / executeFilter / fileUpload / googleSearch / transformer / emailClassifier) are PERMANENT SKIP per NPD-N10.

---

## 1. Commit chain

| Commit | Title |
|---|---|
| `de0a87256` | `docs(native-nodes): add parity audit` — Commit 0a (audit; doc-only; pre-Slice). |
| `62d19a870` | `docs(native-nodes): plan tier a handlers` — Commit 0b (implementation plan; doc-only). |
| `02dd475bb` | `feat(native): add http_request action` — Commit 1 (handler + schema + 39 tests + registry entry + structure-test NON_PROVIDER_ROOTS exemption). |
| `924f06043` | `feat(native): add format_transformer action` — Commit 2 (handler + schema + 58 tests + in-tree HTML/Markdown converters + registry entry). |
| `ed50446f7` | `fix(native): remove swept-in outlook registry entry` — corrective (parallel Outlook chat's `fetch_emails` registry edit was accidentally captured by Commit 2; this commit removed those 5 lines without touching Outlook source / tests). |
| `48033cae6` | `feat(native): add delay action` — Commit 3 (handler + schema + 17 tests + registry entry; narrow ≤30s scope per NPD-N6). |
| `870911c98` | `test(e2e): add native nodes slice 1 walkthrough` — Commit 4 (2 Playwright scenarios + 3 new precondition unit tests + NON_OAUTH_PROVIDERS skip in `services/triggers/preconditions.ts`). |

This doc (Commit 5) is the retro. **No runtime code changes.**

---

## 2. Scope shipped

### Actions (3 new, all native)

| Action | V1 reference | One-line summary |
|---|---|---|
| `native:http_request` | [`lib/workflows/actions/logic/executeHttpRequest.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/logic/executeHttpRequest.ts) (255 LOC) | Pure HTTP request (GET/POST/PUT/PATCH/DELETE) with strict Zod schema; URL scheme allowlist (http/https only); bounded 256 KiB response capture via streamed reader with truncation signal; bearer/basic/apiKey auth schemes layered last over user headers; AbortController-based timeout (default 15s, max 30s); response header sanitization (drops set-cookie / authorization / proxy-authenticate / proxy-authorization / www-authenticate); silent handler (no log lines anywhere). Non-2xx does NOT throw — workflow authors branch on `output.status` / `output.ok`. |
| `native:format_transformer` | [`lib/workflows/actions/utility/formatTransformer.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/utility/formatTransformer.ts) (326 LOC) | HTML / Markdown / Plain / Slack-Markdown converter. Strict `.strict()` schema rejects V1's `preserveVariables` + `testMode` flags at parse time. In-tree converter (no turndown dependency) handles headings (h1-h6), inline emphasis (strong/b/em/i), strikethrough, inline code, anchors → markdown links, ordered + unordered lists, paragraphs + line breaks, blockquotes, `<pre>` blocks; `<script>` / `<style>` / HTML comments stripped before parsing. Output capped at 2 MiB (throws on overflow). |
| `native:delay` | inline in V1 registry (no separate handler file) | Narrow in-process sleep with required `seconds: integer in [1, 30]`. Defense-in-depth `DelayCapExceededError` if any value > 30 bypasses the schema. setTimeout-only, no queueing, no persistence. Output shape `{delayedSeconds, startedAt, completedAt}`. Durable / unbounded delay deferred to Phase 6. |

Registered in [`services/execution/handlers/_registry.ts`](../../../services/execution/handlers/_registry.ts) under `provider: "native"`. **V2 native action total after Slice 1: 3.**

### Triggers

**None.** Native triggers (manual + scheduled) ship in Slice 2.

### Bug fix

[`services/triggers/preconditions.ts`](../../../services/triggers/preconditions.ts) — added `NON_OAUTH_PROVIDERS = new Set(["native"])` skip in `checkActivationPreconditions`. Without it, every workflow using ANY native node failed activation with `INTEGRATION_NOT_CONNECTED` for the synthetic `"native"` provider (no integrations row exists for native, by design). Surfaced by the Playwright walkthrough; fix landed in the same commit alongside 3 new unit tests in [`tests/unit/services/triggers/preconditions.test.ts`](../../../tests/unit/services/triggers/preconditions.test.ts) covering "native + slack works", "missing slack fails but native doesn't add a duplicate failure", and "every-node-is-native skips integrations lookup entirely".

### File system

New top-level directory [`integrations/native/`](../../../integrations/native/) for the pseudo-provider, mirroring per-provider directory shape but with NO `manifest.ts` (no OAuth, no scopes, no health-check interval, no rate-limit owner). Inside:

- `actions/httpRequest.ts` + `.schema.ts`
- `actions/formatTransformer.ts` + `.schema.ts`
- `actions/delay.ts` + `.schema.ts`

Test files mirror under `tests/unit/integrations/native/actions/`. All leaf folders well under the 50-file structure-lint limit.

### Manifest scope changes

**None.** Native has no manifest. The integrations registry at [`integrations/_registry.ts`](../../../integrations/_registry.ts) is untouched.

### Contract changes

**None.** `WorkflowNodeKindSchema` stays `"trigger" | "action"`. `WorkflowEdge` has no `label` field. `ActionHandlerResult` keeps a single `output` field. `TriggerEvent` is unchanged. `RunFailureCode` is unchanged.

### Database changes

**None.** No migrations.

---

## 3. Durable decisions worth preserving

### 3.1 Native is a non-OAuth pseudo-provider, not an integration

Native nodes have:
- No `manifest.ts`.
- No entry in [`integrations/_registry.ts`](../../../integrations/_registry.ts) (which is OAuth-scoped).
- No `ProviderManifest` shape (which carries health-check intervals, scopes, refresh policy — all inapplicable).
- No `integrations` row per user.
- No OAuth dance.
- No rate-limit owner.

The structure test at [`tests/structure/integration-manifests.test.ts`](../../../tests/structure/integration-manifests.test.ts) carries a `NON_PROVIDER_ROOTS = new Set(["native"])` exemption next to the existing `_shared` underscore exemption. The activation precondition at [`services/triggers/preconditions.ts`](../../../services/triggers/preconditions.ts) carries a parallel `NON_OAUTH_PROVIDERS = new Set(["native"])` skip. **Future non-OAuth pseudo-providers (if any ever ship) extend both sets in lockstep.**

### 3.2 No new runtime dependencies for HTML → Markdown

V1 used `turndown` (~85 KB gzipped). V2 vendors a regex-based converter inside `integrations/native/actions/formatTransformer.ts` covering the workflow-realistic tag set: h1-h6, strong/b, em/i, del/s/strike, code, a[href], ol/ul/li, p, br, blockquote, pre. Unknown tags fall through to inner text. `<script>` / `<style>` / HTML comments stripped before parsing.

Tradeoff accepted: nested tables / deeply nested lists / complex attribute escaping are out of scope. Workflows hitting that surface should compose via `http_request` to a dedicated parsing service (or the AI cluster, once Phase 5 lands).

**Rule:** Future native handlers MUST NOT introduce runtime dependencies for parsing / converting / serializing without explicit user approval. The lean V2 dep tree is intentional.

### 3.3 Strict schemas reject V1 cosmetic flags at parse time

Every native handler's resolved-config schema is `.strict()`. V1's stale flags that no longer mean anything in V2 (`preserveVariables`, `testMode`, `unit`, etc.) cause ZodError on parse — stale workflow definitions fail loudly with field paths, instead of silently producing wrong output.

This is the established V2 contract for ported handlers (mirrors Mailchimp 2.1's M-R3 drop). The audit's parity-native-nodes.md §8 rot inventory is closed: V1 rot patterns NOT carried forward.

### 3.4 No `{success, error, message}` envelope on any native handler

V1 wrapped failures in `{success: false, error: "..."}`. V2's contract is **throw on failure → engine converts to `HANDLER_FAILED` step**. Output shapes only describe success cases. Workflow authors branch on the run status / error_classification, not on a per-node success flag.

This is the established V2 contract; Slice 1 doesn't change it. The 401-driven `IntegrationActionRequiredError` pattern doesn't apply to native handlers (no OAuth) — they throw raw `Error` subclasses.

### 3.5 No log lines from native handlers

All three native handlers emit zero `console.info / .log / .warn / .error` calls. Unit tests assert this directly. The engine-layer logging at [`services/execution/engine.ts`](../../../services/execution/engine.ts) captures the run lifecycle; keeping handlers silent guarantees that bearer tokens / basic-auth passwords / API key values / full URLs (which may carry secrets in query strings) never reach a log.

**Rule:** Future native handlers MUST NOT log. Provider handlers also default to silent (no V2 provider handler logs today).

### 3.6 Bounded outputs — no raw response spread anywhere

| Action | Output cap | Cap signal |
|---|---|---|
| `http_request` | 256 KiB body (streamed reader, `reader.cancel()` releases socket on overflow) | `bodyTruncated: true`, `bytesCaptured` reflects captured (not total). `bodyJson` forced to `null` when truncated. |
| `http_request` headers | Drops `set-cookie` / `authorization` / `proxy-authenticate` / `proxy-authorization` / `www-authenticate`. Header values > 2 KiB dropped. | Sanitized record on output. |
| `format_transformer` | 2 MiB output | Throws `FormatTransformerOutputCapExceededError` (no silent truncation). |
| `delay` | n/a | Three-field output: `{delayedSeconds, startedAt, completedAt}`. |

The bounded shape stays stable across runs — downstream workflows pin references against named fields, not against raw provider response keys.

### 3.7 `http_request` URL scheme allowlist; SSRF guard deferred

Scheme allowlist enforced at handler entry: `http://` and `https://` only. Everything else (`file://`, `data:`, `javascript:`, `ftp://`, malformed strings) rejected with `UnsupportedUrlSchemeError` / `InvalidHttpRequestUrlError` before any network call.

**Deferred (deliberate Slice 1 boundary):**
- Outbound egress allowlist (private network blocking — 127.0.0.0/8, 10/8, 172.16/12, 192.168/16, link-local).
- DNS rebinding protection.
- Per-host rate limiting.
- Outbound proxy support.

These are SSRF-class hardening items. Phase 6 / a dedicated hardening slice owns them. Right now `http_request` will happily hit any reachable http/https URL — including a customer's internal infrastructure if they paste the wrong URL. Workflow authors are trusted; this is a known limitation.

### 3.8 Auth header layered last; user headers can't smuggle Authorization

When `auth.type` ∈ `{bearer, basic, apiKey}`, the canonical `Authorization` header is set AFTER the user's `headers[]` is applied. Any user-supplied `Authorization` in `headers[]` is dropped (case-insensitive). Asserted by a unit test that sets both a user `Authorization: Bearer attacker-supplied` and a bearer token — and asserts the outbound request carries `Bearer <real-token>` only.

This prevents a stale workflow config from accidentally smuggling a competing auth scheme through.

### 3.9 Non-2xx HTTP responses do NOT throw

`http_request` resolves `{status, ok, ...}` even on 404 / 500. Workflow authors branch on `output.ok` or `output.status`. This matches the `fetch` ergonomic and V1's existing behavior; the V2 contract preserves it.

Network errors / aborts DO throw — those are transport-layer failures, not application-layer signals.

### 3.10 `delay` narrow scope: setTimeout-only, ≤30s, fail loud over cap

NPD-N6 accepted: delay is in-process `setTimeout` only. The 30s ceiling fits inside Vercel's default function execution window. Above 30s requires durable queue / pause-resume infrastructure (BullMQ / Inngest / equivalent) — V2 doesn't have it, Phase 6 owns it.

Defense-in-depth: even if a malformed config bypasses the schema (e.g. a stale workflow definition saved before this schema landed), the handler throws `DelayCapExceededError` carrying the offending value. Asserted by mocking `DelayConfigSchema.parse` to return out-of-range values.

### 3.11 Variable resolution works end-to-end across native nodes

The Playwright walkthrough at [`tests/e2e/native-nodes-slice-1-walkthrough.spec.ts`](../../../tests/e2e/native-nodes-slice-1-walkthrough.spec.ts) proves all four data-passing axes named in plan §9:

- **Provider trigger → native config**: `{{trigger.payload.text}}` resolves into `http_request.queryParams[0].value` and reaches the echo server's recorded request path.
- **Native → native config**: `{{http-request.body}}` resolves into `format_transformer.content`.
- **Native → provider config**: `{{format-transformer.transformedContent}}` resolves into Slack's `chat.postMessage.text`.
- **Delay does not corrupt variable state**: `format_transformer.transformedContent` (set BEFORE the 1s delay) is still resolved by the downstream Slack action AFTER the delay completes. The engine's variables map is monotonic across the BFS — `setTimeout` does not touch it.

### 3.12 Slack normalize sets `payload = slackEvent.event` (not nested under `.event`)

Surfaced during e2e debugging: the canonical TriggerEvent.payload for Slack messages is the inner Slack `event` object verbatim. So `{{trigger.payload.text}}` works; `{{trigger.payload.event.text}}` does NOT. Same shape across all Slack triggers. Documented in the e2e spec's inline comment for future-me.

### 3.13 Native nodes register without a manifest; engine dispatches by `(provider, type)` key

The hand-maintained `ALL_HANDLERS` array in [`services/execution/handlers/_registry.ts`](../../../services/execution/handlers/_registry.ts) is the only place native handlers are wired. Engine dispatch via `getActionHandler("native", type)` works identically to provider handler dispatch. **Adding a new native action means**: write `handler.ts` + `.schema.ts` in `integrations/native/actions/`, add one entry to `ALL_HANDLERS`. No manifest, no scope changes, no migration. Confirmed by the 3 actions shipped in this slice.

---

## 4. V1 native rot inventory closed in Slice 1

Audit-numbered rows from [`docs/slices/parity/parity-native-nodes.md`](./parity-native-nodes.md) §8. Status after Slice 1:

| ID | Pattern | Status |
|---|---|---|
| N-R1 | Duplicate `executeFilter` + `executePath` orphans (both unwired single-branch conditionals) | **PERMANENT SKIP** per NPD-N10. V2 will ship exactly one `if_then_condition` in the Tier C engine-branching slice. |
| N-R2 | 8 AI action types as schema aliases for 2 generic handlers | **NOT PORTED** — Phase 5 (NPD-N7) will consolidate to one `ai_action` with a `task` discriminator, not 8 aliases. |
| N-R3 | `emailClassifier.ts` dead-code orphan | **PERMANENT SKIP** per NPD-N10. |
| N-R4 | `fileUpload.ts` dead-code orphan (superseded by P-S3 FileRef) | **PERMANENT SKIP** per NPD-N10. |
| N-R5 | `googleSearch.ts` dead-code orphan (V1 chose Tavily) | **PERMANENT SKIP** per NPD-N10. |
| N-R6 | `transformer.ts` vs `formatTransformer.ts` duplicate | **PERMANENT SKIP** per NPD-N10 — V2 only ships `format_transformer`. |
| N-R7 | No scheduled trigger in V1 | **OPPORTUNITY in Slice 2** — V2 cron infra already exists; `scheduled_trigger` lands in native-nodes Slice 2 per NPD-N2. |
| N-R8 | `hitl_conversation` provider-coupled (Discord / Slack / email hardcoded) | **NOT PORTED** — Phase 8 owns HITL (NPD-N8). On port, HITL consumes provider-tier OAuth + actions, not duplicates them. |
| N-R9 | `loop_executions` parallel state table | **NOT PORTED** — Phase 6 owns loop (NPD-N5). |
| N-R10 | Sparse V1 native test coverage | **NOT A PROBLEM in V2** — Slice 1 ships 158 native unit tests (39 http_request + 58 format_transformer + 17 delay + 4 utility) + 2 e2e scenarios + 12 precondition unit tests (3 new for the native skip). |
| N-R11 | V1 webhook trigger's provider id is `"webhook"`, not `"automation"` | **NOT APPLICABLE in Slice 1** — generic webhook trigger deferred per NPD-N3. |
| N-R12 | V1 `ai_agent` is a 656-LOC monolithic manifest | **NOT PORTED** — Phase 5 owns the AI cluster (NPD-N7); on port, V2 will split per per-action / per-trigger 4-file convention. |

---

## 5. Test totals

### Unit tests (focused)

| Suite | Tests |
|---|---:|
| `tests/unit/integrations/native/actions/httpRequest.test.ts` | 39 |
| `tests/unit/integrations/native/actions/formatTransformer.test.ts` | 58 |
| `tests/unit/integrations/native/actions/delay.test.ts` | 17 |
| `tests/unit/services/execution/handlers/registry.test.ts` (pre-existing; native entries asserted) | 47 |
| `tests/unit/services/triggers/preconditions.test.ts` (+3 new for native skip) | 12 |
| **Native-focused total** | **173** |

### E2E

| Spec | Scenarios |
|---|---|
| `tests/e2e/native-nodes-slice-1-walkthrough.spec.ts` | 2 — chained success + schema-fail |

Playwright runtime: **31.2 s** for both scenarios, workers=1. CI=1 retries=2 (both pass first attempt).

### Full project totals after Slice 1

- `npm test`: **7087 / 7087 passing** (delta: +147 over Native-pre-Slice-1 baseline).
- `npx tsc --noEmit`: clean.
- `npm run lint`: clean (1 pre-existing max-lines warning at `_registry.ts:479` — registered handler list growing; unrelated to native).
- `npm run lint:structure`: OK.
- `npm run lint:migrations`: OK.

---

## 6. What remains for Phase 2 native-nodes

### Slice 2 — Tier B native triggers + run-now API

- `native:manual_trigger` (Q11-required input shape; `POST /api/workflows/[id]/run-now` API per NPD-N1).
- `native:scheduled_trigger` (cron-expression validation; reuses V2's existing cron infra per NPD-N2).
- Native trigger registry (parallel to `services/triggers/pollingRegistry.ts`).

Estimated effort: ~4-6 commits per the audit §12.

### Engine-branching slice (prerequisite for Slice 3)

- `WorkflowEdge.label?: string` widening.
- `ActionHandlerResult.branchTaken?: string | null`.
- Label-aware BFS in `services/execution/engine.ts`.
- Skip-rest semantics when `branchTaken: null`.

Estimated effort: ~3-4 commits per the audit §12.

### Slice 3 — Tier C native control-flow (after engine branching)

- `native:if_then_condition` (single-branch with skip-rest).
- `native:router` (N-label generalization).

Estimated effort: ~4 commits per the audit §12.

### Deferred — NOT Phase 2 scope

- `loop` (NPD-N5 — Phase 6).
- `wait_for_event` (Phase 6).
- Unbounded / durable `delay` (NPD-N6 — Phase 6).
- AI cluster `ai_agent` + 7 sub-actions + `tavily_search` (NPD-N7 — Phase 5).
- `hitl_conversation` (NPD-N8 — Phase 8).
- `parse_file` / `extract_website_data` (NPD-N9 — pending product signal).
- Generic webhook trigger (NPD-N3 — pending product signal).
- 6 V1 orphan handlers (NPD-N10 — PERMANENT SKIP).
- SSRF / private-network / outbound proxy hardening for `http_request` (deferred to a dedicated hardening slice).

---

## 7. Cross-chat coordination notes

This slice ran alongside an active **Outlook Mail 2.2** chat that was concurrently editing `services/execution/handlers/_registry.ts`. Three coordination events worth recording:

1. **Commit 2 sweep-in.** The parallel chat appended a `fetch_emails` import + registry entry to `_registry.ts` between my pre-commit isolated-state test and my `git add`. My Commit 2 (`924f06043`) accidentally captured those 5 lines. The Outlook chat's working-tree manifest test was also expecting `fetch_emails` to be present, so full jest reported 1 failing test until reconciled.

2. **Corrective commit.** `ed50446f7 fix(native): remove swept-in outlook registry entry` restored the registry to the intended Slice-1-only state by removing exactly the 5 swept-in lines (1 import + 4-line registry-entry block with comment). Native entries preserved verbatim. The Outlook chat's untracked source files (`fetchEmails.ts`, `fetchEmails.schema.ts`, `listMessages.ts` and their tests) were not touched — they remained working-tree WIP for the Outlook chat to commit themselves.

3. **Outlook chat reconciliation.** The Outlook chat subsequently committed their work as `79ebd4a77 feat(outlook-mail): add fetch_emails action` (re-adding the registry lines legitimately) and `699964d71 docs(outlook-mail): document 2.2 outcomes`. After their landing, full jest returned to 7087 / 7087 passing without any further native-side intervention.

**Durable rule for concurrent-chat work:** when editing a shared hand-maintained registry (`services/execution/handlers/_registry.ts`, `integrations/_registry.ts`, etc.) under parallel chats, isolate the diff at `git add` time by re-reading the file immediately before staging, NOT relying on a snapshot from earlier in the session. Use a final `git diff --cached` check to confirm the staged hunks match expectations before committing.

---

## 8. Exit checklist

- [x] All 3 native handlers + schemas + unit tests committed (Commits 1, 2, 3).
- [x] Registry entries in [`services/execution/handlers/_registry.ts`](../../../services/execution/handlers/_registry.ts) under `provider: "native"`.
- [x] Structure test exempts `native/` (Commit 1).
- [x] Activation precondition exempts `native` (Commit 4 bug fix).
- [x] No engine changes / no contract widening / no migrations.
- [x] Variable resolution proven across provider ↔ native ↔ provider via Playwright walkthrough (Commit 4).
- [x] Delay does not corrupt variable state (Commit 4 walkthrough explicit assertion).
- [x] Schema-fail paths surface `HANDLER_FAILED` via engine wrapping (Commit 4 walkthrough schema-fail scenario + Commit 1/2/3 unit tests).
- [x] No new runtime dependencies introduced.
- [x] No log lines from any native handler.
- [x] Bounded outputs everywhere; no raw response spread.
- [x] Q11 explicit-method / explicit-targetFormat / explicit-seconds enforced at schema layer.
- [x] All gates green: tsc, lint, lint:structure, lint:migrations, full jest (7087 / 7087), Playwright (2 / 2).
- [x] Outcomes doc (this file) landed (Commit 5).

**Native Slice 1 complete. Next: Slice 2 (Tier B native triggers) once Marcus signals to start.**
