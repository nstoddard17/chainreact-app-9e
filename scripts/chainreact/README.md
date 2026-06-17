# ChainReact internal operator CLI (`chainreact`)

Local **developer/operator tooling** for repo consistency, verification, and
provider/app metadata validation. It lives alongside the internal MCP server
(`scripts/mcp/`) and follows the same posture: read-only, dependency-free,
import-fenced, no production reach.

## What it is

A small, zero-dependency TypeScript CLI (built to `scripts/chainreact/dist/` via
`scripts/chainreact/tsconfig.json`, mirroring the MCP build). Command logic is
pure and unit-tested; the only side effect — shelling out to **existing**
package.json scripts — is funneled through one injectable runner.

## What it is NOT

- **Not** a customer-facing product. No auth/login, no customer CLI behavior.
- **No workflow execution.** It never runs workflows.
- **No production data, no network calls, no database writes.**
- **No service-role / Supabase / admin behavior.**
- **No push / deploy / `db:push` / migration application.**
- **No secrets.** It never prints tokens, credentials, or env values.
- It does **not** invent a new verification standard — `verify` reuses existing
  package.json scripts.

It is **live internal tooling** (not flag-gated).

## Commands

| Command | What it does |
|---|---|
| `chainreact status` | Concise local repo/tooling snapshot: repo root, Node/platform, package manager, key file/doc presence, provider-manifest + rule-doc counts. No network, no secrets. |
| `chainreact verify [--run] [--with-tests]` | Prints the pre-push/deploy verification batch. **Default: dry-run** (prints, runs nothing). `--run` executes the safe subset (`lint:structure`, `typecheck`, `lint`); `--run --with-tests` also runs the full `test` suite (heavy, opt-in). Fail-fast. |
| `chainreact verify --changed [--run] [--with-tests] [--report] [--json]` | **Diff-aware** verify: inspects the local git diff (working tree + staged + untracked) and recommends the *smallest* sensible batch for what changed. Dry-run by default. `--run` executes the **auto** checks via a structured, allow-listed executor — bare `npm run <script>` **and** safe targeted commands (`app validate --all`/`<provider>`, bounded `jest <dir>`); **heavy** full-suite runs only with `--with-tests`. Allow-list rejects write/deploy/DB commands (kept as manual). `--report` appends a compact copy-pasteable closeout summary (final status + executed/skipped/failed + next steps); `--json` emits only a deterministic machine-readable report. Falls back gracefully (exit 1 + message) if git is unavailable. Git + execution are behind injectable seams — tests never spawn git or processes. |
| `chainreact mcp smoke [--dry-run]` | Thin wrapper over the existing `npm run mcp:smoke`. `--dry-run` prints the command. Fails gracefully if the script is absent. Adds no MCP tools/permissions. |
| `chainreact app list` | Lists discovered providers with text-derived fields: id, displayName, enabled, **registered** (`yes`/`no`/`?`), action handler/meta/schema counts, trigger-meta count. Never imports provider code. Deterministic (sorted by id). |
| `chainreact app validate <provider>` | Foundation validator for `integrations/<provider>/` metadata. Filesystem/text checks only — never imports provider code. Adds a `MANIFEST_NOT_REGISTERED` **warning** when the manifest isn't wired into `_registry.ts`, `ACTION_META_NOT_REGISTERED` / `ACTION_HANDLER_NOT_REGISTERED` **warnings** for a complete action triad that isn't wired into the discovery/handler inventories, and `TRIGGER_META_NOT_REGISTERED` **warning** for a trigger meta not wired into the discovery trigger inventory (all warnings — never errors). |
| `chainreact app validate --all [--verbose]` | Runs the validator across **every** discovered provider; prints a summary (total / pass / warn / fail + per-provider status). Failures list their errors inline; `--verbose` also lists warnings. |
| `chainreact app scaffold <id> [--dry-run] [--register]` | Creates a minimal, contract-valid provider skeleton under `integrations/<id>/` (a single `manifest.ts`, capabilities off, TODOs for the rest). Refuses to overwrite an existing provider. **Default: does not edit the registry** (provider stays inert). `--register` additionally wires the new manifest into `_registry.ts` (1 import + 1 `ALL_MANIFESTS` entry). `--dry-run` prints the plan (+ the registry patch when `--register`) and writes nothing. |
| `chainreact app register <id>` | Wires an **existing** provider's manifest into `_registry.ts` (1 import + 1 `ALL_MANIFESTS` entry). Requires `integrations/<id>/manifest.ts` to exist; refuses unknown dirs; no-ops cleanly if already registered; refuses (writes nothing) if the registry format can't be patched safely. `--dry-run` prints the patch and writes nothing. |
| `chainreact app action scaffold <provider> <action> [--dry-run]` | Creates a minimal action **triad** (`<base>.ts` handler + `.schema.ts` + `.meta.ts`) for an **existing** provider. The handler validates config then **throws "not implemented"** (no network, no fake success); the meta is Zod-valid (no fields/outputs, `category: "other"`) so the provider keeps passing `app validate`. Refuses unknown providers, invalid action ids, and collisions with an existing action unit. Does **not** register the handler/meta or change `isEnabled`. `--dry-run` prints the plan + predicted validation and writes nothing. |
| `chainreact app action register <provider> <action> [--dry-run]` | Wires an **implemented** action's handler + meta into the app inventories (handler → `_handlerInventory.ts` `ALL_HANDLERS`; meta → central `ALL_ACTION_META` **or** the provider's discovery barrel `<X>_ACTION_METAS`). Requires the full triad to exist; **refuses a scaffold placeholder** (handler still throws "not implemented"); no-ops if already registered; refuses (writes nothing) if a registry's anchors are missing/unreadable. `--dry-run` prints the planned edits and writes nothing. |
| `chainreact app trigger scaffold <provider> <trigger> [--dry-run]` | Creates a minimal trigger **meta** (`triggers/<base>/<base>.meta.ts`, the dominant folder-per-trigger layout) for an **existing** provider. **Inert**: `activation: "manual"`, no fields/payload, **no webhook/polling runtime files** (those encode real provider behavior). Zod-valid so the provider keeps passing `app validate`. Refuses unknown providers, invalid ids, and collisions. **Not auto-registered** (trigger registration is a documented manual step — no patching this slice). `--dry-run` prints the plan + predicted validation and writes nothing. |
| `chainreact --help` / `-h` | Usage. |

## Usage

```bash
npm run chainreact -- status
npm run chainreact -- verify              # dry-run (default)
npm run chainreact -- verify --run        # run the safe subset
npm run chainreact -- verify --run --with-tests
npm run chainreact -- verify --changed            # recommend a batch for the local diff
npm run chainreact -- verify --changed --run      # run the auto (cheap) subset for the diff
npm run chainreact -- verify --changed --report   # + copy-pasteable closeout summary
npm run chainreact -- verify --changed --json     # deterministic machine-readable report
npm run chainreact -- mcp smoke
npm run chainreact -- app list
npm run chainreact -- app validate slack
npm run chainreact -- app validate --all
npm run chainreact -- app validate --all --verbose
npm run chainreact -- app scaffold linear --dry-run
npm run chainreact -- app scaffold linear
npm run chainreact -- app scaffold linear --register --dry-run
npm run chainreact -- app scaffold linear --register
npm run chainreact -- app register linear --dry-run
npm run chainreact -- app register linear
npm run chainreact -- app action scaffold slack send-test-message --dry-run
npm run chainreact -- app action scaffold slack send-test-message
npm run chainreact -- app action register slack send-channel-message --dry-run   # no-op (already registered)
npm run chainreact -- app action register slack my-implemented-action            # after implementing it
npm run chainreact -- app trigger scaffold slack message-posted --dry-run
npm run chainreact -- app trigger scaffold slack message-posted
```

`npm run chainreact` builds first (`chainreact:build`) then runs — so it always
reflects current source.

**Exit codes:** `0` ok, `1` validation/verification failure, `2` usage error. For
`app validate --all`, exit is `0` only when **no** provider has an ERROR finding —
warnings never fail the command. `app list` is read-only and always exits `0`.
`verify --changed` exits `1` when git discovery fails (so CI/agents notice).

## `verify --changed` (diff-aware verification)

Stops agents from guessing which checks to run. It collects the local diff and maps
it to the smallest sensible batch. See [`commands/verify.ts`](./commands/verify.ts)
(`recommendChecks` — pure mapping) + [`git.ts`](./git.ts) (changed-file seam).

**Changed-file discovery** combines, dedupes, and sorts three read-only git reads —
`git diff --name-only` (working tree), `git diff --cached --name-only` (staged), and
`git ls-files --others --exclude-standard` (untracked). It runs behind an injectable
`ChangedFilesReader` seam, so unit tests never spawn git. If git is missing or the dir
isn't a repo, it fails gracefully (`ok:false` + message; the CLI prints a fallback to
plain `verify` and exits 1). No fetch, no write, no network.

**Structured execution + allow-list.** Recommendations now carry a typed
[`ExecCommand`](./runner.ts) (`npm-script` · `chainreact` · `jest`) — never a shell
string. `defaultExecutor` launches `npm`/`npx` via `spawnSync` with a fixed argv (no
shell string assembled from input; `shell:true` only on Windows for the `.cmd` shims,
with allow-list-checked tokens). Before running, `validateExecCommand` checks each
command against a safety allow-list:

- **npm-script** — must be an existing `package.json` script and NOT side-effecting
  (denied: `db:push`, `build`, `dev`, `start`, `check:db-target`, and `db:*` / `deploy*`
  / `sweep:*` prefixes). Missing script → skipped gracefully.
- **chainreact** — only READ-ONLY app commands: `app validate --all [--verbose]`,
  `app validate <provider>`, `app list`. `scaffold` / `register` / `action` / `trigger`
  (which WRITE) are rejected → kept as manual.
- **jest** — bounded paths under `tests/` only (no `..`, no bare full-suite run).

**Recommendation mapping** (conservative; reuses existing `package.json` scripts only):

| Changed | Recommends | Tier |
|---|---|---|
| `scripts/chainreact/**` | `npm run chainreact:build`, `npx jest tests/unit/chainreact` | auto |
| CLI validation code (`appValidate*`, `actionRegistry.ts`, `registry.ts`, `providers.ts`) | `app validate --all` | auto |
| `*.ts/*.tsx/*.mts/*.cts` | `npm run typecheck` | auto |
| source/test trees (`integrations`/`services`/`app`/`features`/…/`tests`) | `npm run lint:structure` | auto |
| `integrations/<provider>/**` | `app validate <provider>` (one per provider, sorted; skips `_`-dirs) | auto |
| `integrations/_registry.ts`, `services/discovery/**`, `services/execution/handlers/**` | `app validate --all` | auto |
| `supabase/migrations/*.sql` | `npm run lint:migrations`, `jest tests/integration/security`, `jest tests/structure` | auto |
| security/RLS (`**/security/**`, `**/rls/**`, `**/policies/**`, `admin-auth`) | `jest tests/integration/security` | auto |
| `features/workflow-builder/**`, `services/execution/**`, `lib|services/triggers/**` | `jest tests/unit/features/workflow-builder` | auto |
| `package.json`, `tsconfig*.json`, `eslint.config.mjs`, `jest.config.*` | `npm run lint`, `npm run test` | auto + **heavy** |

**Tiers** — `auto` = safe + structured, executed under `--run` (bare scripts AND the
targeted `app validate` / bounded `jest` commands); `HEAVY` = full `test` suite, only
auto-run with `--with-tests`; `manual` = no structured form or allow-list-rejected
(printed, you run it); `missng` = recommended npm script absent from `package.json`
(skipped). Output is ordered cheap → heavy and groups the "why".

**Run vs dry-run:** default is dry-run (recommend only). `--run` executes the `auto`
checks via the structured executor (fail-fast), prints `[SKIP]` for missing scripts,
and **lists any `HEAVY`/`manual` checks it did NOT run**. `--with-tests` additionally
runs `HEAVY` checks. It never runs DB writes, migrations, deploys, or network calls —
only read-only/test commands the allow-list permits. Existing `verify`, `verify --run`,
and `verify --run --with-tests` are unchanged (they still use the bare-script
`CommandRunner` seam).

### `--report` and `--json` (closeout)

For deliverable/closeout reports, add `--report` to append a compact, copy-pasteable
summary block (built by [`commands/verifyReport.ts`](./commands/verifyReport.ts) —
pure):

```
── verify --changed summary ──
status: PASS                         # PASS | FAIL | DRY-RUN | NO-CHANGES | ERROR
changed files: 6
mode: run (with-tests: no)
executed: 4 passed, 0 failed
  PASS npm run lint:structure
  ...
next:
  - npm run chainreact -- app validate --all
```

`finalStatus` is derived deterministically: `ERROR` (git discovery failed) ·
`NO-CHANGES` (empty diff) · `DRY-RUN` (no `--run`) · `PASS` / `FAIL` (run mode).
On `FAIL` the report names the **failed command + exit code** and the auto checks
**not run because fail-fast stopped the rest**. The CLI says "failed targeted check"
— it does NOT judge whether the failure is "related"; the human/agent adds context.

The **Next commands** block is non-noisy: dry-run → suggest `--run` (and `--with-tests`
when heavy checks exist); `PASS` with gated heavy → suggest `--with-tests`; `FAIL` →
re-run the failed command after fixing; and it always includes
`app validate --all` when provider/integration validation was recommended but not
successfully executed.

`--json` emits **only** a deterministic JSON object (no human output) — fixed key
order, ordered arrays, no deps — with `finalStatus`, `changedFiles`, `recommendations`,
`executed`, `skippedMissing`, `notRunHeavy/Manual`, `notRunDueToFailFast`,
`failedCommand`, and `nextCommands`. `--report`/`--json` never change exit codes or the
safety allow-list.

## Safe usage expectations

- Run it from inside the ChainReactV2 repo (it auto-detects the repo root; `status`
  warns if you are outside it).
- It is safe to run anytime — it mutates nothing. The only commands it can execute
  are existing read-only npm scripts, and only when you pass `--run` (verify) or
  invoke `mcp smoke`.

## How future provider/app work should use `app validate`

`app validate` checks the already-established metadata contracts
(`contracts/actionMeta.ts`, `contracts/triggerMeta.ts`, `contracts/integration.ts`)
using **text/regex inspection only — it never imports provider code**.

**Structure (ERROR / WARNING):**
- provider folder + `manifest.ts` exist (ERROR if missing);
- manifest declares an `id` that matches the folder (ERROR on mismatch), plus
  `displayName` / `isEnabled` (WARNING if absent);
- no orphan **action** meta — a `*.meta.ts` without its `*.ts` handler (ERROR;
  mirrors the `discovery-meta-coverage` "no orphan meta" rule);
- action units (handler + `*.schema.ts`) missing a `*.meta.ts` (WARNING).

**Action / trigger meta completeness (ERROR):** every existing `*.meta.ts` is
checked for the contract-required top-level keys (`provider`, `displayName`,
`category`, `requiresIntegration`, `fields` — plus `activation` for triggers) and
for **provider/key consistency** (the meta's `provider:` must equal its folder, and
its `key:` must be `"<provider>:<type>"`). These are ERROR because a violation fails
the discovery-registry Zod parse at build time **and** means the action/trigger is
invisible or broken in the builder + AI catalog (the "backend exists but the builder
can't see it" drift this tool exists to catch). A meta file that isn't a static
literal (no `: ActionMeta` / `: TriggerMeta`) is reported as a WARNING and skipped —
never a false error.

**Manifest completeness (ERROR):** the manifest is checked for the other
contract-required fields beyond id/displayName — `tokenScope`, `scopes`,
`capabilities`, `healthCheckIntervalMs`.

**Value checks (ERROR for enum violations, WARNING for shape/literalness):** all
value scans run on **comment-stripped** text (provider JSDoc routinely mentions keys
like `` `healthCheckIntervalMs: 12h` ``, which must not be read as the code value).
- `category` value must be one of `ActionCategorySchema` — **parsed at runtime from
  `contracts/actionMeta.ts`** (no import, no hardcoded list; skipped if unparseable).
  Out-of-enum → ERROR (Zod rejects it → invisible in builder/AI). Non-literal → WARNING.
- `tokenScope` value must be one of `TokenScopeSchema` (parsed from
  `contracts/integration.ts`) → ERROR if invalid, WARNING if non-literal.
- `requiresIntegration` should be a `true`/`false` literal → WARNING if not.
- `fields` (and `outputs`/`payloadShape` when present), `scopes`, `capabilities`
  should be obvious array/object literals → WARNING if a static literal can't be
  confirmed (could be a builder function — text can't prove it wrong, so it never
  fails the run).

**Deliberately NOT checked** (each would need real AST parsing to stay
false-positive-free, and the build-time Zod parse already enforces them):
duplicate field/output **names** (the `name:` key is ambiguous across
`fields[]`/`outputs[]`), field/output **type values** (`type:` is ambiguous between
the distinct `FieldType` and `OutputType` enums), `scopes.required`-non-empty-when-
OAuth (fragile nested parse), and `healthCheckIntervalMs` numeric value (arithmetic
expressions + JSDoc mentions). **AI/builder visibility** has no per-meta static field
in the contract — visibility is derived from a registered meta existing, which the
`ACTION_META_GAP` / orphan-meta checks + `discovery-meta-coverage` test already
cover — so there is nothing extra to validate here.

It intentionally does **not** assume a trigger *handler* layout (triggers use a
different shape — e.g. `<name>.meta.ts` + `filter.ts`); it checks the trigger meta
**file** content and reports trigger metas as a count. All scope/field/AI-visibility
*value* checks are deliberately deferred (see below) — only high-confidence,
broadly-applicable, text-safe checks are included so `app validate --all` stays
green across every current provider with zero false positives.

Provider **discovery + manifest text-parsing** is shared in
[`providers.ts`](./providers.ts) (`listKnownProviders`, `collectActionUnits`,
`scanField`/`scanBoolField`, `inventoryProvider`, `providerCounts`). Action triad
matching is by **basename** across the `actions/` tree, so both layouts work: metas
next to handlers (slack) and metas in a dedicated `actions/meta/` subfolder
(hubspot). The deeper meta/manifest content checks live in pure functions in
[`commands/metaChecks.ts`](./commands/metaChecks.ts). `app validate`,
`app validate --all`, and `app list` all build on these — so do future `app audit` /
`app scaffold` commands.

**When to run these:**
- `app list` — quick inventory while planning provider work or checking enabled state.
- `app validate <provider>` — after editing one provider's actions/metas/manifest.
- `app validate --all` — before a provider-touching commit/PR (and in any future
  provider-readiness gate) to catch orphan metas / manifest drift across the board.
- `app scaffold <id>` — to start a new provider (see below).

## `app scaffold <provider>`

Generates the **smallest conventional skeleton**: a single, contract-valid
`integrations/<id>/manifest.ts` with capabilities all `false`, empty scopes,
`tokenScope: "user"`, `isEnabled: false`, and explicit `TODO(<id>)` comments for
every human/provider-specific decision (OAuth, scopes, endpoints, actions,
triggers, fields, tests, icon/category). It **invents nothing** — no scopes, no
endpoints, no fake actions/triggers, no network calls.

Design choices (grounded in repo conventions): manifests register by **explicit
import** in `integrations/_registry.ts`. By default scaffold does **not** edit the
registry — the generated provider is inert until wired (a valid intermediate
state). Pass **`--register`** to wire it in the same run (see *Registry awareness*
below). No provider ships a README/TODO file, so TODOs live as manifest comments +
printed guidance, not a new file. Empty `actions/`/`triggers/` dirs aren't
git-tracked and generating placeholder actions would invent behavior, so the
skeleton is manifest-only.

**It refuses to overwrite** an existing `integrations/<id>/` (no `--force` in this
slice). `--dry-run` prints the file plan + predicted validation and writes nothing.
Writes go through the injectable `FsWriter` (the only write surface in the CLI);
everything else stays read-only.

**Does it pass validation immediately?** Yes — `app validate <id>` PASSES right after
scaffold (complete manifest, no actions/triggers). It also satisfies the repo's
`integration-manifests` structure test (the folder has a `manifest.ts`). It will
**not** appear in the running app until a developer registers it in
`integrations/_registry.ts` and implements the TODOs.

## Registry awareness (`--register` / `app register`)

The CLI reads `integrations/_registry.ts` as **text only** (it never imports the
registry or any provider code) to know whether a manifest is wired in. See
[`registry.ts`](./registry.ts).

- **Detection** is anchored on the **import path** (`from "./<id>/manifest"`), which
  is exactly the provider id — so it is independent of export-symbol casing (e.g.
  `microsoft-onedrive` exports `microsoftOneDriveManifest`, not the dash-derived
  `microsoftOnedriveManifest`). A provider is *registered* when it is imported **and**
  its symbol also appears in `ALL_MANIFESTS`. An unreadable registry → `?` (unknown),
  never asserted as a fact.
- **`app validate`** surfaces an unregistered manifest as a **`MANIFEST_NOT_REGISTERED`
  warning** — never an error — because a freshly-scaffolded, inert provider is a valid
  intermediate state. So `app validate --all` stays green for it.
- **Patching** (`scaffold --register`, `app register`) is a **narrow, deterministic,
  two-point text patch**: one import appended after the last existing manifest import,
  one `ALL_MANIFESTS` entry appended before the array's `];`. It **appends** (does not
  re-sort) because the real file groups entries by slice with comments and is not
  strictly id-sorted — appending preserves local convention and keeps the edit to two
  lines (never a full rewrite). `app register` reads the manifest's **real** exported
  symbol so divergent casing wires correctly.
- If the registry's expected anchors (a manifest import, the `ALL_MANIFESTS` array)
  are absent, patching is **refused** (nothing written) and manual wiring instructions
  are printed — we decline rather than risk a malformed edit.

`scaffold` (new provider) and `register` (existing provider) are deliberately
separate: `scaffold` never touches an existing `integrations/<id>/`, and `register`
never creates a manifest.

## `app action scaffold <provider> <action>`

Creates the smallest repo-conventional **action unit** for an **existing** provider.
See [`commands/appActionScaffold.ts`](./commands/appActionScaffold.ts). It invents
nothing — no scopes, no endpoints, no real behavior, no secrets, no network.

**Layout chosen — the sibling triad** (the dominant / new-provider convention; only
hubspot uses an `actions/meta/` subfolder, 24/25 providers use siblings):

```
integrations/<provider>/actions/<base>.ts          # handler
integrations/<provider>/actions/<base>.schema.ts   # resolved-config Zod schema
integrations/<provider>/actions/<base>.meta.ts     # ActionMeta (builder/AI)
```

A provider's **existing** convention is preserved: if `actions/meta/` already exists,
the meta is written there instead (handler + schema stay in `actions/`).

**Naming** (from `send-test-message`): metadata key `<provider>:send_test_message`
(snake_case `type`, matching the `ActionMetaSchema` key regex); file basename
`sendTestMessage` (camelCase); schema const `SendTestMessageConfigSchema`; meta export
`<providerCamel>SendTestMessageMeta`.

**Generated behavior (intentionally TODO):**
- **Handler** — validates `input.config` against the schema (defense-in-depth) then
  `throw new Error("<provider>:<type> is not implemented yet …")`. No provider call, no
  fake success — it can never be mistaken for production-ready.
- **Schema** — `z.object({})` with a TODO to add real fields, kept in sync with the
  meta's `fields[]`.
- **Meta** — Zod-valid `ActionMeta`: correct `key`/`provider`/`type`, `displayName`
  (Title Case), a `TODO(...)` description, `category: "other"`, `requiresIntegration:
  true`, empty `fields`/`outputs`, and the safe risk/file defaults the inferred type
  requires (`producesFileRef:false`, `displayOrder:null`, `riskLevel:"low"`, …).

**Refusals:** unknown provider (no `manifest.ts`), invalid action id, and any collision
with an existing action unit of the same basename (sibling or `actions/meta/`). No
`--force`. **Unregistered provider** is a **warning, not a failure** — the files are
created but the action won't load until the provider is wired (`app register <id>`).

**Predicted validation:** the triad is built into an overlay and run through
`validateProvider`, so `--dry-run` shows the exact `app validate <provider>` verdict —
a clean triad keeps the provider **PASS**.

The handler/meta are **not** registered in the app inventories, and `isEnabled` is
untouched — so the action does not run or appear in the builder until a developer
finishes it + runs `app action register`. Next: `app validate <provider>` → `app
validate --all`.

## Action registry awareness (`app validate` + `app action register`)

Actions are wired into the app through two hand-maintained inventories (text-read
only — never imported). See [`actionRegistry.ts`](./actionRegistry.ts).

- **Handler inventory** `services/execution/handlers/_handlerInventory.ts` — a single
  file: `import { <export> as <alias> }` + `ALL_HANDLERS` entries
  `{ provider, type, handler: <alias> }`.
- **Discovery meta inventory** `services/discovery/_metaInventory.ts` — **two
  patterns**: ~140 metas imported directly (`@/integrations/…/X.meta` →
  `ALL_ACTION_META`), and ~18 providers imported **indirectly** through a barrel
  `services/discovery/providers/<provider>.ts` that owns the `@/integrations` import +
  a `<X>_ACTION_METAS` array spread into `ALL_ACTION_META`. Detection therefore reads
  the central inventory **plus the provider's barrel** — reading central alone
  false-negatives every barrel-backed provider.

**Detection** is anchored on the IMPORT PATH (`@/integrations/<provider>/actions/<…>/
<base>[.meta]`), exactly the provider + action basename, so it is independent of
export/alias casing (mirrors the provider-registry detection). Handler = imported +
referenced by an `ALL_HANDLERS` entry; meta = imported + present in an action-metas
array. Unreadable inventory → `unknown` (skipped — never a false negative).

**`app validate`** emits, per **complete** triad (handler + meta + schema):
`ACTION_META_NOT_REGISTERED` and/or `ACTION_HANDLER_NOT_REGISTERED` as **warnings**
(never errors) — a freshly-scaffolded, unimplemented action is intentionally
unregistered, so it must warn, not fail. Real registered actions stay clean
(`app validate --all` = 25 pass / 0 warn / 0 fail).

**`app action register`** patches the inventories with the same narrow, deterministic
append used for the provider registry (import after the last matching import; entry
before the array's `];`). It:
- requires the full triad to exist;
- **refuses a scaffold placeholder** — if the handler still contains the exact
  `app action scaffold` throw marker, it exits 2 and tells you to implement it first
  (operator safety, **not** a security boundary — it only recognizes the known
  marker);
- no-ops cleanly when already registered;
- routes the meta to the provider's **barrel** when one exists, else central
  `ALL_ACTION_META`; the handler always goes to `_handlerInventory.ts`;
- refuses (writing nothing) with manual instructions when a registry's anchors are
  missing/unreadable;
- patches only the side(s) actually missing (e.g. meta-only when the handler is
  already wired).

**`app list` action-registry counts were deliberately skipped.** The table already
carries 8 columns (`enabled · registered · actions · meta · schema · trigMeta`), and
per-action registration is surfaced precisely and actionably by `app validate`
(`ACTION_*_NOT_REGISTERED` warnings). Two more numeric columns would widen the table
for marginal at-a-glance value — the task explicitly permits skipping with rationale.

## `app trigger scaffold <provider> <trigger>`

Creates the smallest repo-conventional trigger unit for an **existing** provider.
See [`commands/appTriggerScaffold.ts`](./commands/appTriggerScaffold.ts).

**Layout chosen — folder-per-trigger** (`triggers/<base>/<base>.meta.ts`), the
dominant convention (slack, gmail, airtable, monday, stripe, outlook …; only the
`native` pseudo-provider uses a flat `triggers/<base>.meta.ts`). **Triggers do NOT
follow the action triad** — there is no handler/schema sibling. Runtime arming
(webhook subscription / polling / filter) lives in activation-specific files
(`activate.ts`, `deactivate.ts`, `poll.ts`, `filter.ts`, `index.ts`, `schema.ts`, …)
that encode REAL provider behavior, so the scaffold emits **none** of them — only the
builder/AI `*.meta.ts`.

**Naming** (from `message-posted`): key `<provider>:message_posted` (snake `type`,
matching the `TriggerMetaSchema` key regex), file basename `messagePosted`, meta
export `<providerCamel>MessagePostedTriggerMeta`.

**Generated metadata (intentionally TODO + inert):** a Zod-valid `TriggerMeta` with
correct `key`/`provider`/`type`, Title-Case `displayName`, a `TODO(...)` description,
`category: "other"`, `requiresIntegration: true`, empty `fields`/`payloadShape`, and
`displayOrder: null` (the inferred type requires `payloadShape` + `displayOrder`
explicitly). **`activation: "manual"`** is the inert choice — a manual trigger fires
only via run-now, subscribes to nothing and polls nothing, so the scaffold invents no
webhook/polling behavior and the trigger is never accidentally runnable/subscribable.

**Refusals:** unknown provider (no `manifest.ts`), invalid trigger id, and any
collision with an existing trigger unit / `triggers/<base>/` folder. No `--force`.
**Unregistered provider** is a **warning, not a failure** — the file is created but
won't load until the provider is wired (`app register <id>`).

**Predicted validation:** the meta is built into an overlay and run through
`validateProvider`. A scaffolded trigger is intentionally unregistered, so against a
repo whose discovery inventory is present it shows **PASS with 1 warning**
(`TRIGGER_META_NOT_REGISTERED`) — clearly explained, never an error.

**Trigger registration is DETECTION-ONLY this slice (patching deferred).** `app
validate` warns `TRIGGER_META_NOT_REGISTERED` when a trigger meta isn't wired into the
discovery inventory (`ALL_TRIGGER_META`, or a provider barrel's `<X>_TRIGGER_METAS`) —
detection combines the central inventory with the provider's barrel, anchored on the
import path, exactly like the action-meta check. There is **no `app trigger
register`**: a real trigger also needs its runtime files + a side-effect import in
`integrations/_registry.ts`, which is not a safe blind text-patch. **Manual step:**
implement the runtime + add the meta import/array entry to `_metaInventory.ts`
(`ALL_TRIGGER_META`) or the provider barrel, then add the runtime side-effect import.
Next: `app validate <provider>` → `app validate --all`.

**Future slices** should extend `validateProvider()` in
[`commands/appValidate.ts`](./commands/appValidate.ts) by appending `Finding`s — the
result shape, `--all` summary, and renderer already support it (append a `Finding`).
Deferred next checks that need real AST parsing (not text scan) to stay
false-positive-free: per-field shape (key/label/type validity inside `fields[]`),
duplicate field/output **names**, output/field **type-value** validity, and
`scopes.required`-non-empty-when-OAuth. Keep the no-import / text-scan posture (do
not pull app code into the CLI) and keep findings actionable.

## Tests

`tests/unit/chainreact/cli.test.ts` — arg parsing, help, status (in-memory fs),
`app validate` structural + **deep meta/manifest completeness** + **value checks**
(category/tokenScope enum validity parsed from seeded contracts, comment-stripping
robustness, requiresIntegration/fields/scopes shape warnings, error-vs-warning),
`app validate --all` summary (incl. a value-level failure), `app list` (incl. the
**registered** column), **registry awareness** (detection by import-path with
divergent export casing, `MANIFEST_NOT_REGISTERED` warning, narrow patch
construction + refusal on unsafe formats, `scaffold --register`, `app register`),
**action scaffolding** (id normalization to snake/camel/Pascal/Title, sibling-vs-
`actions/meta/` layout choice, dry-run-writes-nothing, triad creation, correct
meta key/provider, overlay validation, unknown-provider / invalid-id / collision
refusals, unregistered-provider warning), **action registry awareness** (handler +
meta detection anchored on import path, central-vs-barrel meta detection, placeholder
detection, `ACTION_*_NOT_REGISTERED` validate warnings, narrow patch construction +
refusals, `app action register` dry-run/real/placeholder-refusal/no-op/unknown/
incomplete/unsafe + barrel-target routing), **trigger scaffolding** (export
naming + folder layout, central-vs-barrel trigger-meta detection,
`TRIGGER_META_NOT_REGISTERED` validate warning, dry-run-writes-nothing, inert
manual-activation meta, unknown-provider / invalid-id / collision refusals,
unregistered-provider warning), verify planning/execution (fake runner),
**diff-aware verify** (`mergeChangedPaths` dedupe/sort, `recommendChecks` mapping per
change type with structured `exec`, **command rendering + allow-list accept/reject**,
`classifyRec` tiering, dry-run-doesn't-execute, `--run` runs auto bare-scripts AND safe
targeted `app validate`/`jest` commands in order, heavy-only-with-`--with-tests`,
manual/rejected not executed, fail-fast, missing-script skip, graceful git failure,
existing `verify` unchanged — all via injected changed-files reader + structured
executor, no git/process spawned), **closeout report** (`computeFinalStatus` for all 5
statuses, `buildChangedReport` fail-fast/failed-command capture, next-command
suggestions per status, no shell-metacharacters in output, deterministic `--json`
shape, `--report` appends / `--json` emits-only via dispatch), mcp-smoke wrapping, and
`run()` dispatch. No disk, no spawned processes.

## Adding a command (deliberately)

1. Add a pure module under `scripts/chainreact/commands/` (collect/plan + render).
2. Route side effects through the injected `CommandRunner` (`runner.ts`).
3. Wire a `case` in `cli.ts` and a line in `help.ts`.
4. Add tests in `tests/unit/chainreact/`.

Do **not** add execution, deploy, db, secret, or network capability.
