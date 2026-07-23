# 5.MCP-ARCH-1 — MCP Integration Layer: Platform Architecture & Product Design Plan

**Type:** Planning / design only. **No source, migrations, tests, UI, or behavior
changes in this slice. Nothing pushed.**
**Date:** 2026-07-22
**Branch:** `v2-main` (local, unpushed)

**Source of truth (verified current state):**
[integrations/_registry.ts](../../../integrations/_registry.ts) (provider manifests, hand-maintained, Zod-validated at load) ·
[contracts/integration.ts](../../../contracts/integration.ts) (`ProviderManifestSchema`, `AuthFlowSchema` = `code_callback | token_ingest | token_paste | machine_credentials`, `ProviderOAuth` interface) ·
[contracts/actionMeta.ts](../../../contracts/actionMeta.ts) (`ActionMeta` / `FieldMeta` / `OutputMeta` — the builder's entire input) ·
[services/discovery/_registry.ts](../../../services/discovery/_registry.ts) + [_metaInventory.ts](../../../services/discovery/_metaInventory.ts) (meta discovery registry) ·
[services/execution/handlers/_registry.ts](../../../services/execution/handlers/_registry.ts) + [_handlerInventory.ts](../../../services/execution/handlers/_handlerInventory.ts) (`provider:type` → handler map) ·
[services/execution/engine.ts](../../../services/execution/engine.ts) (dispatch, credential plan, error classification) ·
[workflow-engine/variables/resolveValue.ts](../../../workflow-engine/variables/resolveValue.ts) (variable resolver — engine pre-resolves config; handlers never see `{{...}}`) ·
[services/options/_registry.ts](../../../services/options/_registry.ts) + [resolveOptionsSource.ts](../../../services/options/resolveOptionsSource.ts) (option resolvers, `GET /api/options/[source]`) ·
[core/integrations/credentialSharing.ts](../../../core/integrations/credentialSharing.ts) (`personal | account` classification — the Member-Identity vs Shared-Workspace model) ·
[services/oauth/dispatcher.ts](../../../services/oauth/dispatcher.ts) + [refreshAndRetry.ts](../../../services/oauth/refreshAndRetry.ts) (generic OAuth infra, token encryption via [core/encryption/tokens.ts](../../../core/encryption/tokens.ts)) ·
[integrations/_shared/mcp/client.ts](../../../integrations/_shared/mcp/client.ts) + [errors.ts](../../../integrations/_shared/mcp/errors.ts) + [sanitize.ts](../../../integrations/_shared/mcp/sanitize.ts) + [drift.ts](../../../integrations/_shared/mcp/drift.ts) (**existing outbound MCP client**, Streamable HTTP, protocol `2025-06-18`, typed errors, secret scrubbing, pinned-schema drift refusal) ·
[integrations/eden/](../../../integrations/eden/) + [integrations/_shared/eden/api/_client.ts](../../../integrations/_shared/eden/api/_client.ts) (**the in-repo precedent: an MCP-server-backed provider shipped as normal typed actions**) ·
[services/mcp/server.ts](../../../services/mcp/server.ts) (inbound public MCP server — ChainReact AS a server; unrelated surface, kept distinct) ·
[services/ai-guidance/capabilityCatalog.ts](../../../services/ai-guidance/capabilityCatalog.ts), [validateWorkflowPlan.ts](../../../services/ai-guidance/validateWorkflowPlan.ts), [providerSelection/providerSelectionGuard.ts](../../../services/ai-guidance/providerSelection/providerSelectionGuard.ts), [gateway/buildGatewayGuidancePrompt.ts](../../../services/ai-guidance/gateway/buildGatewayGuidancePrompt.ts) (React Agent planning layer) ·
[core/workflows/requiredFields.ts](../../../core/workflows/requiredFields.ts) (readiness / setup-needed) ·
[contracts/workflowDefinition.ts](../../../contracts/workflowDefinition.ts) (node = `{provider, type, config}`) ·
[integrations/native/actions/httpRequestEgress.ts](../../../integrations/native/actions/httpRequestEgress.ts) (SSRF/egress hardening precedent) ·
[docs/rules/file-output-contract.md](../../rules/file-output-contract.md) · [docs/rules/token-ingest-auth.md](../../rules/token-ingest-auth.md)

Repo state was mapped this session by direct inspection of the files above (partly via
parallel research passes over the provider/auth, builder, engine/trigger, and AI layers).
External-landscape claims in §5 and §15 come from web research dated 2026-07-22 and are
cited inline; anything not confirmed from a primary source is marked **[unverified]**.

---

## 1. Context

ChainReact V2 ships 33 native provider manifests today. The product goal is to grow to
100+ supported applications without diluting the configuration-quality bar (CLAUDE.md
rule 17: builder completion IS provider completion). MCP (Model Context Protocol) is the
industry's emerging vendor-hosted integration surface: as of mid-2026, ~30 significant
SaaS vendors run official remote MCP servers with OAuth (Atlassian, Linear, Stripe,
PayPal, HubSpot, Intuit/QuickBooks, Notion, ClickUp, Monday, Canva, Figma, Dropbox, …).

This plan designs MCP as a **second integration layer** underneath the existing product:

- Native integrations remain first-class and unchanged.
- **ChainReact Catalog MCP apps**: personally reviewed by Marcus, compiled into the same
  registries native providers use, indistinguishable from native in the Apps page,
  builder, engine, and React Agent.
- **Customer Custom MCP** (paid, later): customers connect their own MCP servers;
  ChainReact performs technical validation only; clearly separated from the catalog.

Core product philosophy honored throughout: **users connect APPS; ChainReact connects
PROTOCOLS.** The word "MCP" should almost never appear in the product UI for catalog
apps.

### 1.1 Reconciling the 2026-06-12 durable decision ("MCP stays external")

`docs/PROJECT_MEMORY.md` records (AI-credits decision, 2026-06-12): *"**MCP stays
external** (in-app agent never calls MCP)."* That decision governed the **agent
runtime**: the in-app React Agent must never execute arbitrary MCP tool calls as part of
a chat loop. This architecture **preserves that invariant**:

- The React Agent continues to plan against registry `provider:type` keys and never
  invokes `tools/call`.
- MCP tool execution happens **only inside the workflow engine**, through registered,
  typed, `.strict()`-schema'd action handlers — exactly like the shipped Eden provider.

Recommendation: when this arc lands, amend the memory wording to "the in-app agent never
calls MCP tools directly; MCP-backed *workflow actions* execute through the engine's
typed handler registry" (route via the memory-curator skill; not done in this slice).

---

## 2. Current codebase findings (verified)

### 2.1 The extension seams already exist

1. **Action identity is a string pair.** A workflow node is `{provider, type, config}`
   ([contracts/workflowDefinition.ts](../../../contracts/workflowDefinition.ts));
   dispatch is `getActionHandler(provider, type)` over a frozen map built from an
   explicit inventory
   ([services/execution/handlers/_registry.ts](../../../services/execution/handlers/_registry.ts)).
   Nothing in the engine knows or cares what transport a handler uses.
2. **The builder consumes pure metadata.** Every configuration surface — Setup/Advanced
   tabs, field renderers, readiness, variable picker, at-a-glance summaries — is driven
   by Zod-validated `ActionMeta`/`TriggerMeta` served from
   [services/discovery/_registry.ts](../../../services/discovery/_registry.ts). A
   provider whose metas exist renders with **zero builder changes**.
3. **A generic outbound MCP client is already shipped.**
   [integrations/_shared/mcp/client.ts](../../../integrations/_shared/mcp/client.ts) —
   JSON-RPC 2.0 over Streamable HTTP, protocol `2025-06-18`, `initialize`/`tools/list`/
   `tools/call`, SSE + JSON parsing, `Mcp-Session-Id` handling, idempotent-only retries,
   typed error taxonomy ([errors.ts](../../../integrations/_shared/mcp/errors.ts):
   `McpAuthError`, `McpPermissionError`, `McpRateLimitError`, `McpToolNotFoundError`,
   `McpTransportError`, `McpProtocolError`), secret scrubbing
   ([sanitize.ts](../../../integrations/_shared/mcp/sanitize.ts)), and **pinned-schema
   drift refusal** ([drift.ts](../../../integrations/_shared/mcp/drift.ts) —
   `detectSchemaDrift` compares certified vs live `inputSchema` top-level
   properties/required and refuses with `McpSchemaDriftError` before sending uncertified
   args).
4. **Eden is the working precedent.** `integrations/eden/` is a full provider whose API
   layer is an MCP server (`https://mcp.eden.so/mcp`): every action is a normal typed
   `ActionHandler` with `.strict()` schema + `.meta.ts`, calling through
   [integrations/_shared/eden/api/_client.ts](../../../integrations/_shared/eden/api/_client.ts),
   which bridges MCP errors into the canonical auth UX (`McpAuthError` →
   `Unauthorized401Error` → `refreshAndRetry` → reconnect flow). Auth is `token_paste`.
   The provider is `isExperimental: true`. **MCP-ARCH-1 is largely "generalize the Eden
   pattern and add real OAuth + a compiler + a repeatable pipeline."**
5. **The connection model is already two-tier.**
   [core/integrations/credentialSharing.ts](../../../core/integrations/credentialSharing.ts)
   classifies every provider `account` (shared workspace: Slack, HubSpot, QuickBooks,
   Stripe, Motive…) or `personal` (member identity: Gmail, Outlook, Calendar…), with a
   coverage test forcing explicit classification. This IS the requested Shared-Workspace
   vs Member-Identity model; MCP apps just get classified like everyone else.
6. **OAuth infra is generic.** [services/oauth/dispatcher.ts](../../../services/oauth/dispatcher.ts)
   is provider-agnostic; per-provider `ProviderOAuth` implementations plug in
   `buildAuthUrl`/`handleCallback`/`refreshToken`/`revoke`. Tokens are AES-256-GCM
   encrypted app-side ([core/encryption/tokens.ts](../../../core/encryption/tokens.ts));
   the `integrations` table is service-role-only (V2-READY-47/50/51/52); 401s route
   through `refreshAndRetry` with one refresh + retry and `needs_reconnect_at` marking.
7. **Engine credential path is transport-agnostic.** The engine computes an effective
   credential owner per node (`buildWorkflowCredentialPlan` /
   `loadAcceptedNodeOwners`) and runs the handler inside
   `runWithCredentialResolutionContext`; handlers look up `(accountId, provider,
   providerAccountId)` and decrypt. An MCP-backed handler participates identically.
8. **AI visibility is derived, not declared.** The React Agent's capability catalog
   ([capabilityCatalog.ts](../../../services/ai-guidance/capabilityCatalog.ts)) is built
   from `listAllActionMetas()`/`listAllTriggerMetas()`; `validateWorkflowPlan` /
   `validateWorkflowPatch` reject anything not in the registry; the provider-ambiguity
   guard already enforces "a generic capability word never auto-selects a provider."
   New catalog apps become plannable-and-validated automatically the moment their metas
   register.

### 2.2 What does NOT exist yet

- No **MCP OAuth 2.1 client** (authorization-server discovery, Dynamic Client
  Registration, resource indicators). Eden uses a pasted PAT.
- No **schema compiler** (JSON Schema → `FieldMeta[]`/`OutputMeta[]`) — Eden's metas were
  hand-authored from a captured `tools/list`.
- No **import/certification pipeline** (capture → generate → review → commit) as
  tooling; the Eden flow was manual.
- No **proactive drift sweep** (drift is checked per-call, refuse-on-drift only).
- No **semantic capability layer** for the React Agent (plans against concrete keys +
  category synonyms only).
- No **customer-supplied server** support of any kind (no tables, no UI, no validation).
- **Guided Stops are not shipped code** — they are a design element of the Document
  Builder plan (`dual-builder-document-visual-plan.md`); only the read-only Document
  view (CS-1, `c823f9bbf`, flag `ENABLE_DOCUMENT_BUILDER`) exists. This plan therefore
  targets the *shipped* config surfaces (SchemaForm/ConfigModalShell/readiness); Guided
  Stops inherit MCP nodes for free later because they re-host the same renderers.
- The **inbound** public MCP server (`services/mcp/`, `app/mcp/route.ts`, `crmcp_`
  tokens) is ChainReact acting as a *server* for external AI hosts. It shares nothing
  with this plan except the name; the doc keeps the surfaces strictly separate.

---

## 3. Product / model decision

**What this is:**

- A second *sourcing mechanism* for catalog apps: instead of hand-writing an API wrapper
  per endpoint, ChainReact compiles a vendor's certified MCP tool subset into ordinary
  V2 provider artifacts (manifest, `.meta.ts`, `.schema.ts`, handlers, option
  resolvers), which Marcus reviews and commits. Users see "ServiceTitan — Connect", not
  "Connect MCP Server". Nodes say "Create Customer in ServiceTitan", never `tools/call`.
- A per-app curation gate: only Marcus-approved tools become catalog nodes; approved
  tools are pinned by schema hash; new server tools never appear automatically.
- Later, a paid **Custom MCP** feature for customers' own servers — technically
  validated, clearly badged, never mixed into the reviewed catalog.

**What this is deliberately NOT:**

- NOT a generic "MCP Tool" node, a raw JSON args editor, or a runtime-discovered
  tool palette (violates rules 1–4 and the invisible-protocol philosophy).
- NOT a replacement for native providers. Where an official MCP server is missing
  (ServiceTitan, Fleetio — confirmed absent as of 2026-07-22, §15), native REST
  integration remains the path.
- NOT an agent-runtime tool bus. The React Agent never calls MCP (§1.1).
- NOT auto-publishing: catalog apps deploy through the normal commit → Marcus-approved
  push pipeline, same as native providers.
- NOT (in phase 1) MCP triggers. Actions only; native triggers compose with MCP actions
  for free because MCP actions are ordinary actions.

---

## 4. Recommended approach

### 4.1 Two tiers, two mechanisms

| | Tier 1 — Catalog apps | Tier 2 — Customer Custom MCP (paid, later) |
|---|---|---|
| Trust | Marcus-reviewed, certified | Customer's own; technical validation only |
| Where metadata lives | **Compiled into the repo** (normal `.meta.ts`), deployed | DB rows per account (pinned tool snapshots) |
| Node identity | Real provider id (`linear:create_issue`) | `custom-mcp` pseudo-provider (§10) |
| Builder UX | Indistinguishable from native | Same field renderers; card/nodes badged "Custom" |
| New-tool appearance | Never automatic (allowlist = committed code) | Never automatic (per-account pinned allowlist) |
| DB changes | **None** | 2 new tables (§8.3) |

The catalog tier deliberately reuses the repo's strongest invariant — *every registry is
hand-maintained, Zod-validated at module load, duplicate-rejecting, frozen* — instead of
introducing a dynamic catalog store. Cost: adding a catalog app requires a deploy.
That is acceptable and even desirable: Marcus reviews every app anyway, and deploys are
the existing ship mechanism.

### 4.2 MCP connection manager (auth)

**Reuse the `integrations` table and OAuth dispatcher wholesale.** Add a shared helper
family `integrations/_shared/mcp/oauth.ts` implementing the remote-MCP authorization
flow per spec 2025-06-18:

- Protected Resource Metadata discovery (RFC 9728) → authorization server metadata
  (RFC 8414) → PKCE code flow with resource indicators (RFC 8707).
- Client registration strategy, per app: **prefer static registration** (vendor
  dashboard app, client id/secret in env — Linear supports this) and fall back to
  **Dynamic Client Registration (RFC 7591)** where the vendor offers no dashboard. DCR
  results (client_id, optional secret, issuer) are platform-level, not per-account —
  store in env after a one-time registration run in phase 1; add a small
  `mcp_oauth_clients` table only if/when a DCR-only vendor forces automation.
  Client ID Metadata Documents (CIMD, spec 2025-11-25+) noted as the forward path —
  publishing one static JSON document is cheap; design the helper so CIMD slots in.
- Each catalog app then ships a thin `ProviderOAuth` implementation delegating to the
  shared helper — registered in `OAUTH_BY_PROVIDER` like any provider. Tokens land
  encrypted in `integrations` via `upsertActive`; refresh flows through the standard
  dispatcher `refreshToken` + `refreshWithClaim`; 401s through `refreshAndRetry`.
- Manifest gains one optional block (extend `ProviderManifestSchema`):
  `mcp: { serverUrl: string; protocolVersion: string }` — declaration only, no behavior;
  superRefine: `mcp` requires `capabilities.actions` honesty like everything else.
- `authFlow` stays `code_callback` for OAuth'd MCP servers (the dispatcher flow is
  identical); PAT-style servers keep using `token_paste` (Eden precedent).

**Connection model:** each catalog MCP app gets an explicit
`credentialSharing` entry (`account` → one shared connection per account, e.g. a future
ServiceTitan; `personal` → member identity, multiple rows per account, e.g. an
email-like app). The coverage test already forces the decision. Team permission
semantics (22B creator-pinning, sharing scopes, offboarding) apply unchanged because the
credential rows are ordinary `integrations` rows.

**Spec-version posture:** build against 2025-06-18 (what production vendor servers speak
today) but architect stateless: treat `Mcp-Session-Id` as optional transport detail
(client already does), never persist session state, keep per-call `initialize`
tolerance. The 2026-07-28 revision (final in days; stateless core, `server/discover`,
`tools/list` `ttlMs` cache hints, `subscriptions/listen`) is then an incremental client
upgrade, not a redesign. **[Spec-timeline per official RC announcement,
modelcontextprotocol.io, fetched 2026-07-22.]**

### 4.3 MCP discovery + schema compiler (build-time, catalog tier)

New dev tooling `scripts/mcp-import/` (CLI, never shipped to runtime) + a pure core
module `core/mcpCompile/` (JSON-Schema → V2 metadata mapping; pure so it is unit-testable
and reusable at runtime later for Tier 2):

1. **Capture**: connect to the vendor server (dev credentials), run `tools/list`,
   snapshot every tool's name/description/`inputSchema`/`outputSchema`(if any) to
   `integrations/<app>/mcp-snapshot.json` with per-tool SHA-256 schema hashes.
2. **Curate (decision file)**: Marcus edits `integrations/<app>/mcp-catalog.ts` — the
   allowlist: which tools ship, each with ChainReact-facing identity (`type`,
   `displayName`, category, risk level, credentialSharing-relevant notes), ship/skip/defer
   rationale (satisfies the provider-addition gate's catalog requirement).
3. **Compile**: for each approved tool, generate scaffold artifacts:
   - `.schema.ts` — `.strict()` Zod config schema derived from `inputSchema`;
   - `.meta.ts` — `FieldMeta[]` via the mapping table below + `OutputMeta[]` from
     `outputSchema` (or a curated bounded shape);
   - `<action>.ts` — thin typed handler delegating to the shared executor (§4.5);
   - option-resolver stubs where the catalog file maps a field to a list-tool
     (§4.6).
4. **Review & hand-tune**: generated metas are STARTING POINTS. The configuration-design
   audit (rule 17 sub-bullet: classify every field) happens here — labels, descriptions,
   `advanced`, `visibleWhen`, `sensitivity`, `defaultValue`, category, at-a-glance
   summary fields are human decisions. Compiler output that can't meet the bar (opaque
   free-text id fields with no resolvable source) **fails catalog approval for that
   tool** rather than shipping a raw text box.
5. **Register**: normal inventory entries (`_metaInventory.ts`, `_handlerInventory.ts`,
   `_registry.ts` manifests, options registry). All existing structural tests
   (duplicate keys, option-source integrity, credential-sharing coverage) apply.

**JSON Schema → FieldMeta mapping (core rules):**

| JSON Schema shape | FieldMeta |
|---|---|
| `string` | `text` (curator may upgrade to `textarea`/`datetime`/`optionsSource` picker) |
| `string` + `enum` | `select` with static `options` |
| `string` + `format: date-time/date` | `datetime-utc` / `date` |
| `boolean` | `boolean` |
| `number` / `integer` (+bounds) | `number` + `numeric` bounds |
| `array` of `string` | `string-array` |
| `array` of flat `object` | `object-list` + `itemFields` (sub-fields recurse one level) |
| flat `object`, fixed keys | `object` + `itemFields` |
| `required` array | `required: true` (Q11: no silent defaults; a server-side default the user should see becomes `defaultValue`) |
| `anyOf`/`oneOf` unions, `$ref` cycles, deep nesting | **flagged `NEEDS_MANUAL`** — curator splits into typed actions or mode fields with `visibleWhen`; never a raw `json` Setup field |

Full JSON Schema 2020-12 (2026-07-28 spec loosening) is future-proofed by the
`NEEDS_MANUAL` escape: anything the mapper can't express cleanly requires curation, by
design.

**Outputs:** `outputSchema` → recursive `OutputMeta` tree. Absent `outputSchema` (common
— adoption is patchy across vendors): during certification, capture representative
`structuredContent`/text results and hand-author a **bounded** output shape; text-only
tools get a single `{ name: "text", type: "string" }` output. The executor builds
outputs from the declared key set only — never spreads a raw result (rule 5), never
leaks provider URLs (rule 7), and any file-like content routes through FileRef staging
per [file-output-contract](../../rules/file-output-contract.md) (expected to be rare in
phase 1; tools returning bulk binary content are skip/defer candidates at curation).

### 4.4 Catalog approval workflow (the repeatable pipeline)

```
Marcus picks app
  → scripts/mcp-import capture   (tools/list snapshot + hashes)
  → mcp-catalog.ts decisions     (ship / skip / defer per tool)
  → scripts/mcp-import generate  (scaffold: schemas, metas, handlers, resolver stubs)
  → human curation pass          (configuration-design audit, rule 17)
  → tests (runtime + builder metadata + resolver + structure)
  → local commit (isExperimental: true — hidden from Apps catalog)
  → owner setup (vendor OAuth app, env vars)
  → live certification (Phase 13 analog: real connect, real tool calls, smoke fixtures)
  → flip isEnabled/isExperimental + Marcus-approved push → production catalog
```

This is the provider-addition skill with steps 3–7 partially automated; the Owner Report
contract, `v2-pattern-audit.md`, and roadmap-entry requirements stay in force. Update
the provider-addition skill with an "MCP-backed provider" branch when CS-3 lands
(Living Documentation Rule; routed via skill-curator).

### 4.5 Execution architecture

One shared executor, `integrations/_shared/mcp/executeTool.ts` (generalizing Eden's
`_client.ts` bridge):

```
generated handler (per action)
  → parse input.config with .strict() Zod          (engine already resolved {{...}})
  → map V2-shaped config → tool arguments           (pure, per-action mapping)
  → refreshAndRetry(accountId, provider, …)         (token decrypt + 401 refresh)
    → McpClient.callTool(serverUrl, tool, args, {
        pinnedSchemaHash / pinnedSchema,            (drift refusal BEFORE send — drift.ts)
        timeoutMs, maxResponseBytes })
  → validate result (structuredContent vs outputSchema when present)
  → build BOUNDED output from the declared OutputMeta key set
  → return { output }                               (throw on failure — rule 8)
```

- Error taxonomy: existing [errors.ts](../../../integrations/_shared/mcp/errors.ts)
  mappings hold (`McpAuthError` → `Unauthorized401Error` → `INTEGRATION_REAUTH_REQUIRED`;
  `McpPermissionError` → `InsufficientScopeError`; `McpRateLimitError` /
  `McpTransportError` timeouts → `TRANSIENT_PROVIDER_ERROR`; `McpSchemaDriftError` → new
  typed classification, §4.8). `core/errors/humanizeActionError.ts` gains safe copy +
  CTA for the drift case (`contact_support`-class; no raw provider text).
- Enforce a per-call `AbortSignal` timeout and a bounded response size in the executor
  (the cron fan-outs already use 25s bounds; provider wrappers currently vary — the MCP
  executor should be uniformly bounded from day one).
- Elicitation / `input_required` (MRTR in the 2026-07-28 spec): the engine is headless —
  **policy = fail the step** with a humanized "this provider needs information ChainReact
  didn't send" error. Tools known to elicit are skip/defer candidates at curation.
- Test-mode gate applies automatically (`requiresIntegration: true` ⇒ blocked in test
  runs with mock output).
- No VM sandboxing (consistent with all providers); isolation is contractual — fixed
  server URL from the committed manifest, typed args, bounded outputs, scrubbed logs.

### 4.6 Provider-resource discovery (option sources)

MCP has no native "options" concept. Two sources, decided per field at curation:

1. **List-tool-backed resolvers**: where the server exposes list/search tools
   (`list_teams`, `list_projects`, `list_users` — Linear has these), ship normal
   `OptionsResolver`s (`linear:teams`, `linear:projects`) that call the list tool
   through the same shared client + `refreshAndRetry`, mapping results to
   `{value, label}` with `hasMore`. Registered in
   [services/options/_registry.ts](../../../services/options/_registry.ts); served by
   the existing route; credential-sharing policy enforced by the existing
   `resolveOptionsSource` path. `dependsOn` cascades work as usual (e.g. `project`
   depends on `team`).
2. **Static enums** from the tool schema → static `options` (no resolver needed).

Where neither exists for a **common-path required identifier**, the tool fails catalog
approval (rule 17: a missing resolver is implementation work, not a relabeling
opportunity). Manual-id entry stays available in Advanced for power users, as today.

### 4.7 Builder & variable integration

**Zero new builder surface.** Because compiled metas are ordinary `ActionMeta`:

- Setup/Advanced progressive disclosure, `visibleWhen`, readiness ("setup needed"),
  validation, node styling, provider icon (`public/integrations/<app>.svg`),
  at-a-glance summaries (`nodeConfigSummary` with resource labels from picker cache),
  and the variable picker (outputs → `{{nodeId.field}}`) all work by construction.
- No raw JSON editors on Setup (rule 4: `json` type is Advanced-only and the compiler
  never emits it for Setup; flat objects use the `object` editor).
- Apps page + node picker: standard manifest visibility (`isEnabled`,
  `isExperimental`, `hasMetadata`). Connect button runs the standard OAuth connect
  route. Nothing says "MCP".
- Guided Stops (future Document Builder) re-host these same renderers, so MCP nodes
  inherit them with no extra work when that arc ships.

### 4.8 Schema drift handling

Three layers, first two already proven in-repo:

1. **Allowlist = committed code.** New server tools cannot appear; removed/renamed tools
   simply keep failing closed (layer 2) until re-certified.
2. **Per-call drift refusal** (shipped): pinned certified `inputSchema` vs live schema;
   removed fields or newly-required fields ⇒ `McpSchemaDriftError`, never send
   uncertified args ([drift.ts](../../../integrations/_shared/mcp/drift.ts)). Surfaced
   to users through the failed-run classification path
   ([failed-run-recovery](../../rules/failed-run-recovery.md)) with a safe reason and a
   support CTA; runs using other tools of the same app are unaffected.
3. **Proactive drift sweep** (new): `scripts/mcp-import check` compares live
   `tools/list` against every committed snapshot (hash compare; cheap) — run by Marcus
   on demand, plus an optional low-frequency cron (daily) that only **logs/ops-alerts**
   (no user-facing state without review). On breaking drift Marcus re-runs the pipeline
   for the affected tools (re-certify → forward commit). The Asana-MCP V1→V2 shutdown
   (60% tool reduction in ~6 months) is the cautionary tale: treat vendor MCP catalogs
   as churn-prone, unlike REST APIs.

Existing workflows referencing a drifted/re-certified action enter the normal
needs-attention surfaces: readiness recompute against updated required fields (schema
change ⇒ `missingRequiredFields` lights up in builder + activation gate) and failed-run
CTAs for in-flight breakage. No new "Needs Attention" machinery is required in phase 1.

### 4.9 React Agent semantic layer

Today the agent plans against concrete `provider:type` keys with category-synonym
narrowing and a hard provider-ambiguity guard (verified §2.1.8). Additive design:

1. **Semantic capability tags**: optional `capabilities?: string[]` on
   `ActionMeta`/`TriggerMeta` (closed vocabulary in `contracts/` — e.g. `send_email`,
   `send_message`, `create_customer`, `create_invoice`, `create_task`,
   `schedule_appointment`, `find_record`, `update_record`, `create_employee`). Zod
   validates against the vocabulary; a structure test keeps tags meaningful (no
   free-text). Backfill native metas incrementally; every new MCP app tags at curation.
2. **Capability index** in `services/ai-guidance/`: `capability → [provider:type…]`,
   built from the registry like `capabilityCatalog` is today; rendered into the prompt
   as "business capabilities" with implementations, replacing nothing — concrete keys
   remain the plan/patch contract that `validateWorkflowPlan` enforces.
3. **Selection priority** (prompt rules + deterministic guard extension), exactly the
   product spec: (1) implementation already on the current canvas → reuse it;
   (2) connected implementation → propose it and say why (the existing guard already
   forces "connected ≠ selected" confirmation on ambiguity); (3) available catalog app →
   plan it as a setup-needed node (already supported: plans with unconnected providers
   flow to `agentReadiness` → `connect_app` blockers); (4) genuinely ambiguous → ask
   (existing `ProviderClarification`). "Never limit planning to connected apps" is
   already true and stays true.

No Hermes/gateway contract change; this is prompt-context + metadata + one deterministic
index. MCP actions get agent parity automatically even before the semantic layer ships,
because they're registry actions.

### 4.10 Output normalization

- Bounded outputs per §4.3/§4.5; `OutputMeta.sensitive` honored by run-detail redaction.
- Pagination: list-shaped tools that return cursors surface `nextCursor` + `hasMore`
  per rule 9 (single page; authors loop). Tools with vendor-shaped paging links are
  normalized in the per-action mapping (never expose provider URLs).
- Text-only tools: one `text` output; the variable picker shows it plainly. Curation
  prefers structured tools; text-blob-only tools are weak catalog candidates and may be
  skipped (§15 schema-quality findings).

---

## 5. Alternatives considered

| Option | UX quality | Security/trust | Eng. cost | Catalog growth | Consistency w/ V2 invariants | Verdict |
|---|---|---|---|---|---|---|
| **A. Compiled-to-repo catalog (chosen)** | Native-identical | Marcus-reviewed, pinned schemas | Medium (compiler + pipeline once; small per app) | ~1 app per short slice after CS-3 | Perfect (same registries, load-time validation, frozen) | **Accepted** |
| B. DB-dynamic catalog (tools/list → DB → runtime metadata) | Risk of "generated form" feel | Runtime mutation of catalog; weakens allowlist story | High (discovery registry, builder hooks, caching all become dynamic) | Fastest theoretical | Breaks the hand-maintained/frozen-registry invariant everywhere | Rejected for catalog; **its machinery is Tier 2's design** (account-scoped, badged, paid) |
| C. Generic "MCP Tool" node (pick server + tool + JSON args) | Poor — exactly the auto-generated UX the brief forbids | Raw payload authoring | Low | High but hollow | Violates rules 1–4, 17 | Rejected |
| D. Aggregator MCP (Zapier/Pipedream wrappers) for reach | Mediocre (their forms/semantics) | Third party inside the credential path; per-call metering | Low | Instant 1000s | Off-brand for a reviewed catalog | Rejected for catalog. Noted as the only near-term route to apps with no official server (ServiceTitan/Fleetio) — do not take it without an explicit trust decision |
| E. Native-only (status quo) | Best possible | Best | Highest per app | ~30 → slow | N/A | Rejected as sole path — cannot reach 100+ |

Also considered: exposing catalog MCP apps through a single shared handler keyed by
config (`mcp:call` + tool name in config) — rejected; it is option C wearing a trench
coat (breaks per-action risk metadata, test-mode gating, readiness, and the agent's
capability keys).

---

## 6. Security / data model

- **Tokens**: unchanged — AES-256-GCM in `integrations`, service-role-only access,
  dispatcher-canonical writes. MCP OAuth tokens are ordinary OAuth tokens.
- **Egress**: catalog servers are fixed HTTPS URLs committed in manifests — no
  user-influenced destinations. Tier 2 (custom servers) MUST reuse the
  [httpRequestEgress](../../../integrations/native/actions/httpRequestEgress.ts) SSRF
  hardening (scheme allowlist, RFC-1918/loopback/link-local/metadata-IP blocking,
  DNS re-check, no auto-redirects, fail-closed DNS) at both validation time and
  call time.
- **No-leak**: `scrubSecrets` on every MCP error/log path (shipped); humanized failures
  only; no raw provider payloads, hosts, or schemas in client-visible errors; drift
  reasons are field-name-only (already true in drift.ts).
- **Prompt-injection surface**: tool descriptions/results from vendor servers are data,
  not instructions — they are never fed to the React Agent as instructions (the agent
  sees only curated ChainReact metadata; run outputs go to the variable system, not to
  prompts). This is a real MCP-ecosystem attack class the compiled-catalog design
  sidesteps by construction; Tier 2 must keep the same rule.
- **Rate limiting**: engine-side no change for catalog (vendor 429 → transient error).
  Tier 2 adds per-account outbound call budgeting (reuse the durable fixed-window
  pattern from `services/apiKeys/rateLimit.ts`) — customers' servers must not become a
  free compute/egress primitive.
- **RLS/grants**: no changes for catalog (no new tables). Tier 2 tables follow the
  sensitive-table posture: service-role-only, membership-gated routes, allow-listed
  DTOs, secrets write-only (chainreactv2-security-review applies to that slice).

### 6.1 Recommended database additions

**Phase 1–2 (catalog): NONE.** Pinned schemas/hashes live in committed
`mcp-snapshot.json` + generated code; connections in `integrations`; certification state
in docs (as with native providers). This is a feature: no migration risk on the launch
path.

**Custom MCP phase (Tier 2, later — sketch, own security-reviewed plan required):**

```sql
account_mcp_servers (
  id uuid PK, account_id FK, name text, server_url text,
  auth_mode text CHECK (oauth|bearer|none),
  bearer_token_encrypted text NULL,          -- oauth creds ride in integrations rows
  status text CHECK (active|disabled|error),
  created_by_user_id, created_at, updated_at,
  UNIQUE (account_id, server_url) WHERE status <> 'disabled'
)
account_mcp_server_tools (
  id uuid PK, server_id FK, tool_name text,
  input_schema jsonb, output_schema jsonb NULL, schema_hash text,
  enabled bool, approved_by_user_id, approved_at,
  UNIQUE (server_id, tool_name)
)
```

RLS deny-all + service-role repositories; DTOs never expose tokens or raw schemas
beyond what the account's own builder needs.

---

## 7. API / service / UI expectations (described, not built)

- `integrations/_shared/mcp/oauth.ts` — RS-metadata/AS-metadata discovery, PKCE,
  resource indicators, static-or-DCR client strategy; consumed by per-app
  `ProviderOAuth` impls. No new routes: existing `/api/integrations/oauth/[provider]/*`.
- `integrations/_shared/mcp/executeTool.ts` — shared executor (§4.5).
- `core/mcpCompile/` — pure JSON-Schema→FieldMeta/OutputMeta mapper (+ `NEEDS_MANUAL`
  report). Pure ⇒ lives in `core/` legally (no I/O).
- `scripts/mcp-import/` — capture / generate / check CLI (dev-only; same posture as the
  action-smoke CLI).
- Per app: `integrations/<app>/` — manifest (+`mcp` block), `mcp-snapshot.json`,
  `mcp-catalog.ts`, `auth.ts`, `actions/**` triples, `options/*`, icon, `research.md`,
  `v2-pattern-audit.md`, configuration-design doc.
- Error surface: one new humanized classification for schema-drift refusal.
- UI: none beyond standard provider assets. Custom-MCP UI (server add/validate/tool
  approval, "Custom" badging) is deferred to its own plan.

---

## 8. Tests required (for the implementation slices)

1. **Compiler (CS-2)**: golden tests — representative JSON Schemas (incl. Linear's real
   captured schemas) → exact FieldMeta/OutputMeta; `NEEDS_MANUAL` triggers on unions,
   `$ref` cycles, deep nesting; never emits Setup-tab `json`; required/defaults per Q11.
2. **OAuth helper (CS-1)**: metadata discovery, PKCE, resource parameter, DCR fallback,
   token persistence via dispatcher (mocked AS); state/nonce anti-replay unchanged
   (existing tests keep passing).
3. **Executor**: arg mapping, drift refusal pre-send, timeout/size bounds, error-class
   mapping to engine codes, bounded-output enforcement (a spread of raw result must fail
   a structure test).
4. **Per-app (CS-3)**: standard provider gates — runtime handler tests (mocked MCP
   boundary per e2e philosophy: real auth/rows/engine, mocked vendor network), builder
   metadata tests, resolver tests, smoke fixtures, `option-source-reference-integrity`,
   credential-sharing coverage, registry duplicate rejection.
5. **Structure locks**: `tools/call` reachable only via `integrations/_shared/mcp/`;
   no MCP concepts in client bundles (no server URLs/protocol strings in UI code);
   inbound `services/mcp/` and outbound `_shared/mcp` stay import-disjoint.
6. **Drift sweep (CS-4)**: hash-diff detection; alert-only behavior; re-cert flow
   documented.
7. **Agent (CS-5)**: capability-vocabulary validation; selection-priority prompt tests
   (canvas-reuse beats connected beats catalog); plan validation still rejects unknown
   keys; setup-needed path for unconnected MCP app.
8. **E2E**: one journey — connect (mock OAuth) → build workflow with MCP action via
   builder → activate → trigger (native) → engine executes against a mock MCP server →
   outputs flow to a downstream native action via `{{...}}`.

---

## 9. Implementation slice breakdown

| Slice | Scope | Flag / visibility |
|---|---|---|
| **CS-1 MCP-AUTH** | `_shared/mcp/oauth.ts` (discovery+PKCE+resource+DCR-fallback), Linear `ProviderOAuth` + dispatcher registration, owner-setup doc for the Linear OAuth app | Provider `isExperimental: true` (hidden) |
| **CS-2 MCP-COMPILER** | `core/mcpCompile/` + `scripts/mcp-import` capture/generate/check + goldens | Dev tooling only |
| **CS-3 LINEAR-1** | Full Linear catalog app via the pipeline: catalog decisions, curated metas/schemas/handlers/resolvers (teams/projects/users/labels), executor generalization from Eden, tests, pattern-audit + configuration-design docs | `isExperimental: true` until certified |
| **CS-4 MCP-DRIFT** | Drift sweep CLI + optional alert-only cron + humanized drift failure classification | Cron default-off |
| **CS-5 AGENT-CAP** | `capabilities` vocabulary + index + selection-priority prompt rules + tests; tag Linear + a starter set of native metas | Prompt-side, no flag needed (validated additive) |
| **CS-6 LINEAR-CERT** | Owner setup + Phase-13-style live certification; flip visibility; Marcus-approved push | Ships to prod on approval |
| **CS-7+** | Second/third catalog apps (recommend Atlassian/Jira, then ClickUp) using the now-repeatable playbook; skill-curator update to the provider-addition skill | Per-app |
| **CS-CUSTOM-1 (later, paid)** | Separate planning slice first: Tier 2 tables, SSRF validation, runtime compile, "Custom" UX separation, rate budgeting, security review | Feature-flagged, default OFF |

Order rationale: CS-1/CS-2 are the only genuinely novel infrastructure; CS-3 proves the
whole pipeline on one app; drift + agent layers harden and enrich; certification gates
prod exposure; custom MCP comes last because it inherits every proven piece (client,
compiler, executor, drift) with only trust/isolation work added.

---

## 10. Risks / open questions

1. **Vendor catalog churn** (Asana V1→V2 precedent). *Mitigation*: pinned hashes +
   refuse-on-drift + sweep; prefer vendors with GA/stability signals; treat MCP apps as
   higher-maintenance than native. **Recommendation: accept; budget re-cert time.**
2. **Spec transition (2026-07-28 stateless final).** Client is close to stateless
   already; `list_changed` → `subscriptions/listen` affects only the (optional) sweep.
   **Recommendation: build to 2025-06-18 now, schedule a small client-upgrade slice
   after the ecosystem moves; do not block on it.**
3. **DCR client management.** Phase 1 sidesteps via static registration (Linear has a
   dev portal). A DCR-only vendor forces either a one-time manual DCR run (env-stored)
   or the `mcp_oauth_clients` table. **Recommendation: env-stored one-time DCR; table
   only when a second DCR-only vendor appears.**
4. **Tools without `outputSchema`** → hand-authored bounded outputs can drift silently
   (output drift isn't schema-hash-detectable). *Mitigation*: executor validates
   `structuredContent` when present; smoke fixtures catch shape breaks; curation prefers
   structured tools. **Recommendation: accept with smoke coverage.**
5. **Generic dispatcher tools** (HubSpot-style `manage_crm_objects`). Wrapping one tool
   into several typed V2 actions is allowed (the wrapper synthesizes wire format —
   rule 3), but multiplies drift surface. **Recommendation: allowed, used sparingly;
   prefer per-entity-tool vendors for early catalog picks.**
6. **Elicitation-dependent tools** can't run headless. **Recommendation: skip at
   curation; revisit if a "pause for user input" run state ever ships.**
7. **Catalog-vs-native duplicates** (a future MCP app overlapping a native provider,
   e.g. HubSpot). Two implementations of one app confuse users and the agent.
   **Recommendation: one implementation per app in the catalog; MCP is for apps we
   don't natively support, unless a native provider is deliberately migrated.**
8. **Marcus review bandwidth** becomes the catalog growth rate-limiter (by design).
   **Recommendation: keep per-app tool counts curated-small at launch (10–20 tools);
   expand per real usage signals.**
9. **Custom MCP trust/abuse** (SSRF, data exfil via variables, billing abuse).
   **Recommendation: separate security-reviewed plan before any Tier 2 code; paid-tier
   gating; strict egress + rate budgets.**
10. **PROJECT_MEMORY.md wording** (§1.1) should be amended so the old "agent never calls
    MCP" line isn't misread as forbidding this architecture. **Recommendation: memory-curator
    patch in the CS-1 batch.**

---

## 11. Acceptance criteria

**This planning slice:** doc exists at
`docs/slices/phase-5/mcp-integration-layer-architecture-plan.md`, grounded in cited
files; no source/test/migration/UI changes; docs-only local commit; nothing pushed.

**The implementation arc (later) must prove:** an ordinary user can connect Linear from
the Apps page and configure every shipped Linear node's common path with real selectors
and no provider-internal knowledge; MCP is invisible in the UI; all §8 tests green;
schema drift refuses safely and is detectable; the React Agent plans Linear actions with
the same fidelity as native ones; the standard gates (`tsc`, lint, lint:structure,
lint:migrations, jest, relevant Playwright) pass; live certification completed before
catalog visibility.

## 12. Hard boundaries (what this slice did NOT change)

No source, tests, migrations, schemas, UI, flags, env, or skills were changed. No MCP
server was contacted. No provider was added or modified. The only artifact is this
document, committed locally. Nothing pushed.

---

## 13. Executive Summary

ChainReact V2 already contains 80% of the machinery this brief asks for: a generic
outbound MCP client with typed errors, secret scrubbing, and pinned-schema drift refusal
(`integrations/_shared/mcp/`), and a shipped precedent (Eden) proving an MCP server can
back a fully native-feeling provider. The recommended architecture generalizes that
precedent into a **compile-time catalog pipeline**: Marcus captures a vendor's
`tools/list`, a schema compiler generates ordinary V2 provider artifacts (`.strict()`
schemas, `FieldMeta` metas, thin handlers over one shared executor, option resolvers
backed by the server's list tools), Marcus curates them to the rule-17 bar, and the
result registers in the exact registries native providers use. Users connect apps
through the normal OAuth flow (one new shared MCP-OAuth helper handles discovery, PKCE,
DCR); the builder, readiness, variable picker, engine, billing, credential sharing, and
React Agent all work **by construction**, with zero new builder surface and **zero
database migrations** for the entire catalog tier. New tools never auto-appear
(allowlist = committed code); approved tools are hash-pinned with refuse-on-drift plus a
proactive sweep. Customer Custom MCP is a clearly separated, paid, later tier that
reuses the same client/compiler/executor with account-scoped pinned allowlists, SSRF
hardening, and its own security review. Phase 1 is actions-only; native triggers compose
with MCP actions for free.

## 14. Risks (top line)

Vendor MCP catalogs churn faster than REST APIs (Asana cut 60% of tools in six months) —
pinning + drift refusal + re-certification is the cost of admission. The MCP spec goes
through a breaking (but architecture-compatible) stateless revision on 2026-07-28.
Missing `outputSchema` on many servers means output shapes need certification-time
curation and smoke coverage. The two flagship examples in the brief — ServiceTitan and
Fleetio — have **no official MCP servers** today, so the near-term catalog growth comes
from other vendors (or native builds for those two). Full list: §10.

## 15. Recommended First App: **Linear**

Research basis (web, 2026-07-22): official remote MCP servers confirmed GA from
Atlassian (Feb 2026), HubSpot (2026-04-13, OAuth 2.1 + PKCE, 12 tools), Stripe, PayPal,
Linear, Notion, ClickUp, Monday, Intuit/QuickBooks (hosted remote,
maturity-unlabeled), Dropbox, Canva, Figma, Salesforce (April 2026). **ServiceTitan and
Fleetio: confirmed negative** — community/aggregator wrappers only (Fleetio has an
engineering-blog MCP tutorial, no public endpoint). Schema quality varies sharply:
Stripe/PayPal/Linear/Atlassian/ClickUp ship per-entity typed tools; HubSpot ships
generic object dispatchers; Notion/Zapier-agentic are chat-optimized text tools.

**Why Linear:**

1. **No native overlap** — it genuinely grows the catalog (HubSpot, QuickBooks, Stripe,
   Asana, Monday, Notion, Shopify already have native V2 providers; building them over
   MCP would validate infrastructure while adding zero catalog value and creating
   duplicate-app confusion).
2. **Cleanest infrastructure validation** — hosted remote server, OAuth 2.1, GA,
   per-entity typed CRUD tools (issues/projects/comments/cycles) that map 1:1 onto the
   typed-and-narrow action rules, plus list tools that exercise the option-resolver
   path (teams → projects → assignees with `dependsOn` cascades). It stresses every new
   component — OAuth helper, compiler, executor, resolvers, drift, agent — with minimal
   curation fighting.
3. **Real product** — issue tracking is a credible workflow-automation domain (create
   issue on form submit / failed payment / support email), so certification produces
   shippable value, not a toy.

Runner-up **Atlassian (Jira/Confluence)** as CS-7's second app: the biggest
catalog-value win (GA, read+write, huge user base) but a larger multi-product surface —
better proven on a hardened pipeline than used to debug one. **ClickUp** third (SMB task
management, official OAuth remote). If the goal were schema purity alone, Stripe is the
best-typed server in the ecosystem, but the native overlap disqualifies it (§10.7).

ServiceTitan/Fleetio remain native-integration (or vendor-partnership) tracks; adopting
aggregator-hosted MCP wrappers for them would put a third party in the credential path
and is not recommended for a reviewed catalog.

## 16. Recommended Implementation Order

CS-1 MCP-OAuth helper + Linear connect → CS-2 schema compiler + import CLI → CS-3 Linear
end-to-end (catalog, curation, executor generalization, tests) → CS-4 drift sweep +
humanized drift failures → CS-5 React Agent semantic capabilities + selection priority →
CS-6 Linear live certification + catalog visibility (Marcus-approved push) → CS-7+
Atlassian, then ClickUp → CS-CUSTOM-1 (paid Custom MCP) only after its own
security-reviewed planning slice. Rationale in §9.

## 17. Owner Notes

**Consistency with the existing codebase: yes, strongly.** The design adds no new
architectural species: it generalizes the shipped Eden pattern, reuses the OAuth
dispatcher/token encryption/`integrations` table/credential-sharing model verbatim,
registers through the same frozen load-validated registries, and needs **no builder
changes and no migrations** for the whole catalog tier. Every invariant in CLAUDE.md's
authoring rules (typed-and-narrow, no `make_api_call`, bounded outputs, manifest
honesty, builder-completion-is-provider-completion) is enforced at the same points it is
today. The one durable-decision tension — the 2026-06-12 "MCP stays external" memory
line — is a wording-scope issue, not a conflict (§1.1).

**Things to settle before implementation begins:**
1. Approve the §1.1 memory-wording amendment (or veto this direction now, cheaply).
2. Confirm Linear as the first app and register the Linear OAuth application (owner
   task; static client registration avoids DCR complexity in CS-1).
3. Confirm the one-implementation-per-app rule (§10.7) so nobody builds MCP-HubSpot.
4. Confirm Custom MCP is deferred behind a paid tier and its own security-review plan —
   nothing in CS-1..CS-7 should anticipate customer-supplied URLs.
5. Timing note: the MCP spec's breaking revision finalizes 2026-07-28 (days away).
   No action needed — build to 2025-06-18 as vendors do — but expect a small
   client-upgrade slice in a few months.

**Model recommendation for the implementation batches:** the highest model is worth it
for **CS-1 and CS-2 only** — the MCP-OAuth helper (multi-RFC discovery/DCR flow with
real security consequences) and the schema compiler (the design-heavy core whose mapping
decisions every later app inherits). From CS-3 onward the work is pattern-following
provider construction against this plan plus the provider-addition skill, which the
normal coding model (Opus-tier, e.g. `claude-opus-4-8` — current models are the Claude 5
family / Opus 4.8 / Sonnet 5 / Haiku 4.5) handles well; spending top-model capacity
there buys little. A sensible middle path: normal model implements CS-3+, highest model
reviews the CS-3 batch once (it sets the per-app template) — after that, normal model
throughout.

---

*Docs-only. Local commit. Nothing pushed.*
