# ChainReactV2 — Claude Instructions

## ✅ PRIMARY / ACTIVE APP — LIVE IN PRODUCTION

ChainReactV2 is the ChainReact app/codebase — build all work here.

### Active-repo guardrail (read before running anything)

- **ChainReactV2 is the only repo you work in.** All editing, running, testing,
  committing, migrations, and verification happen here:
  `c:\Users\marcu\source\repos\ChainReactV2`.
- **Verify the repo before shell commands.** A shell can start in a different
  directory by accident (the machine's default working directory is not this repo).
  Before any `git` / `npm` / `db` command, confirm the working tree is ChainReactV2 —
  e.g. `git rev-parse --show-toplevel` should end in `ChainReactV2`.

**V2 is live in production** at `https://chainreact.app`, deploying from the
`v2-main` branch. Authoritative status, including current verification state:
[`docs/slices/phase-4/v2-go-live-status.md`](./docs/slices/phase-4/v2-go-live-status.md).

**Push posture (updated 2026-06-12):** local work stays **push-gated** — commit
locally, do not push by default. **But when Marcus explicitly approves a verified
batch, pushing to `v2-main` IS allowed and DOES deploy to production** — that is the
intended path at this stage (there is no separate staging environment yet). The old
"do not deploy to prod" caution is retired. Still: never push, deploy, open PRs, or
change public launch posture **without** Marcus's explicit approval; approval is
per-batch and does not carry over. A proper dev/staging environment will be added
later, before broad user rollout + taking payments. "Don't push this branch by
default" does not mean "V2 isn't live" — both facts can be true at once.

## Project Purpose

ChainReactV2 is a workflow automation platform, live in production and under active
development.

Use current ChainReactV2 code, docs, tests, provider patterns, official provider API
docs, and live provider evidence as the only implementation references. If a provider
pattern is unclear, derive it from current V2 provider implementations and rule docs,
then verify against the provider's official docs and live behavior.

---

## Working Style

- Work in meaningful local batches.
- Do not over-slice into tiny PRs.
- Local commits are allowed after gates pass.
- **Do not push unless Marcus explicitly says to push.** When he does approve a
  verified batch, pushing to `v2-main` is allowed and deploys to prod (intended).
- Do not open PRs unless Marcus explicitly says to.
- Before major/shared-infrastructure work, write a short plan first.
- For provider work, audit existing V2 provider patterns before coding.
- Prefer reusing existing V2 provider patterns over inventing new behavior.

## Current Branch Strategy

Most V2 work is local-only for now.

Do not assume work should be pushed after each provider or slice.

Use local branches/commits to keep progress organized, but wait for Marcus before
pushing. When he approves a verified batch, the push goes to `v2-main` and deploys
to production — that is the intended ship path until a dev/staging env exists.

### Concurrent-session rule (V2-MAIN-RECONCILE-1, 2026-07-25)

Marcus often runs several Claude sessions against this repo at once. Local
`v2-main` once diverged from `origin/v2-main` because sessions committed to it
directly while releases were cut from cherry-pick branches; a one-time merge
reconciliation repaired it. To keep it repaired:

- Start every session's work from the **latest fetched `origin/v2-main`**.
- Each substantial batch gets its **own branch (or worktree)** — local `v2-main`
  is the integration branch, not a shared scratch branch, and no session commits
  directly to it while another session may also be working.
- Completed, approved branches **merge or fast-forward into `v2-main`**; then the
  push (on Marcus's per-batch approval) is a normal fast-forward push.
- Immediately before any push: `git fetch`, confirm
  `git merge-base --is-ancestor origin/v2-main HEAD`, and read
  `git diff --name-status origin/v2-main HEAD` — files there that aren't yours
  are another session's work you would ship or revert. Never force-push.

---

## Provider Authoring — start from V2 patterns

Before implementing a provider, audit existing V2 providers for the patterns you'll
reuse:

- OAuth / token-ingest auth flow
- action handlers + `.strict()` schemas + `.meta.ts`
- trigger / webhook / polling lifecycle
- API wrappers
- option sources
- Apps / Builder / AI visibility metadata
- tests + smoke fixtures + live-certification path

Match a same-family V2 provider where one exists, then verify behavior against the
provider's official API docs and live behavior. Document the patterns reused and any
intentional divergences in the provider's `v2-pattern-audit.md`.

---

## V2 Architecture Boundaries

Keep provider-specific logic under:

`integrations/<provider>/`

Keep shared provider-family helpers under:

`integrations/_shared/<family>/`

Examples:

`integrations/_shared/google/`
`integrations/_shared/microsoft/`

Keep reusable trigger infrastructure under:

`services/triggers/`

Keep cron orchestration under:

`services/cron/`

Keep repositories under:

`repositories/`

Keep pure helpers only in `core/`.

**Do not import repositories or services into `core/`.**

---

## Provider Implementation Pattern

Every new provider follows the full provider-addition skill. The required delivery
sequence is:

1. Research repetitive business tasks
2. Decide and document the action/trigger catalog
3. Implement authentication and scopes
4. Implement typed runtime actions and triggers
5. Design every node's Setup / Advanced configuration
6. Build required provider-resource discovery and option resolvers
7. Register builder metadata and verify at-a-glance summaries
8. **Decide and document the provider's Analytics disposition** (implemented ·
   eligible-but-blocked · not suitable · deferred by owner), and implement the dataset
   when it is useful and certifiable
9. Run runtime, builder, resolver, and relevant E2E tests
10. Complete live provider certification where credentials are available
11. Produce the owner developer-portal and environment checklist

An action or trigger is not shipped merely because its handler executes. Its
ordinary-user configuration path must also be complete.

Use the updated provider-addition skill —
[`.claude/skills/chainreactv2-provider-integration-builder/SKILL.md`](./.claude/skills/chainreactv2-provider-integration-builder/SKILL.md)
— for the full procedure and Owner Report contract. (Its post-owner-setup live
certification pass keeps its established **"Phase 13"** alias; existing outcome docs
that say "Phase 13" remain correct.)

Do not push after each batch unless Marcus explicitly says to. On his explicit
approval, the batch pushes to `v2-main` and deploys to prod (intended at this stage).

---

## Testing Gates

After meaningful batches, run the four static checks, then the **directly relevant
focused suites** — never the whole inventory:

```bash
npx tsc --noEmit
npm run lint
npm run lint:structure
npm run lint:migrations
# then the focused suites your change actually touches, BY PATH — e.g.
npm test -- tests/unit/services/analytics/ tests/unit/features/analytics/
```

**Do not run the full repository test suite by default.** A bare `npm test` runs the
entire inventory; it is not the owner-approved default because of its time and machine
cost. Run only what your change touches, and **report exact suite and test totals** for
every command you ran.

- **`lint:structure`:** distinguish **pre-existing baseline failures** from new ones —
  compare against the base commit before calling anything a regression, and never
  "fix" an unrelated baseline offender just to turn the check green.
- **Docker / Supabase are not started for ordinary verification.** Do not run
  `supabase start` / `supabase:test:start`, repair containers, or substitute a
  database, unless Marcus explicitly approves it for that batch.
- **Browser (Playwright) tests** may run when the required environment is *already*
  available without expensive infrastructure recovery. Run the targeted spec, not the
  full Playwright suite. **A blocked browser test is reported as blocked — never as
  passed.**
- **A full-suite run happens only when Marcus explicitly authorizes it for that batch.**
- **Never claim a command ran unless it actually ran**; if something was skipped, say
  exactly why.

---

## E2E Philosophy

E2E tests should use real V2 internals and mock only the external provider boundary.

**Real:**

- auth
- OAuth dispatcher/state
- token encryption
- integration rows
- workflow create/activate
- trigger resource lifecycle
- workflow execution
- action handlers

**Mock:**

- Slack / Google / Microsoft / other provider network APIs

---

## Important Defaults

- Do not add DB migrations unless truly needed.
- Prefer existing `trigger_resources.config` for provider-specific watch/polling metadata when safe.
- Use DB-backed dedup, not in-memory dedup.
- Use `refreshAndRetry` for provider API calls that can receive 401.
- Use Q-contract helpers where applicable.
- Keep manifest capabilities honest. Do not set `actions: true` or `webhookTrigger: true` until handlers/triggers are actually registered.

---

## Current State & Status

ChainReactV2 is the primary app. Live status is tracked in maintained docs —
do NOT keep a duplicate point-in-time status list here (it goes stale).

**Start here:** [`docs/PROJECT_MEMORY.md`](./docs/PROJECT_MEMORY.md) — compact rolling curated state (status, durable decisions, open follow-ups). Points to the authoritative docs below; never overrides them.

Source of truth:

* **Phases & roadmap:** [`docs/roadmap/chainreact-v2-roadmap.md`](./docs/roadmap/chainreact-v2-roadmap.md)
* **Production go-live status:** [`docs/slices/phase-4/v2-go-live-status.md`](./docs/slices/phase-4/v2-go-live-status.md)
* **Builder-metadata launch gap (9 providers):** [`docs/slices/phase-4/provider-metadata-launch-gap-tracker.md`](./docs/slices/phase-4/provider-metadata-launch-gap-tracker.md)
* **Revived/deferred providers:** [`docs/slices/phase-3/missing-providers-status.md`](./docs/slices/phase-3/missing-providers-status.md) → [`provider-completion-closeout.md`](./docs/slices/phase-3/provider-completion-closeout.md)
* **Per-slice plans & outcomes:** [`docs/slices/`](./docs/slices/)

**Provider-addition gate (durable):** no net-new provider without:

- A researched action/trigger catalog with ship, skip, and defer decisions
- A configuration-design audit for every shipped node
- A `v2-pattern-audit.md`
- A roadmap entry
- Builder metadata for every shipped action and trigger
- Required provider-resource discovery and option resolvers
- Runtime, builder, and resolver test evidence
- An explicit Owner Report verdict on whether an ordinary user can configure every
  common path without locating provider-internal values

A provider is only partially complete when any common-path node still requires
technical provider knowledge that ChainReact can reasonably remove. Missing option
resolvers, API wrappers, routes, services, search, or pagination are implementation
work — not acceptable reasons to relabel the usability gap as a future enhancement.

Local work is not pushed without Marcus.

---

## V2 Provider Authoring Rules

Universal rules every provider action / trigger / handler MUST follow. Per-provider
specifics live in the provider's own `integrations/<provider>/` implementation and its
`research.md` / `v2-pattern-audit.md`; where a rule has a dedicated reference it is
linked here.

**Actions & schemas**
1. **Typed-and-narrow.** One provider endpoint per action. No generic `operation` / `deleteBy` / `searchColumn` router fields and no multi-purpose dispatchers — ship separate typed actions instead.
2. **No `make_api_call` escape hatch.** No generic method/path/body passthrough; fill gaps with targeted typed actions.
3. **`.strict()` schemas; reject raw provider wire-format.** The wrapper synthesizes provider wire-format from V2-shaped inputs — workflow authors never hand-author raw provider payloads.
4. **Q11 — explicit required fields, no hidden defaults.** High-risk / recipient-visible / behaviour-switching fields are required with no silent default (e.g. Sheets `valueInputOption`, Outlook `replyAll` / `isHtml` / `importance`).
   - **Setup/Advanced progressive disclosure (CONFIG-UX-SETUP-ADVANCED-1).** Fields render on the Setup tab by default; mark power-user / plumbing fields (pagination cursors, tuning knobs, developer toggles) `advanced: true` (they render in the config panel's Advanced tab and never count toward setup-needed unless required), scope mode-specific fields with top-level `visibleWhen` (required-when-visible; hidden ⇒ not a readiness gap), and surface a handler default the user should see as `defaultValue`. Raw `json` entry stays advanced-only; flat fixed-key objects use the `object` editor instead of JSON. Rationale + field classification: [`docs/slices/phase-5/builder-config-setup-advanced-tracker.md`](./docs/slices/phase-5/builder-config-setup-advanced-tracker.md).
   - **A provider value inside a structured row gets a picker too (RESOLVERS-3/4).** An `object-list` / `object` sub-field (`itemFields`) may declare `optionsSource` — a row cell is not an excuse for a raw id box. Sub-field `type` stays the **value** type (`text` / `number` / …); `optionsSource` upgrades only the **widget**, and the row commits the value the runtime schema already expects. Parents are declared in one of two EXPLICIT scopes: `dependsOn` → the node's **top-level** fields; `dependsOnRow` → **another column in the same row** (which is how `visibleWhen.field` on an itemField has always resolved). Both merge into one flat `ctx.deps`; a name that doesn't exist in the scope it declares throws at module load. **When the row value should select the option SOURCE itself** (HubSpot's `subscriptions[].eventType` decides whether the row's property list is contacts/companies/deals/tickets), do NOT invent per-row sources — ship ONE resolver that takes the value as a dep and dispatches server-side (`hubspot:subscription_properties`).

**Outputs**
5. **Bounded outputs.** Build output from a fixed key set; never spread the raw provider response (`...result`).
6. **No bytes / base64 / content in outputs** — file-like outputs use `FileRef`. See [`docs/rules/file-output-contract.md`](./docs/rules/file-output-contract.md).
7. **No provider host / `paging.link` leakage.** Paginate via `nextCursor` + `hasMore`; never surface provider URLs/hosts into workflow variables.
8. **Errors propagate to the engine.** No `{success:false}` synthetic ActionResult envelope — throw and let the engine classify (`HANDLER_FAILED`).

**Lists & pagination**
9. **Single-page lists by default.** Return one page; authors compose a loop on `nextCursor` / `hasMore`. No silent auto-pagination.

**Triggers**
10. **`TriggerEvent.eventType` MUST equal the short form** passed to `registerActivation(provider, eventType, …)` and stored in `trigger_resources.event_type` — it drives dispatch lookup. Namespaced / classified subtypes go in `payload.classifiedType`, never in `eventType`.
11. **Baseline-first polling.** `onActivate` seeds the snapshot before the first poll; the first poll after activation fires zero events. Throw on seed failure (→ `TRIGGER_REGISTRATION_FAILED`) — never swallow it (the "first-poll-miss" bug).
12. **Trigger filters are pure.** No enrichment I/O (`*.info`), no `FileRef` construction, no Promises — the trigger emits a thin handle, the action does the I/O. Compose downstream for bytes/metadata.
13. **DB-backed dedup with stable provider IDs; fail-closed.** Key `webhook_event_dedup` on stable provider ids (hashes, not raw PII); on dedup outage skip-enqueue this tick. Prefix the eventId per-trigger when one entity fans out to multiple triggers.

**Structure**
14. **Don't treat orphan files as shipped.** Registry presence — not `.ts` presence — defines the action set; orphan backfill is product-signal-gated.
15. **Manifest honesty.** Don't set `actions:true` / `webhookTrigger:true` until handlers/triggers are registered. (Also in *Important Defaults*.)
16. **50-file leaf-folder cap.** Split a provider's `actions/` into domain subfolders (`actions/channels/`, `actions/line_items/`) as it approaches the cap; update registry import paths to match.

**Builder & configuration**
17. **Builder completion is provider completion.** Every shipped action and trigger must support an understandable repetitive-task configuration path. Static discoverable provider resources use real account-aware selectors; changing runtime values support upstream mapping; manual identifier entry is retained in Advanced for power users. Setup must not require provider documentation, opaque identifiers, raw payload construction, or arbitrary JSON when ChainReact can provide a structured path. **If that configuration path is incomplete, manifest/runtime registration does not make the node complete.** (Mechanics — `advanced` / `visibleWhen` / `defaultValue` / `object`-vs-`json` — are rule 4's sub-bullet; this rule is the completion bar.)
    - **A resolver failure must never strand a field (REACT-AGENT-RESOLVER-RECOVERY-1).** Every
      `optionsSource`-backed field must, in every non-ready state, say honestly what happened and
      offer the recoveries that state actually supports — retry / reconnect deep-link / open the
      exact step editor / deliberate manual provider-ID entry. Never one generic "Couldn't load
      options", never an instruction the UI can't carry out, never a retry that provably can't
      help. Classification is shared and provider-agnostic
      (`core/workflows/options/optionsRecovery.ts`) — adding a provider requires no recovery code.
      Contract: [`docs/rules/option-source-recovery.md`](./docs/rules/option-source-recovery.md).
    - **Configuration-design doc required.** The provider's configuration-design document must classify *every* field of *every* shipped node as exactly one of: **core user decision** · **static provider resource** · **dynamic upstream value** · **fixed repeated value** · **derived/defaulted value** · **conditional option** · **advanced control** · **internal implementation detail**. The resulting UI must follow the classification — a static provider resource is a registered selector, not a raw text box; an internal implementation detail is derived or hidden, not surfaced. Full procedure + Owner Report contract: [`.claude/skills/chainreactv2-provider-integration-builder/SKILL.md`](./.claude/skills/chainreactv2-provider-integration-builder/SKILL.md).

**Analytics**
18. **Every net-new provider requires an Analytics disposition before closeout.**
    Actions let a customer *act* on a provider; Analytics lets them *see* what it
    knows. Implement provider-local curated datasets through the generic Insights
    catalog when the data is useful and certifiable; otherwise record the status
    explicitly as **eligible-but-blocked** (keep it absent/`preview`, commit a
    read-only certification harness and a blocked report naming the owner action),
    **not suitable** (with the reason), or **deferred by owner**. Never silently omit
    Analytics from a provider outcome, and never ship a token dataset to check a box.
    - **Never public without live certification.** `public` = live-certified ·
      `preview` = implemented, certification incomplete · absent = semantics or data
      not yet certified. One declarative `exposure` field drives client visibility,
      server authorization and production non-leaking — no provider-name branches.
    - **Honest semantics only.** Never chart a mutable current value over its creation
      date as though it existed historically; never name a measure Revenue/Profit/Cash
      collected unless the provider data proves that meaning; never assume USD, mix
      currencies, or mix incompatible units; bounded scans emit structured
      completeness — no silent truncation. Analytics uses already-approved scopes;
      broadening OAuth scopes for a dataset needs separate owner approval.
    - Full procedure (Phase 8.5 + eligibility checklist) and reference
      implementations: [`.claude/skills/chainreactv2-provider-integration-builder/SKILL.md`](./.claude/skills/chainreactv2-provider-integration-builder/SKILL.md).

**Cross-cutting contracts:** file output → [`docs/rules/file-output-contract.md`](./docs/rules/file-output-contract.md) · token-ingest auth → [`docs/rules/token-ingest-auth.md`](./docs/rules/token-ingest-auth.md).

---

## Provider & Contract Notes (index)

The universal rules are in **V2 Provider Authoring Rules** above. Per-provider specifics
— actions, triggers, wire-format, failure modes — are read from the provider's own
`integrations/<provider>/` implementation, its registry entries, and its
`research.md` / `v2-pattern-audit.md`. The cross-cutting contracts live in the rule docs:

- File output (FileRef): [`docs/rules/file-output-contract.md`](./docs/rules/file-output-contract.md)
- Token-ingest auth: [`docs/rules/token-ingest-auth.md`](./docs/rules/token-ingest-auth.md)
- Option-source recovery (resolver failures must stay recoverable): [`docs/rules/option-source-recovery.md`](./docs/rules/option-source-recovery.md)
- React Agent conversation persistence (history remembers; the SAVED workflow decides what exists; readiness decides what's next): [`docs/rules/react-agent-conversation-persistence.md`](./docs/rules/react-agent-conversation-persistence.md)
- Folder / module boundaries (50-file cap): [`docs/rules/project-structure-and-module-boundaries.md`](./docs/rules/project-structure-and-module-boundaries.md)
- Testing strategy + shared-mock e2e execution: [`docs/rules/testing-strategy.md`](./docs/rules/testing-strategy.md)

---

## Living Documentation Rule

`CLAUDE.md` and the project docs are living documents. When a local batch changes the project's process, architecture, provider patterns, testing approach, branch strategy, or important implementation conventions, Claude must check whether the docs need to be updated.

Before any future push/PR, Claude should review the diff and ask:

- Did this change introduce or modify an architectural pattern?
- Did this change alter how providers should be built in V2?
- Did this change add a new shared helper, registry, service, repo pattern, or testing convention?
- Did this change alter branch/process rules?
- Did this change add a provider pattern future providers should follow?
- Did this change make any existing CLAUDE.md guidance stale?

If yes, update the relevant documentation in the same local batch:

- `CLAUDE.md` for project-wide Claude/process/architecture guidance.
- `docs/slices/*` for slice-specific plans or retros.
- provider docs if the change is provider-specific.
- ops docs if the change affects deployment, cron, CI, secrets, or environment setup.

Do not update docs just for noisy implementation details. Update docs when the change affects how future work should be done.

Before pushing, Claude should explicitly report:

- whether documentation was reviewed,
- whether documentation needed updates,
- which docs were updated,
- or why no doc update was needed.

**Important:** Documentation updates should be committed locally with the related implementation batch when practical, not left as stale follow-up work.

When a durable decision or repeated workflow emerges and it is unclear *where* it belongs
(project memory vs. an existing skill vs. a new skill vs. `CLAUDE.md` vs. `docs/`), route that
decision through the [`chainreactv2-skill-curator`](./.claude/skills/chainreactv2-skill-curator/SKILL.md)
skill. It is human-controlled (not auto-triggered) and prefers the minimal patch in the most
specific home.

---

## Internal developer tooling

- **Local MCP server** (read-only repo/doc/provider-metadata context for AI coding
  hosts): [`scripts/mcp/`](./scripts/mcp/) → `npm run mcp:build && npm run mcp:start`
  (health check: `npm run mcp:smoke`). At the start of a coding session, prefer its
  context tools (`get_project_memory`, `get_claude_instructions_summary`,
  `read_rule_doc`, `get_provider_manifest_summary`, `list_builder_metadata_gaps`)
  to ground in the repo's source of truth. What it exposes / deliberately does NOT
  expose (no prod data, no DB, no secrets, no mutation) + the Claude usage workflow:
  [`docs/runbooks/internal-mcp-server.md`](./docs/runbooks/internal-mcp-server.md).
- **For ChainReactV2 work, gather context via the MCP first** — before relying on stale
  memory or a broad manual file hunt — then read the actual files/code to implement. The
  [`chainreactv2-mcp-context`](./.claude/skills/chainreactv2-mcp-context/SKILL.md) skill is
  the shared routing procedure (when/what to pull, and the hard scope limits). MCP is
  orientation only; repo files, commits, and code remain the source of truth.

## Reminders

- **Do not push unless Marcus explicitly says to push.** His approval of a verified
  batch authorizes a `v2-main` push, which deploys to prod (no staging env yet).
- **Build providers from current V2 patterns, official provider docs, and live provider evidence.**
