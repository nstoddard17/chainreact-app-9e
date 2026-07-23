# Linear — V2 Pattern Audit (CS-3 LINEAR-1)

**Provider:** `linear` — first MCP-CATALOG app (issue tracking / product planning).
**Slice:** CS-3 (executor generalization + registration + tests). Local, unpushed.
**Auth home / connection model:** documented in `research.md` (regular Linear OAuth,
static app, `personal` credential class). This doc covers the ACTION/EXECUTION
patterns reused from existing V2 providers and the intentional divergences.

The core claim of the MCP catalog tier: **an MCP-backed provider is an ordinary V2
provider.** Linear reuses the shipped registries, engine, builder, and OAuth infra
verbatim; the only new shared machinery is the executor seam and the compile pipeline
(CS-1/CS-2), both already in-repo before this slice.

## Patterns reused (same-family precedent = Eden, the shipped MCP provider)

| Concern | Reused pattern | Source of truth |
|---|---|---|
| Tool transport | Shared `McpClient` over Streamable HTTP (JSON-RPC 2.0), typed errors, secret scrubbing, idempotent-only retries | `integrations/_shared/mcp/client.ts` (unchanged except an opt-in `maxResponseBytes` bound) |
| Handler shape | Thin typed `ActionHandler`: strict-parse config → delegate to a shared executor → return bounded output | Eden `integrations/eden/actions/**/*.ts`; Linear handlers are GENERATED to the same shape |
| Auth-in-execution | `refreshAndRetry({ accountId, provider, providerAccountId: null, apiCall })`; `McpAuthError → Unauthorized401Error`, `McpPermissionError → InsufficientScopeError` | Eden `_shared/eden/api/_client.ts`; Linear does the identical mapping inside the shared executor |
| Strict schemas | `.strict()` zod, reject raw wire-format, no `make_api_call`, no `operation` router | Generated `*.schema.ts` (rule 1–3) |
| Registration | Hand-maintained inventories: meta-only sub-registry (`services/discovery/providers/linear.ts`) + direct handler entries (`_handlerInventory.ts`) | Eden `providers/eden.ts`; rule 14 (registry presence defines the action set) |
| Builder | Zero new surface — compiled metas are ordinary `ActionMeta`; Setup/Advanced, readiness, variable picker, node styling all by construction | `contracts/actionMeta.ts`; `discovery-meta-coverage` structure test |
| Manifest honesty | `capabilities.actions` flips to `true` only now that handlers register; `isExperimental: true` until certified | `integrations/linear/manifest.ts` (rule 15) |
| Credential sharing | `linear: "personal"` (member identity — the token acts as the connecting human) | `core/integrations/credentialSharing.ts` (classified in CS-1) |

## Intentional divergences (and why)

1. **One shared executor instead of per-action API wrappers.** Eden hand-wrote a
   per-resource API layer (`_shared/eden/api/*`); Linear's actions all delegate to ONE
   `integrations/_shared/mcp/executeTool.ts`. Rationale: catalog actions are generated,
   so the per-action logic is just the `.strict()` arg mapping the schema already
   performs — the executor holds every cross-cutting guarantee (drift, bounds, output
   projection, error mapping) exactly once. This is the generalization the plan calls for
   (§4.5) and the template all future MCP apps inherit.

2. **Pre-send drift gate on every call.** Before `tools/call`, the executor compares the
   live `tools/list` schema against the certified one. CS-3 shipped this as a strict
   any-change refusal; **CS-4 upgraded it to a classification** (`no_change` /
   `safe_addition` run, `breaking_change` / `tool_removed` / `tool_renamed` /
   `schema_changed` refuse), backed by a short-TTL schema cache so it costs one
   `tools/list` per 5-minute window instead of one per action, and a first-class
   `INTEGRATION_CHANGED` user experience. Eden relies on the certified allowlist alone.
   See [`docs/rules/mcp-drift-and-certification.md`](../../rules/mcp-drift-and-certification.md).

3. **`save_issue` split into two typed V2 actions.** Linear consolidated create+update
   into one `save_issue` dispatcher (changelog 2026-02-26). We ship `create_issue`
   (id omitted, title+team pinned required) and `update_issue` (id pinned required) as
   SEPARATE typed actions via field-omission + required-pinning — honoring rule 1
   (typed-and-narrow, no dispatcher router field) while calling one server tool. The
   drift pin is shared (same `schemaHash`); the strict schemas differ.

4. **Text-only bounded outputs (interim).** The captured tools declare no `outputSchema`,
   so every action ships a single `{ text: string }` output until live certification
   captures representative `structuredContent` (plan §4.3). The executor FULLY supports
   structured bounded outputs (`normalizeOutput`, tested) — flipping a meta to structured
   is a certification-time change, not new code. See `configuration-design.md`.

5. **No option resolvers yet — text name-or-id fields.** See `configuration-design.md`
   §"Option resolvers — deferred". Not a divergence in kind (the resolver path is the
   standard `services/options` one); deferred pending live capture of Linear's list tools.

## What did NOT change

Engine dispatch, variable resolver, credential plan, OAuth dispatcher, token encryption,
`integrations` table, builder renderers, readiness, test-mode gate, and the AI capability
catalog are all untouched — Linear participates through the same seams as every native
provider. No migrations. The only shared-file edits are additive: `executeTool.ts` (was a
fail-closed stub), an opt-in `maxResponseBytes` on the client, and one `idempotent` line
in the compiler's handler emitter.

## Verification baseline (this slice)

`npx jest` — new/updated suites green: `executeTool.test.ts` (executor: wiring, drift,
output normalization, error mapping, bounds — 30+ cases), `client.test.ts`
(+maxResponseBytes), `mcp-generated.test.ts` (generated artifacts + registration),
`discovery-meta-coverage`, `integration-manifests`, `option-source-reference-integrity`,
`ai-catalog-consistency`, `discovery/_registry`, `handlers/registry`, `_registry`,
`credentialSharing` (817 + 50 cases). `tsc`, `lint`, `lint:structure` — see the slice
report. **No live Linear call was made** (no owner credentials); live capture + live
certification are CS-6, blocked on the owner OAuth app + env vars.
