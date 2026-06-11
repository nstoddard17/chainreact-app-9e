# Runbook: ChatGPT Developer Mode — MCP HTTP transport (Stage 1.5)

**Status:** Stage 1.5 — local/internal developer tooling only. NOT a ChainReact
product feature, NOT user-facing.
**Location:** [`scripts/mcp/`](../../scripts/mcp/) (HTTP transport under
[`scripts/mcp/http/`](../../scripts/mcp/http/) + [`scripts/mcp/httpServer.ts`](../../scripts/mcp/httpServer.ts))
**Audience:** Marcus (local dev). Companion to
[internal-mcp-server.md](./internal-mcp-server.md).

## What this adds

Stage 1 shipped a **stdio** MCP server for Claude Code/Desktop. Stage 1.5 adds a
**second transport — Streamable HTTP** — onto the **same** curated, read-only
tool registry, so a **ChatGPT Developer Mode custom connector** (or any
Streamable-HTTP MCP client) can reach it.

It is the same core, not a fork:

- Same `buildRegistry()` tool set (the 10 read-only context tools + 3
  allowlisted command wrappers — no new tools).
- Same `handleRpc()` protocol handling.
- Same redact-before-truncate egress, the same path whitelist, the same
  command allowlist.
- **Zero new dependencies** — `node:http` + `node:crypto` only.

The stdio server is **unchanged** and still opens no network port.

## stdio (Claude Code) vs HTTP (ChatGPT) — the difference

| | stdio (`mcp:start`) | HTTP (`mcp:http`) |
|---|---|---|
| Client | Claude Code / Desktop / Codex | ChatGPT Developer Mode, Claude.ai custom connectors, curl |
| Transport | newline-delimited JSON-RPC over stdin/stdout | JSON-RPC over HTTP POST to a single `/mcp` endpoint |
| Network port | none (subprocess pipes) | one TCP port, **loopback by default** |
| Auth | none needed (local subprocess) | **bearer token required** |
| Reachability | local subprocess only | localhost; external only via a tunnel |

Use stdio for Claude Code. Use HTTP only when you specifically want ChatGPT (or
another remote MCP client) to reach the tools.

## Verified vs NOT verified

Honesty matters here — some of this could only be verified locally, not against
ChatGPT's live UI from this environment.

- ✅ **Streamable HTTP wire protocol — verified locally.** `npm run mcp:http:smoke`
  spawns the built server on a loopback OS-assigned port and drives a real
  `initialize` → `tools/list` → `tools/call` over HTTP, asserts the
  `Mcp-Session-Id` header is returned, confirms an unauthenticated request is
  rejected with `401`, that `GET` returns `405`, and that the bearer token never
  appears on stderr.
- ✅ **Spec conformance — sourced.** The transport shape (single `/mcp` endpoint,
  POST a JSON-RPC request → `200 application/json` with one response object,
  notification → `202`, optional `Mcp-Session-Id`, Origin validation, GET → 405)
  follows the MCP **Streamable HTTP** spec (revision 2025-06-18). SSE is optional
  in that spec; these tools are synchronous and non-streaming, so we answer with
  plain `application/json` (the client MUST support that case).
- ✅ **ChatGPT requirements — sourced.** OpenAI's Developer Mode docs confirm:
  remote MCP servers connect over **SSE or streaming HTTP**; **`search`/`fetch`
  tools are NOT required** ("Any tools your connector exposes … are available");
  auth options are **OAuth / No Authentication / Mixed**.
- ⚠️ **NOT verified: that ChatGPT forwards a static `Authorization: Bearer`
  header.** ChatGPT Developer Mode's built-in auth choices are **OAuth** or **No
  Authentication** — there is no first-class "paste a bearer token" field. We did
  not implement OAuth (out of scope for internal dev tooling) and could not drive
  ChatGPT's UI from this environment. See **Authenticating ChatGPT** below for the
  two workable paths and their tradeoffs.
- ⚠️ **NOT verified: the end-to-end ChatGPT connection.** The steps below follow
  OpenAI's documented flow but were not executed against the live product here.
  Treat "How to verify ChatGPT is actually calling it" as the acceptance gate.

## Setup

### 1. Set the bearer token (outside source control)

The server refuses to start without `MCP_HTTP_TOKEN` (min 16 chars) and never
logs it.

```bash
# Generate a strong token:
openssl rand -hex 32          # or: node -p "crypto.randomBytes(32).toString('hex')"

# PowerShell (Windows):
$env:MCP_HTTP_TOKEN = "<paste the generated token>"

# bash/zsh:
export MCP_HTTP_TOKEN="<paste the generated token>"
```

Do **not** put the token in `package.json`, a committed `.env`, or any tracked
file. Keep it in your shell session (or an untracked local env file you source
manually).

### 2. Build + run

```bash
npm run mcp:build        # emits scripts/mcp/dist/ (gitignored)
npm run mcp:http         # starts the HTTP server (needs MCP_HTTP_TOKEN set)
```

Default bind is `http://127.0.0.1:8765/mcp`. Override with `MCP_HTTP_HOST`,
`MCP_HTTP_PORT`, `MCP_HTTP_PATH`. Diagnostics go to **stderr only**; this process
writes nothing to stdout.

Health check (build + drive a real socket, then exit):

```bash
npm run mcp:http:smoke
```

### 3. Expose to ChatGPT with a tunnel

ChatGPT's backend calls your endpoint from the public internet, so a localhost
URL is not reachable. Put a tunnel in front of the loopback port:

```bash
# examples — pick one you trust
ngrok http 8765
cloudflared tunnel --url http://127.0.0.1:8765
```

Your public MCP endpoint is then `https://<tunnel-host>/mcp`.

**Tunnel risk — read this.** A tunnel publishes your machine to the internet. The
bearer token is the only gate. Mitigations baked in / recommended:

- The server binds **loopback only** by default. The tunnel — not a wide bind —
  is what crosses the network boundary. (Binding a non-loopback interface
  directly requires the explicit `MCP_HTTP_ALLOW_EXTERNAL=1` opt-in and prints a
  loud warning.)
- Keep the token secret; rotate it by restarting with a new `MCP_HTTP_TOKEN`.
- Stop the tunnel and the server when you're done — this is session tooling, not
  an always-on service.
- The tools are **read-only and curated** (no DB, no secrets, no writes, no
  arbitrary file read), so the blast radius of a leaked token is "someone can
  read your repo's docs + provider manifest summaries," not data loss.

### 4. Add the connector in ChatGPT Developer Mode

In ChatGPT → Settings → **Connectors** → enable **Developer mode** →
**Add custom connector** (sometimes labeled MCP server). Provide:

- **URL:** `https://<tunnel-host>/mcp`  *(see auth note below — you may append a
  query token here)*
- **Transport:** Streamable HTTP (the default for an `/mcp` URL).
- **Authentication:** see the next section.

ChatGPT will call `initialize` then `tools/list` to scan the tools. The 11 tools
should appear (e.g. `get_project_memory`, `list_rule_docs`, `read_rule_doc`,
`search_project_docs`, `list_provider_manifests`, `get_provider_manifest_summary`,
`run_typecheck`, …).

### Authenticating ChatGPT

ChatGPT's built-in auth choices are **OAuth** or **No Authentication**; it has no
"static bearer header" field, and we did not implement OAuth. Two workable paths:

1. **`?key=` query token (works with ChatGPT "No Authentication").** Register the
   connector URL as `https://<tunnel-host>/mcp?key=<your MCP_HTTP_TOKEN>`. The
   server accepts the token from the `key` (or `token`) query param as a fallback
   to the bearer header. **Tradeoff:** the token rides in the URL, which tunnels
   and proxies may log. Acceptable for short-lived local dev; rotate after.
2. **`Authorization: Bearer` header (verified with curl / Claude custom
   connectors).** If your ChatGPT build (or another MCP client) lets you set a
   custom Authorization header, use `Bearer <token>`. This is the primary,
   cleaner mechanism — the smoke test and all unit tests exercise it — but
   whether *ChatGPT* forwards it is the **unverified** part above.

Either way the server does a constant-time compare against `MCP_HTTP_TOKEN` and
rejects everything else with `401`.

## How to verify ChatGPT is actually calling it

1. Watch the server's stderr while ChatGPT connects — you'll see the process
   stays up and (if you add temporary logging) requests arriving. The token is
   redacted from all stderr output.
2. In ChatGPT, confirm the tool list populated (that means `initialize` +
   `tools/list` succeeded over your tunnel with auth accepted).
3. Ask ChatGPT to "use the connector to list the provider manifests" (calls
   `list_provider_manifests`) and confirm the returned text matches
   `npm run mcp:http:smoke`'s output / the stdio server's output for the same
   tool.
4. Negative check: temporarily use the wrong token in the connector URL and
   confirm ChatGPT reports a connection/auth failure (server returns `401`).

## Security boundaries (unchanged from Stage 1, plus HTTP-specific)

Everything in [internal-mcp-server.md → "What this deliberately does NOT
expose"](./internal-mcp-server.md) still holds — no production data, no
DB/Supabase/service-role, no env/secrets, no arbitrary file read, no mutation, no
provider code execution, redact-before-truncate, cross-platform traversal guard.
The HTTP transport adds **no** tools and **no** new reachable surface; it only
changes how requests arrive. HTTP-specific guarantees:

- **Auth required.** No request is served without the bearer token
  (header or `?key=`); compared in constant time; `401` otherwise.
- **Loopback by default.** Non-loopback bind requires `MCP_HTTP_ALLOW_EXTERNAL=1`
  and warns.
- **Origin validated.** A browser-style `Origin` header is rejected unless
  allow-listed (`MCP_HTTP_ALLOWED_ORIGINS`); server-to-server callers (ChatGPT,
  curl) send no Origin and are allowed — DNS-rebinding defense per the MCP spec.
- **Token never logged.** All stderr output is passed through a token-redaction
  pass; config errors are constructed token-free.
- **Body size capped** (1 MiB) → `413`.
- **No import escape.** The HTTP files import only `node:http`/`node:crypto` +
  local modules — enforced by the same import-boundary test that covers the rest
  of `scripts/mcp` (`tests/unit/mcp/security-hardening.test.ts`).

## Implemented HTTP wire shape

| Request | Response |
|---|---|
| `POST /mcp` JSON-RPC **request** (has `id`) | `200 application/json`, one JSON-RPC response object |
| `POST /mcp` `initialize` | as above + `Mcp-Session-Id` header (informational; stateless server) |
| `POST /mcp` JSON-RPC **notification** (no `id`) | `202 Accepted`, empty body |
| `POST /mcp` malformed JSON | `400`, JSON-RPC `-32700` |
| `POST /mcp` batch array | `400` (batching unsupported, matches stdio) |
| `GET /mcp` | `405` (`Allow: POST, DELETE`) — no server-initiated SSE offered |
| `DELETE /mcp` | `200` (stateless: nothing to tear down) |
| Any other path | `404` |
| Missing/wrong token | `401` (`WWW-Authenticate: Bearer`) |
| Disallowed `Origin` | `403` |

Protocol-version negotiation is lenient: `initialize` echoes the client's
requested `protocolVersion`, and the implemented methods (`initialize`,
`tools/list`, `tools/call`, `ping`, notifications) are stable across current MCP
revisions, so the server does not reject on `MCP-Protocol-Version`.

## Limitations / follow-ups

- **OAuth not implemented.** ChatGPT's first-class auth is OAuth; we use a shared
  bearer token instead (appropriate for single-user internal dev tooling). If a
  future need requires ChatGPT's native auth, add an OAuth 2.1 + Protected
  Resource Metadata layer — out of Stage-1.5 scope.
- **No server-initiated SSE / streaming.** `GET /mcp` is `405`. The tools are
  synchronous; add SSE only if a client needs server-pushed messages.
- **Stateless sessions.** `Mcp-Session-Id` is issued but not enforced on later
  requests (the tools hold no per-session state). Fine for these read-only tools.
- **ChatGPT end-to-end is unverified here** (see Verified vs NOT verified). The
  "How to verify" section is the acceptance gate to run on Marcus's machine.
- **Single shared token, manual rotation** (restart with a new value). No
  per-client tokens, no expiry.
