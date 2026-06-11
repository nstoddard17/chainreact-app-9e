# Runbook: Internal Developer MCP Server

**Status:** Stage 1 — local/internal developer tooling only.
**Location:** [`scripts/mcp/`](../../scripts/mcp/)
**Audience:** Engineers + AI coding hosts (Claude Desktop, Codex, Claude Code).

## What this is

A minimal, zero-dependency [Model Context Protocol](https://modelcontextprotocol.io)
server that exposes a **curated, read-only** slice of the ChainReactV2 repo —
docs, rule files, provider-manifest summaries, and the builder-metadata gap
tracker — to an AI coding host so it can ground itself in project context.

It is a **local developer tool**, not a ChainReact product feature. It is not
user-facing, opens no network port (stdio transport only), and reaches no
runtime app code.

## What it deliberately does NOT expose

This is the security contract. The server has **no** path to any of these:

- **No production data.** No database connection of any kind.
- **No Supabase / service-role / repository / DB client imports.** Enforced by a
  test (`tests/unit/mcp/server-safety-guards.test.ts`).
- **No env values, OAuth tokens, API keys, secrets, or credentials.** The file
  whitelist excludes them; a redaction pass scrubs any credential-shaped string
  that slips into a doc; `.env`, `*.key`, `*.pem`, `service-role`, `secret`,
  `token`, `credential`, and `*.dump` filenames are refused outright.
- **No arbitrary file reads.** There is no generic "read any file" tool. Reads
  are whitelist-first: only `docs/**`, `CLAUDE.md`, and
  `integrations/<provider>/manifest.ts` are reachable, with path-traversal
  protection and a per-file byte cap.
- **No provider code execution.** Provider manifests are **text-parsed**, never
  imported — importing one would run `ProviderManifestSchema.parse(...)` and pull
  app code into the tool. (`tests/unit/mcp/manifest-summary.test.ts` proves a
  side-effectful manifest body is never executed.)
- **No mutation.** No `db:push`, migrations, deploy, `git push`, PR creation, or
  shell passthrough. The only commands it can run are three exact, read-only npm
  scripts (below).
- **No architecture bypass.** It does not touch the account-ownership model, RLS,
  the OAuth dispatcher, the workflow engine, or the provider registry at runtime.

## Tools exposed

Read-only context tools:

| Tool | What it returns |
|---|---|
| `get_project_memory` | `docs/PROJECT_MEMORY.md` (curated rolling state). |
| `list_rule_docs` | The rule docs under `docs/rules/` with titles. |
| `read_rule_doc` | One `docs/rules/<name>.md` by bare name. |
| `search_project_docs` | Case-insensitive substring search across `docs/**.md` + `CLAUDE.md`, returns `file:line` snippets. |
| `list_provider_manifests` | Provider ids under `integrations/` that ship a `manifest.ts`. |
| `get_provider_manifest_summary` | Capability summary for one provider (text-parsed, never executed). |
| `list_builder_metadata_gaps` | The builder-metadata launch-gap tracker's pending section + status snapshot (only registered if the tracker exists). |
| `get_claude_instructions_summary` | Heading outline of `CLAUDE.md`. |

Bounded local command wrappers (each runs one **exact** allowlisted, non-mutating
npm script with a timeout and truncated output):

| Tool | Runs |
|---|---|
| `run_typecheck` | `npm run typecheck` (`tsc --noEmit`) |
| `run_lint` | `npm run lint` (`eslint .`) |
| `run_structure_lint` | `npm run lint:structure` (leaf-folder counts) |

Every result is secret-redacted and size-capped before it leaves the process.

## Run it locally

```bash
# 1. Build (emits to scripts/mcp/dist/, which is gitignored)
npm run mcp:build

# 2. Start the stdio server
npm run mcp:start
# (equivalently: node scripts/mcp/dist/server.js)
```

The server speaks newline-delimited JSON-RPC 2.0 on stdio. Diagnostics go to
**stderr only** — stdout is reserved for the protocol stream. Quick manual check:

```bash
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05"}}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
  | node scripts/mcp/dist/server.js
```

## Connect from an AI host

The host launches the **built** server as a subprocess. Build once
(`npm run mcp:build`), then point the host at the compiled entry with an absolute
path.

**Claude Desktop** — `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "chainreact-v2-dev": {
      "command": "node",
      "args": ["C:\\Users\\marcu\\source\\repos\\ChainReactV2\\scripts\\mcp\\dist\\server.js"],
      "env": {
        "CHAINREACT_REPO_ROOT": "C:\\Users\\marcu\\source\\repos\\ChainReactV2"
      }
    }
  }
}
```

`CHAINREACT_REPO_ROOT` is optional — the server locates the repo root from its
own location — but setting it explicitly is safest when the host launches with an
unrelated working directory. Codex / other MCP hosts use the same
`command` + `args` shape in their own config format.

## How to extend it (deliberately)

Adding a tool is a code change, never dynamic discovery:

1. Add a `ToolDefinition` in a file under `scripts/mcp/tools/`.
2. Register it in `scripts/mcp/tools/index.ts`.
3. If it reads a new location, add that location to the whitelist in
   `scripts/mcp/config.ts` and route the read through `readAllowedFile`.
4. Add a test under `tests/unit/mcp/`.

Do **not** add a generic file reader, a generic command runner, a `make_api_call`
escape hatch, or anything that mutates external state. Those are out of scope for
this tool by design.

## Architecture / boundaries

- Lives under `scripts/mcp/` (operational scripts), isolated from app runtime.
- Imports only Node built-ins — no app modules, no Supabase, no repositories.
- Source is TypeScript, typechecked by the root `npm run typecheck` and tested by
  Jest; built to runnable CommonJS via `scripts/mcp/tsconfig.json` (zero new
  dependencies). The `dist/` output is gitignored.

## Tests

`tests/unit/mcp/` (34 tests): path whitelist + traversal rejection, secret
redaction, output truncation, manifest text-parse-without-execution, the
allowed-doc-read happy path, registry/protocol wiring, and the no-DB-import /
command-allowlist safety guards.
