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
  scripts (below). The script name is a compile-time constant from the allowlist
  — **no tool argument ever reaches the command line**, so there is no
  argument-injection surface. (On Windows a shell is required to launch the
  `npm.cmd` shim; it is enabled only there and only over the static allowlist.)
- **Redact-before-truncate.** Output is secret-redacted **first**, then length-
  capped. Truncating first could cut a credential so its tail no longer matches
  the redaction regex, leaking the head; redacting the full string first makes a
  partial-secret leak impossible. Redaction is applied at the single protocol
  egress point (every tool passes through it) plus per-file at read time
  (defense-in-depth).
- **Cross-platform traversal guard.** Absolute paths, `..`/`.` segments (split on
  both `/` and `\`), and percent-encoded sequences (`%2e`/`%2f`/`%5c`) are
  rejected before resolution; blocked filename patterns match case-insensitively.
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

Every result is **redacted then size-capped** before it leaves the process (order
matters — see Security boundaries).

## Implemented MCP protocol subset

The server is a hand-rolled, **zero-dependency** implementation of the subset of
MCP that stdio hosts (Claude Desktop / Codex / Claude Code) actually drive. We do
**not** vendor an MCP SDK: the surface below is small, fully covered by tests +
a stdio smoke test, and an SDK would add a dependency to the live app's tree for
no behavioural gain. If a future host needs resources/prompts/sampling, revisit.

**Transport:** newline-delimited JSON-RPC 2.0 over stdio — one JSON object per
line, no embedded newlines (the MCP stdio framing). `stdout` carries **only**
JSON-RPC responses; all diagnostics go to `stderr`.

| Method | Behaviour |
|---|---|
| `initialize` | Returns `protocolVersion` (echoes the client's requested version), `capabilities: { tools: {} }`, and `serverInfo`. Version-agnostic by design — the implemented methods are stable across current MCP revisions. |
| `tools/list` | Returns `{ tools: [{ name, description, inputSchema }] }`. No cursor pagination (tool set is small + static). |
| `tools/call` | Returns `{ content: [{ type: "text", text }] }`. Tool-execution failures return `isError: true` with a text message (not a transport error); unknown tool / missing `name` return a JSON-RPC error. |
| `ping` | Returns `{}`. |
| Notifications (no `id`, e.g. `notifications/initialized`) | Processed, no response emitted. |
| Malformed JSON line | JSON-RPC `-32700` (Parse error), `id: null`. |
| Unknown method (with `id`) | JSON-RPC `-32601` (Method not found). |

JSON-RPC error objects use the standard `{ code, message }` shape. Batch arrays
are not supported (batching was removed from MCP in the 2025-06-18 revision).

## Run it locally

```bash
# 1. Build (emits to scripts/mcp/dist/, which is gitignored)
npm run mcp:build

# 2. Start the stdio server
npm run mcp:start
# (equivalently: node scripts/mcp/dist/server.js)
```

The server speaks newline-delimited JSON-RPC 2.0 on stdio. Diagnostics go to
**stderr only** — stdout is reserved for the protocol stream.

**One-command health check:**

```bash
npm run mcp:smoke
```

`mcp:smoke` builds the server, then runs [`scripts/mcp/smoke.mjs`](../../scripts/mcp/smoke.mjs),
which spawns the built `dist/server.js` and drives `initialize` → `tools/list` →
one read-only `tools/call` (`list_provider_manifests`), asserting stdout is pure
JSON-RPC. It is read-only, spawns the fixed server with no arguments, and exits
non-zero on any failure. Use it after pulling changes or before wiring a host.

## Connect from an AI host

**Host-verification status:**

- ✅ **Raw stdio protocol — verified locally.** A scripted stdio smoke test
  drives `initialize` → `tools/list` → a read-only `tools/call` → a rejected
  unsafe (path-traversal) `tools/call` → `ping` → a malformed line → the
  `run_structure_lint` wrapper → an unknown method → a notification, and confirms
  `stdout` contains only JSON-RPC while logs stay on `stderr`.
- 📄 **Claude Desktop / Codex host config — documented but NOT host-verified.**
  The config blocks below follow each host's documented MCP-server schema but
  have not been launched end-to-end from the GUI app in this environment. Treat
  them as a starting point; verify in your host before relying on them.

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

## Claude usage workflow

Start the MCP server (or have the host launch it) at the **beginning of a
ChainReactV2 coding session**, before planning a slice. Use the read-only context
tools to ground in the repo's own source of truth instead of guessing.

**Recommended order in a fresh chat:**

1. `get_project_memory` — current status, durable decisions, open follow-ups.
2. `get_claude_instructions_summary` — the CLAUDE.md outline (operating rules).
3. `list_rule_docs` → `read_rule_doc <name>` — pull the rule(s) relevant to the
   slice (e.g. `account-ownership-model`, `provider-registry`, `testing-strategy`).
4. When the work touches a provider: `list_provider_manifests` →
   `get_provider_manifest_summary <provider>` to confirm capabilities/scopes.
5. When the work concerns builder/provider readiness:
   `list_builder_metadata_gaps` for the launch-gap tracker state.
6. `search_project_docs <term>` to locate a specific decision or pattern.

Then plan and implement. The command wrappers (`run_typecheck`, `run_lint`,
`run_structure_lint`) are available for quick local gates during the session.

**Example prompts Marcus can use:**

- "Use the ChainReactV2 MCP server to read project memory and the relevant rule
  docs before planning this slice."
- "Use MCP to inspect the provider manifests before proposing this provider slice."
- "Use MCP to check the builder-metadata gap tracker before recommending the next
  provider work."

## Do NOT use the MCP server for

This is a context tool, not an operations tool. It cannot — and must not be asked
to — do any of the following (they are out of Stage-1 scope by design):

- **Production data inspection** — it has no production access of any kind.
- **Database reads or writes** — no DB/Supabase/service-role connection exists.
- **Migrations / `db:push`** — not exposed; run those through the normal flow.
- **Deployment / `git push` / PR creation** — no mutating or remote commands.
- **Workflow mutation** — it never touches the workflow engine or runtime state.
- **Broad secret scanning** — redaction is a safety net, not a discovery feature;
  do not point it at secret stores or env files (they are blocked anyway).
- **Replacing the source-of-truth repo docs** — its output is a convenience view;
  the files under `docs/` and the live code remain authoritative.

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

## Known limitations

- **`dist/` must be built before launch.** `npm run mcp:start` runs the compiled
  `scripts/mcp/dist/server.js`; run `npm run mcp:build` first (zero-dependency
  tradeoff — no on-the-fly TS runner). `dist/` is gitignored and excluded from
  the leaf-folder structure lint.
- **GUI host configs are unverified** (see Host-verification status above).
- **No resources / prompts / sampling / cursor pagination** — only the
  `tools/*` + `initialize`/`ping` subset is implemented. Add deliberately if a
  host needs more.
- **Command wrappers run real npm scripts** and can take time (`run_lint`,
  `run_typecheck`); each has a wall-clock timeout and capped, redacted output.

## Tests

`tests/unit/mcp/` (46 tests):

- **Core:** path whitelist + traversal rejection, secret redaction, output
  truncation, manifest text-parse-without-execution, allowed-doc-read happy path,
  registry/protocol wiring, no-DB-import / command-allowlist safety guards.
- **Hardening (`security-hardening.test.ts`):** Windows backslash + percent-
  encoded traversal, case-insensitive blocked-name rejection, command-argument
  injection (`npmArgsFor` allowlist), redact-before-truncate ordering + protocol
  egress redaction, search-cannot-dump-blocked-files (live fixture), and an
  import-boundary scan asserting every `scripts/mcp` import is a `node:` builtin
  or a relative local module.

Plus `npm run mcp:smoke` ([`scripts/mcp/smoke.mjs`](../../scripts/mcp/smoke.mjs)) —
a build-and-drive stdio check against the built server (`initialize` →
`tools/list` → one read-only `tools/call`, asserting pure-JSON-RPC stdout).
