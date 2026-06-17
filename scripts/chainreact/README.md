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
| `chainreact mcp smoke [--dry-run]` | Thin wrapper over the existing `npm run mcp:smoke`. `--dry-run` prints the command. Fails gracefully if the script is absent. Adds no MCP tools/permissions. |
| `chainreact app list` | Lists discovered providers with text-derived fields: id, displayName, enabled, **registered** (`yes`/`no`/`?`), action handler/meta/schema counts, trigger-meta count. Never imports provider code. Deterministic (sorted by id). |
| `chainreact app validate <provider>` | Foundation validator for `integrations/<provider>/` metadata. Filesystem/text checks only — never imports provider code. Adds a `MANIFEST_NOT_REGISTERED` **warning** when the manifest isn't wired into `_registry.ts` (never an error). |
| `chainreact app validate --all [--verbose]` | Runs the validator across **every** discovered provider; prints a summary (total / pass / warn / fail + per-provider status). Failures list their errors inline; `--verbose` also lists warnings. |
| `chainreact app scaffold <id> [--dry-run] [--register]` | Creates a minimal, contract-valid provider skeleton under `integrations/<id>/` (a single `manifest.ts`, capabilities off, TODOs for the rest). Refuses to overwrite an existing provider. **Default: does not edit the registry** (provider stays inert). `--register` additionally wires the new manifest into `_registry.ts` (1 import + 1 `ALL_MANIFESTS` entry). `--dry-run` prints the plan (+ the registry patch when `--register`) and writes nothing. |
| `chainreact app register <id>` | Wires an **existing** provider's manifest into `_registry.ts` (1 import + 1 `ALL_MANIFESTS` entry). Requires `integrations/<id>/manifest.ts` to exist; refuses unknown dirs; no-ops cleanly if already registered; refuses (writes nothing) if the registry format can't be patched safely. `--dry-run` prints the patch and writes nothing. |
| `chainreact app action scaffold <provider> <action> [--dry-run]` | Creates a minimal action **triad** (`<base>.ts` handler + `.schema.ts` + `.meta.ts`) for an **existing** provider. The handler validates config then **throws "not implemented"** (no network, no fake success); the meta is Zod-valid (no fields/outputs, `category: "other"`) so the provider keeps passing `app validate`. Refuses unknown providers, invalid action ids, and collisions with an existing action unit. Does **not** register the handler/meta or change `isEnabled`. `--dry-run` prints the plan + predicted validation and writes nothing. |
| `chainreact --help` / `-h` | Usage. |

## Usage

```bash
npm run chainreact -- status
npm run chainreact -- verify              # dry-run (default)
npm run chainreact -- verify --run        # run the safe subset
npm run chainreact -- verify --run --with-tests
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
```

`npm run chainreact` builds first (`chainreact:build`) then runs — so it always
reflects current source.

**Exit codes:** `0` ok, `1` validation/verification failure, `2` usage error. For
`app validate --all`, exit is `0` only when **no** provider has an ERROR finding —
warnings never fail the command. `app list` is read-only and always exits `0`.

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

The handler/meta are **not** registered in `services/execution/handlers/_registry.ts`
or `services/discovery/_registry.ts`, and `isEnabled` is untouched — so the action does
not run or appear in the builder until a developer finishes + registers it. Next:
`app validate <provider>` → `app validate --all`.

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
refusals, unregistered-provider warning), verify planning/execution (fake runner),
mcp-smoke wrapping, and `run()` dispatch. No disk, no spawned processes.

## Adding a command (deliberately)

1. Add a pure module under `scripts/chainreact/commands/` (collect/plan + render).
2. Route side effects through the injected `CommandRunner` (`runner.ts`).
3. Wire a `case` in `cli.ts` and a line in `help.ts`.
4. Add tests in `tests/unit/chainreact/`.

Do **not** add execution, deploy, db, secret, or network capability.
