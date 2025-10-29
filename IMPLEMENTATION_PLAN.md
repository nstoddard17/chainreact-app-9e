## Summary
- **Goal:** Deliver Flow v2 vertical slice under `/workflows/v2` with Kadabra-style workflows
- **Owner:** Codex
- **Router Type:** App Router
- **Database:** Supabase (Postgres)
- **Current Milestone:** M8

## Front Door V2 Routing
- [x] ai-agent V2 submit → create + redirect
- [x] builder V2 default render
- [x] legacy fallbacks in place
- [x] E2E passing (agent prompt → builder → run lineage)

## V2 Builder Hook
- [x] Client hook bridges Flow v2 APIs to builder state/actions
- [x] Debounced config updates → apply-edits batching
- [x] Agent prompt pipeline populates pending edits + auto-apply
- [x] Run/lineage/secret APIs integrated into inspector refresh

## Visual Parity Port (UI-only)
- Stage 1 · Chrome & Toolbar
  - [x] Presentation extracted from legacy layout
  - [x] Flow V2 content updated with legacy toolbar/tabs
  - [x] Toolbar handlers mapped to V2 hook actions
  - [x] CSS tokens normalized in `FlowV2Builder.module.css`
  - [ ] Visual compare screenshot test (optional)
- Stage 2 · Inspector
  - [x] Legacy inspector tabs/markup ported to V2
  - [x] Config editor debounced → V2 `updateConfig`
  - [x] Snapshot/error/lineage wiring to V2 run APIs
  - [x] Prereq banner wired to secrets actions
  - [ ] Visual compare screenshot test (optional)
- Stage 3 · Agent Panel
  - [x] Agent panel UI ported and backed by V2 planner
  - [x] Diff/apply pipeline wired to V2 actions
  - [x] Determinism badge + highlights implemented
  - [x] Jest + Playwright tests cover panel flow
  - [ ] Visual compare screenshot test (optional)
- Stage 4 · CSS Tokens & Visual Compare
  - [x] Tokens defined on Flow V2 builder root and referenced across layout
  - [x] Optional screenshot spec scaffolded behind `VISUAL_TESTS=true`
  - [ ] Baseline screenshots recorded (optional)
- Stage 5 · Kadabra-Style Animated Build UX
  - [x] Create BuildState.ts with finite state machine
  - [x] Create FlowBuilder.anim.css with animation styles
  - [x] Add build state machine to WorkflowBuilderV2
  - [x] Implement staged progression UI in agent panel
  - [x] Add floating badge component
  - [x] Implement node CSS class application (grey/active/done)
  - [x] Add camera panning animations to active nodes
  - [x] Wire up Build button handler with skeleton creation
  - [x] Make animated build the default (removed feature flag)
  - [x] Implement auto-submit from AI agent page
  - [x] Create comprehensive documentation
  - [ ] Wire up actual secrets picker in setup cards
  - [ ] Wire up actual params form controls
  - [ ] Implement node testing with `actions.runFromHere()`
  - [ ] Add Jest tests for state machine transitions
  - [ ] Add Playwright E2E tests for full animated build flow

## M1) Shared Schemas + DB (3 files + migrations)
- Status: ✅ Done
- [x] Create shared Zod+TS types at `src/lib/workflows/v2/schema.ts`
  - Port, Edge, Node, Flow, RunContext
  - Node has: id, type, label, config, inPorts[], outPorts[], io:{ inputSchema, outputSchema }, policy:{ timeoutMs, retries }, costHint:number
  - Flow has: id, name, version, nodes[], edges[], trigger, interface
  - RunContext has: flowId, runId, startedAt, inputs, nodeOutputs{[nodeId]:any}, globals, errors
- [x] Add DB persistence using the repo’s current database layer (detect Supabase/Prisma/etc)
  - If Supabase/Postgres is available, create v2 tables (or equivalent models):
    - flow_v2_definitions(id uuid pk, name text, created_at timestamptz)
    - flow_v2_revisions(id uuid pk, flow_id uuid fk, version int, graph jsonb, created_at timestamptz, unique(flow_id,version))
    - flow_v2_runs(id uuid pk, flow_id uuid fk, revision_id uuid fk, status text, inputs jsonb, started_at timestamptz, finished_at timestamptz)
    - flow_v2_run_nodes(id uuid pk, run_id uuid fk, node_id text, status text, input jsonb, output jsonb, error jsonb, attempts int, duration_ms int, cost numeric, created_at timestamptz)
    - flow_v2_lineage(id uuid pk, run_id uuid fk, to_node_id text, edge_id text, target_path text, from_node_id text, expr text)
- [x] Add a tiny FlowRepository at `src/lib/workflows/v2/repo.ts` for CRUD and schema validation on save/load
- [x] Prepare script in PR description: how to run migrations, how to insert/load a blank flow revision
  - PR checklist: `supabase db push` (or deploy pipeline) → `curl http://localhost:3000/workflows/v2/api/demo/blank` to seed a blank Flow v2 revision

## M2) Mapping Engine (deterministic variable passing + lineage)
- Status: ✅ Done
- [x] Implement `src/lib/workflows/v2/mapping.ts`
  - Use JSONata if available; otherwise fall back to JEXL (keep the same interface)
  - Function `buildDownstreamInput({ edge, ctx })`
    - ctx = { inputs, globals, nodeOutputs, upstream } where upstream = nodeOutputs[edge.from.nodeId]
    - Apply mappings IN ORDER to build the downstream input object
    - If a REQUIRED mapping resolves to undefined/null, throw a MappingError with JSON shape:
      ```json
      {
        "type":"MappingError",
        "edgeId":"<edgeId>",
        "targetPath":"<payload.path>",
        "expr":"<expression>",
        "message":"Required mapping produced undefined/null",
        "upstreamSample": { /* clipped JSON */ },
        "nodeFrom":"<fromNodeId>",
        "nodeTo":"<toNodeId>"
      }
      ```
    - Emit lineage per target: { runId, toNodeId, edgeId, targetPath, fromNodeId, expr }
- [x] Add Jest tests (happy path, ?? defaulting, missing required, type mismatch)
- [x] Demo script: run tests and show sample mapping input→output + error behavior

## M3) DAG Runner (graph executor)
- Status: ✅ Done
- [x] Create folder `src/lib/workflows/v2/runner/*`
- [x] Compile Flow → topological stages; within a stage, run independent nodes concurrently
- [x] For each node:
  - Collect inbound edges, compute input via mapping engine
  - Execute with policy { timeoutMs=60000 default, retries=2 backoff }
  - Idempotency key per { runId, nodeId }
  - Persist immutable snapshots: input, output, error, attempts, duration_ms, cost
  - Write lineage rows emitted by mapping step
- [x] Support “Run from here” using stored upstream snapshots
- [x] Add a small NodeRunner interface every node implements (`run(input, config, ctx) → output`)
- [x] Demo script: seed a tiny in-memory flow and run it end-to-end (no UI yet)

## M4) Minimal Node Catalog
- Status: ✅ Done
- [x] Implement typed nodes under `src/lib/workflows/v2/nodes/*` with configSchema, inputSchema, outputSchema, costHint, run()
  - HTTP.Trigger → outputs { payload: requestBody }
  - AI.Generate → { model, system, user, expect_json_schema } → outputs { json, tokens, cost }
  - Mapper → pass-through of mapped object as { payload: ... }
  - IfSwitch → { predicateExpr } routes to true/false ports
  - HTTP.Request → { method, url, headers, bodyExpr? } → { status, headers, body }
  - Slack.Post (or Email.Send fallback) → { webhookUrl, text } → { ok: true }
- [x] Add basic unit tests for each node
- [x] Demo script: programmatically compose a sample flow and run with the runner

## M5) API Endpoints (`/workflows/v2/api/*`)
- Status: ✅ Done
- [x] Detect router style; place endpoints accordingly:
  - App Router → `app/workflows/v2/api/*/route.ts`
  - Pages Router → `pages/workflows/v2/api/*.ts`
- [x] Implement endpoints:
  - POST  `/workflows/v2/api/flows/[flowId]/edits` → validate-only for now
  - POST  `/workflows/v2/api/flows/[flowId]/apply-edits` → validate + persist edits atomically; return updated Flow JSON
  - POST  `/workflows/v2/api/flows/[flowId]/runs` → start run with inputs; returns { runId }
  - GET   `/workflows/v2/api/runs/[runId]` → status + per-node details
  - GET   `/workflows/v2/api/runs/[runId]/nodes/[nodeId]` → input/output/error snapshots
  - POST  `/workflows/v2/api/trigger/http/[flowId]` → webhook trigger invoking runner
- [x] Use existing DB client (e.g., Supabase) for persistence/auth
- [x] Demo script: curl commands to create a flow revision and run it

## M6) Builder UI (React Flow) + Inspector (double-click)
- Status: ✅ Done
- [x] Create pages:
  - `/workflows/v2`
  - `/workflows/v2/[flowId]`
- [x] Builder features:
  - Drag/connect nodes, pan/zoom, minimap, select/delete
  - Double-click node → right-side Inspector with tabs: Config, Input, Output, Errors, Lineage, Cost
  - “Scroll to field” anchors; highlight fields set by Agent
  - Command input: “Ask the Agent…” → POST edits → show diff → apply
- [x] Use the `/runs` APIs to show live previews (last input/output/error)
- [x] Demo script: build a small flow in UI, run it, and inspect lineage

## M7) Agent Planning Stub (graph edits)
- Status: ✅ Done
- [x] Implement server module `src/lib/workflows/v2/agent/planner.ts`
- [x] POST `/workflows/v2/api/flows/[flowId]/edits` → return STRICT graph edits JSON
- [x] POST `/workflows/v2/api/flows/[flowId]/apply-edits` → validate & persist; return updated flow
- [x] Demo script: send a natural-language goal → receive edits → apply → canvas shows changes

- **Current Milestone:** M8

## M8) Seed & Tests
- Status: ✅ Done
- [x] Seed example flow: HTTP.Trigger → AI.Generate(JSON) → Mapper → Slack.Post
- [x] Tests:
  - Jest unit: mapping (success, required failure, type mismatch, ?? defaulting)
  - Integration: run the sample flow; assert final payload + lineage rows
  - E2E (Playwright): open builder, double-click inspector, run preview, verify lineage UI
- [x] Provide npm scripts in package.json (dev, worker, test, e2e)
- [x] Demo script: full end-to-end run green

## Acceptance Rules (Do Not Relax)
- [ ] Canonical Zod schemas for Flow/Node/Edge/RunContext shared across UI/API/runner
- [ ] Deterministic mapping engine with JSONata/JEXL; REQUIRED field failures produce MappingError JSON with expr/targetPath and upstream sample
- [ ] Field-level lineage stored and queryable
- [ ] Immutable nodeOutputs snapshots
- [ ] Inspector renders config (auto form), input/output, errors, lineage, cost; supports “scroll to field”
- [ ] Sample flow executes and posts a Slack/Email message with lineage proving variables flowed correctly

## Guardrails
- [ ] Keep secrets redacted in logs; mark secret config fields in node metadata
- [ ] Align with existing routing/DB/styling conventions; no breaking changes to legacy builder
- [ ] Small PRs per milestone with demo instructions

## Next Steps / Notes
- Demo endpoint smoke-test: mocked GET verification confirms `{ ok: true, flowId, revisionId }` payload.
- Playwright E2E scaffold (`tests/flow-v2-builder.spec.ts`) guarded by `E2E_FLOW_V2` for manual runs.
- Test runs: `npm run test:workflows:v2` (Jest suite), `E2E_FLOW_V2=true npm run test:e2e` for full UI.
- Prepared `seed:flow-v2` script to provision sample flow; ready for rollout/QA.
- Secrets API live: configure `FLOW_V2_SECRET_KEY` and use `/workflows/v2/api/secrets` or env `FLOW_V2_SECRET_<NAME>` for local dev.
- Templates gallery available at `/workflows/v2/templates`; builder “Save as template” posts to `/workflows/v2/api/templates`.

## Flow v2 Parity Sprint (In Progress)
- Status: 🔄 In Progress
- Costing & Credits
  - [ ] Persist per-node cost (tokens/API charges) and flow-level estimates
  - [ ] Surface estimates/actuals in builder header and run detail view
  - [ ] Expose `/workflows/v2/api/runs/[runId]/cost` and aggregate costs in run payloads
- Prerequisites & Asset Checks
  - [x] Planner surfaces `prerequisites` (missing secrets/assets)
  - [x] Builder banner for unresolved prereqs; block run until satisfied
- Templates Gallery
  - [x] Supabase tables + APIs for templates; save current flow as template
  - [x] `/workflows/v2/templates` gallery and “Use template” flow (positions preserved)
- Scheduling & Event Triggers
  - [ ] Cron trigger & scheduler worker with `/api/schedules` CRUD
  - [ ] Webhook signature validation toggle/doc
- Connectors & Secrets
  - [x] Supabase `v2_secrets`, `v2_oauth_tokens` tables + RLS *(schema & APIs in place; RLS tightening later in sprint)*
  - [x] Secrets picker in config forms; inspector redaction
- RBAC & RLS
  - [x] Supabase workspace-scoped RLS policies across `flow_v2_*`
  - [x] Workspace membership roles (`owner`/`editor`/`viewer`) enforced in API middleware
  - [x] Feature flag `flow_v2_enabled` guarding `/workflows/v2` UI + APIs
  - [x] Jest coverage for workspace access + feature flag off
- Versioning & Publish/Release
  - [x] Draft vs Published revisions, publish button, run default behavior
  - [x] Revisions list + JSON diff view
- Agent Planning Upgrade (ReAct-lite)
  - [ ] Planner tools: listNodes, getNodeSchema, validateDraft, simulateDraft
  - [ ] Deterministic heuristics yielding AI→Mapper→Notify with prereqs
- Error Taxonomy & UX
  - [ ] Standardize error payloads, inspector error cards, retry node action
- Observability & Health
  - [x] Per-node log table writer + `/workflows/v2/api/health` endpoint
- Docs & Examples
  - [x] `README_FLOW_V2.md` + `STATE_SUMMARY.md` linked here

## Post-M8 : Release Readiness
- [ ] Finalize agent planner upgrades (listNodes / schema helpers / simulator)
- [ ] Error taxonomy polish (standardized payloads, retry affordances)
- [x] RBAC & RLS hardened (workspace memberships, feature flag)
- [x] Observability complete (node logs, health endpoint, alerts, UI summaries)
- [x] Documentation package ready (`README_FLOW_V2.md`, `STATE_SUMMARY.md`)
- [ ] QA sweep (Playwright E2E, manual regression, rollout checklist)
