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
| `chainreact app list` | Lists discovered providers with text-derived fields: id, displayName, enabled, action handler/meta/schema counts, trigger-meta count. Never imports provider code. Deterministic (sorted by id). |
| `chainreact app validate <provider>` | Foundation validator for `integrations/<provider>/` metadata. Filesystem/text checks only — never imports provider code. |
| `chainreact app validate --all [--verbose]` | Runs the validator across **every** discovered provider; prints a summary (total / pass / warn / fail + per-provider status). Failures list their errors inline; `--verbose` also lists warnings. |
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

`app validate` is a **foundation**. Today it checks the obvious, already-established
structure:

- provider folder + `manifest.ts` exist;
- manifest declares an `id` that matches the folder, plus `displayName` / `isEnabled`;
- no orphan **action** meta (`*.meta.ts` without its `*.ts` handler — mirrors the
  `discovery-meta-coverage` "no orphan meta" rule);
- action units (handler + `*.schema.ts`) that are missing a `*.meta.ts`.

It intentionally does **not** assume a trigger handler layout (triggers use a
different shape — e.g. `<name>.meta.ts` + `filter.ts`), and it reports trigger
metas only as a count.

Provider **discovery + manifest text-parsing** is shared in
[`providers.ts`](./providers.ts) (`listKnownProviders`, `collectActionUnits`,
`scanField`/`scanBoolField`, `inventoryProvider`, `providerCounts`). Action triad
matching is by **basename** across the `actions/` tree, so both layouts work: metas
next to handlers (slack) and metas in a dedicated `actions/meta/` subfolder
(hubspot). `app validate`, `app validate --all`, and `app list` all build on this
one module — so do future `app audit` / `app scaffold` commands.

**When to run these:**
- `app list` — quick inventory while planning provider work or checking enabled state.
- `app validate <provider>` — after editing one provider's actions/metas/manifest.
- `app validate --all` — before a provider-touching commit/PR (and in any future
  provider-readiness gate) to catch orphan metas / manifest drift across the board.

**Future slices** should extend `validateProvider()` in
[`commands/appValidate.ts`](./commands/appValidate.ts) by appending `Finding`s — the
result shape, `--all` summary, and renderer already support it. Natural next checks:
OAuth scope declarations, field/schema definitions, AI metadata, builder visibility,
icons, categories, and deeper trigger/action validation. Keep the no-import /
text-scan posture (do not pull app code into the CLI) and keep findings actionable.

## Tests

`tests/unit/chainreact/cli.test.ts` — arg parsing, help, status (in-memory fs),
`app validate` failure + structural findings, verify planning/execution (fake
runner), mcp-smoke wrapping, and `run()` dispatch. No disk, no spawned processes.

## Adding a command (deliberately)

1. Add a pure module under `scripts/chainreact/commands/` (collect/plan + render).
2. Route side effects through the injected `CommandRunner` (`runner.ts`).
3. Wire a `case` in `cli.ts` and a line in `help.ts`.
4. Add tests in `tests/unit/chainreact/`.

Do **not** add execution, deploy, db, secret, or network capability.
