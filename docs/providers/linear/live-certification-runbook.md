# MCP Catalog Provider — Live Certification Runbook (the "Phase 13" template)

**Status:** template / procedure doc. Establishes the permanent, repeatable live-
certification steps for every MCP catalog provider, using Linear as the reference.
**It certifies nothing by itself** — it is the checklist an operator (owner + Claude)
runs once real credentials exist. Local/unpushed.

> **Status (updated CS-6C, 2026-07-22):** CS-6/6B **DID** run against a real
> connection — `mcp-snapshot.json` is `capturedBy: "live"` (52 tools) and
> read-only evidence for `list_issues` + the 4 list tools is captured. What is
> STILL owner-blocked and cannot be fabricated:
> - **Write-evidence** for `save_issue` (create/update) + `save_comment` — their
>   result shapes are `skipped` in `mcp-evidence.json`, so create/update/comment
>   outputs stay text-only (Part 1/2). Needs `MCP_IMPORT_BEARER` + `write-evidence`.
> - **State / Cycle / Project resolvers** — `list_issue_statuses` (needs `team`)
>   and `list_cycles` (needs `teamId`) were not captured; `list_projects` captured
>   **empty** (item shape unconfirmed). Needs a 2nd `capture --evidence` from a
>   workspace with projects + team-scoped status/cycle sample args (Part 3).
> - **Live E2E** (both workflows, reconnect, drift) — needs `LINEAR_CLIENT_ID`/
>   `LINEAR_CLIENT_SECRET` + an OAuth connection (Part 7).
>
> **CS-6C LIVE update (2026-07-23):** credentials were supplied via `.env.local`
> and the read path ran live (no drift on 52 tools). `linear:projects` +
> `linear:issue_statuses` resolvers now ship from **real** evidence. BUT the dev
> `MCP_IMPORT_BEARER` is **read-only** — `save_issue`/`save_comment` were denied
> ("lacks write permission"), so write-evidence, write structured outputs, and
> the two E2E workflows remain blocked. Re-mint the bearer with **Read & write**
> scope to finish. Linear stays **Experimental**. Full detail:
> `docs/providers/linear/live-capture-evidence.md` (CS-6C LIVE run).

## Owner prerequisites (all required before step 1)

| Prereq | How to satisfy | Consumed by |
|---|---|---|
| Linear OAuth app | `linear.app/settings/api/applications`; redirect `https://<app>/api/integrations/oauth/linear/callback`; scopes `read`,`write` | connect flow |
| `LINEAR_CLIENT_ID` / `LINEAR_CLIENT_SECRET` | env (prod + local) | OAuth dispatcher |
| A successful OAuth connection | connect Linear once in-app | proves the round-trip |
| `MCP_IMPORT_BEARER` | a dev Linear token (NOT a customer token) | `mcp:import capture`/`check` |

If any is missing → **stop; do not fabricate a capture** (a fabricated snapshot
would certify invented schemas — the worst possible outcome).

### Development preview — connect BEFORE certification

Linear stays `isExperimental: true` (hidden from the production Apps catalog)
until Phase 7. To connect + certify it in development WITHOUT changing that
production state, set the dev-only flag:

```
ENABLE_EXPERIMENTAL_MCP_APPS=true   # dev/localhost only — never in production
```

This reveals experimental **MCP-catalog** providers (`apiVersion: "mcp"`) in the
Apps catalog so the OAuth "Connect" flow is reachable (`app/apps/_shared.ts`
`isCatalogVisible`). It is scoped to MCP apps, OFF by default, and touches no
manifest — production (flag unset) keeps Linear hidden and its certification
state unchanged. Remove the flag once Phase 7 flips `isExperimental: false`
(which supersedes it). Linear's action metas are already registered, so its
nodes appear in the builder for building the certification workflows regardless
of this flag.

## The pipeline is READY (verified CS-3/CS-4, credential-independent)

Everything below is code-complete and tested against a mocked boundary; only live
evidence is missing. No code change is expected during certification unless the live
diff surfaces one.

- Capture / diff / regenerate: `scripts/mcp-import` (`capture [--evidence]`, `check [--json]`, `generate [--print-registration]`) — capture/check refuse cleanly without a bearer; `generate` is deterministic (byte-sync guard: `mcp-generated.test.ts`). Evidence capture (CS-5A) records type-only scrubbed result shapes for read-only, catalog-approved tools; `--print-registration` prints copy/paste inventory wiring without mutating anything.
- Executor + drift classification + schema cache + certification state + `INTEGRATION_CHANGED` UX: CS-3/CS-4, all provider-agnostic.
- Registration + builder: Linear renders as an ordinary provider today (Experimental/hidden).

## Procedure

### Phase 1 — Live capture + evidence (replaces docs-draft)
```
export MCP_IMPORT_BEARER=<dev-linear-token>
npm run mcp:import -- capture linear --evidence   # snapshot (capturedBy:"live") + mcp-evidence.json
```
`--evidence` (CS-5A) additionally runs the catalog-approved, **read-only** tool
calls (today: `list_issues` with `{ limit: 3 }`) and writes
`integrations/linear/mcp-evidence.json` — TYPE-ONLY, scrubbed, bounded result
shapes for the structured-output curation in Phase 4. It NEVER calls
write/destructive tools. Also record in a NEW
`docs/providers/linear/live-capture-evidence.md`: negotiated `protocolVersion`;
the full live tool list; and which **list tools** exist
(`list_teams`/`list_projects`/`list_users`/`list_workflow_states`/`list_labels`
or their real names) — the resolver inputs Phase 5 needs. To capture a list
tool's shape, add an `evidence: { sampleArgs: {...} }` block to its (read-only)
catalog entry first.

### Phase 2 — Diff + catalog review
```
npm run mcp:import -- check linear        # human diff report (docs-draft → live)
```
For every newly-discovered tool decide **ship / skip / defer** in `mcp-catalog.ts`
with a reason. **Never expose every discovered tool.** Destructive tools
(`delete_*`) stay `skip` absent product signal. New create/read tools that pass the
rule-17 bar may ship.

### Phase 3 — Regenerate (deterministic) + registration wiring
```
npm run mcp:import -- generate linear
npm run mcp:import -- generate linear --print-registration   # (CS-5A) copy/paste inventory fragments
```
`generate` regenerates schemas, metas, handlers, `_pinned.ts`, `_generated.ts`,
capability report, and pinned hashes from the LIVE snapshot (`mcp-generated.test.ts`
proves byte-sync; do not hand-edit generated files). `--print-registration`
mutates NOTHING — it validates the artifacts are fresh and prints the exact
`services/discovery/providers/<p>.ts`, `_metaInventory.ts`, `_handlerInventory.ts`,
and `services/options/_registry.ts` fragments to paste (it refuses if artifacts
are stale). Linear is already registered, so this is only needed if the live
capture adds/removes a shipped action.

### Phase 4 — Structured outputs (replace text-only)
Using the captured result payloads, curate bounded `outputs` on each write action's
catalog entry — target fields: `identifier` (e.g. LIN-42), `id`, `url`, `title`,
`team`, `project`, `state`, `assignee`. Regenerate. The executor's `normalizeOutput`
already enforces the bounded set and fails honestly on a shape mismatch (CS-3), so
downstream steps get a first-class `{{node.identifier}}` — this is what makes
Workflow 1 ("issue identifier → Slack") real. **Do NOT keep text-only outputs if the
live result carries richer data.**

### Phase 5 — Option resolvers (real list tools only)
If Phase 1 confirmed list tools + their result shapes, ship
`OptionsResolver`s (`linear:teams`, `linear:projects` `dependsOn` team,
`linear:states`, `linear:assignees`, `linear:labels`) calling the list tool through
the shared MCP client + `refreshAndRetry` (pattern: `eden:boards`), set
`optionsSource` on the catalog `fieldOverrides`, regenerate. `option-source-reference-
integrity` enforces the resolver exists. **If a list tool or its result shape can't be
confirmed live, do not invent it** — keep name-or-id text (documented) and note it.

### Phase 6 — End-to-end validation (real connection)
- Workflow 1: Manual → Create Linear Issue → Slack (assert `{{create.identifier}}` flows).
- Workflow 2: Manual → Find Issue → Update Issue → Add Comment.
- Verify: variables, outputs, readiness, run history, reconnect (revoke → 401 → reconnect UX), drift protection (temporarily pin a stale hash → `INTEGRATION_CHANGED` "being reviewed" copy, NOT `HANDLER_FAILED`), builder experience (nothing says "MCP").

### Phase 7 — Certification gate (flip ONLY if ALL true)
- [ ] Live snapshot committed (`capturedBy: "live"`); `check` shows no unreviewed drift.
- [ ] Every shipped node configurable by an ordinary user (resolvers OR verified name-or-id), no provider-internal ids required on Setup.
- [ ] Structured outputs certified where the live result supports them.
- [ ] Both E2E workflows pass end-to-end against the real server; reconnect + drift paths verified.
- [ ] `tsc`, `lint`, `lint:structure`, `lint:migrations`, jest, relevant Playwright green.
- [ ] `live-capture-evidence.md` + updated `configuration-design.md` / `v2-pattern-audit.md` committed.

If all pass: set the provider certification state to **healthy** and flip
`isExperimental: false` in `manifest.ts` (Marcus-approved push deploys it to the
catalog). **If any fail: leave `isExperimental: true` and document exactly which gate
failed.** Never lower the standard to ship.

## What must NOT happen
Fabricated captures; certifying without live E2E; text-only outputs when richer data
is available; invented resolvers; flipping to catalog on a partial gate.
