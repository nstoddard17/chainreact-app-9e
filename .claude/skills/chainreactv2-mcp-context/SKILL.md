---
name: chainreactv2-mcp-context
description: Shared context-acquisition procedure for ChainReactV2 work. Use at the start of a ChainReactV2 session and before planning a slice, doing provider/app metadata work, builder/security/lifecycle work, diagnostics work, or answering any question that depends on current repo state. Defines when to reach for the ChainReactV2 MCP server, what to use it for (curated project memory, durable decisions, rule docs, provider manifests, builder metadata gaps, slice/closeout status), and the hard limits on its scope (no production data, secrets, DB writes, workflow mutation, shell, or git/deploy). MCP is for orientation only; repo files, commits, and code remain the source of truth. NOT an implementation skill — it gathers context, it does not change anything.
---

# ChainReactV2 MCP Context

A **routing skill**, not an implementation skill. It does one thing: tell future Claude
**when** to consult the ChainReactV2 MCP server for orientation, **what** to pull from it,
and **what it must never be asked to do**. Other ChainReactV2 skills point here instead of
re-explaining MCP usage.

The MCP server is a **read-only context tool** — a curated window onto the repo's own
source of truth (docs, rules, provider manifests, builder-metadata gaps, sanitized
diagnostics). Full security contract, tool list, and "do NOT use for" boundary:
[`docs/runbooks/internal-mcp-server.md`](../../../docs/runbooks/internal-mcp-server.md).
CLAUDE.md's **"Internal developer tooling"** section is the operating-constitution pointer
to the same.

## The one rule that matters most

**MCP is for orientation, not implementation.** Use it to find out *where to look* and
*what the current state is*. Then **open and read the actual files/code** before changing
anything. The MCP's output is a convenience view; **repo files, commits, and live code are
the source of truth.** If MCP context and the repo disagree, **stop and report the
mismatch — the repo wins.**

## When to use MCP

Reach for the MCP context tools:

- **At the start of any ChainReactV2 session** — before guessing at status from memory.
- **Before planning a new slice** — get current status + durable decisions + relevant rules.
- **Before provider / app metadata work** — confirm manifests, capabilities, scopes.
- **Before builder / security / lifecycle work** — pull the rule docs that govern it.
- **Before diagnostics / MCP-related work** — orient on the diagnostic suite + smoke state.
- **Before answering any question that depends on current repo state** — don't answer from
  stale memory when a fresh read is one tool call away.

## What to use MCP for

| Need | Tool(s) |
|---|---|
| Curated project memory / current status / open follow-ups | `get_project_memory` |
| The operating-rules outline | `get_claude_instructions_summary` |
| Durable decisions & rule docs relevant to the slice | `list_rule_docs` → `read_rule_doc <name>` |
| Provider manifests / metadata contracts (when provider work is relevant) | `list_provider_manifests` → `get_provider_manifest_summary <provider>` |
| Builder metadata gaps / readiness (when builder work is relevant) | `list_builder_metadata_gaps` |
| Locate a specific decision, slice closeout, or pattern | `search_project_docs <term>` |
| Provider connection requirements / option-source diagnosis | `explain_provider_connection_requirements`, `diagnose_option_source` |

Recommended fresh-chat order and example prompts:
[`internal-mcp-server.md` → "Claude usage workflow"](../../../docs/runbooks/internal-mcp-server.md).

## What MCP is NOT for

It is a context tool. It cannot — and must not be asked to — do any of these (out of scope
by design; enforced by the server's safety guards):

- **Production data** — it has no production access of any kind.
- **Secrets / env / tokens / credentials** — blocked at the file whitelist; redaction is a
  safety net, not a discovery feature. Never point it at secret stores or env files.
- **DB / Supabase reads or writes** — no DB/service-role/repository connection exists.
- **Workflow mutation** — it never touches the workflow engine or runtime state.
- **Arbitrary shell / file access** — no generic file reader, no generic command runner.
- **git push / PR / deploy / `db:push` / migrations** — no mutating or remote commands.

If a task needs any of the above, it is **not** an MCP task — use the normal repo flow.

## Required behavior

1. **MCP first for orientation, then read real files.** Use MCP to find the relevant
   memory/rules/manifests/gaps, then **inspect the actual repo files/code** needed to
   implement or answer. Never ship a change off MCP summaries alone.
2. **Cite what you used.** Name the files/docs/rules (and commits where relevant) that your
   report or change relies on — both the MCP-surfaced pointers and the real files you read.
3. **Report conflicts; the repo wins.** If MCP context disagrees with the repo files or
   commits, **stop and surface the mismatch** rather than papering over it. Treat repo
   files/commits as authoritative.
4. **Never claim a check ran unless it ran.** Do not say "MCP says…" or "I checked the
   manifest…" unless you actually invoked the tool / read the file in this conversation.
   If the MCP server wasn't reachable, say so and fall back to manual file inspection.

## What this skill does NOT do

It changes nothing. It writes no code, no docs, no migrations. It only governs how context
is gathered. The actual work runs under the relevant ChainReactV2 skill
([`chainreactv2-local-slice-executor`](../chainreactv2-local-slice-executor/SKILL.md),
[`-planning-doc-writer`](../chainreactv2-planning-doc-writer/SKILL.md),
[`-provider-integration-builder`](../chainreactv2-provider-integration-builder/SKILL.md),
[`-security-review`](../chainreactv2-security-review/SKILL.md), etc.), each of which points
here for the orientation step. When `CLAUDE.md` or an explicit Marcus instruction conflicts
with this skill, they win.
