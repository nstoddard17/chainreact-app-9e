---
name: chainreactv2-memory-curator
description: Use to update the single rolling project-memory file at docs/PROJECT_MEMORY.md — after an arc closeout, after a major status change (go-live, branch switch), after a durable architecture/product decision, or when Marcus explicitly asks to update project memory. Maintains a compact (≤150 lines) curated index of current status, durable decisions, open risks/follow-ups, recently completed arcs, and owner preferences. Verifies every line against git/docs first, prunes before adding, links to authoritative docs/commits instead of copying their content, runs a secret/privacy self-check, and reports what was added/pruned/corrected. Docs-only local commit, no push. NOT for per-arc handoffs (use chainreactv2-closeout-writer) and NOT a place to copy rule bodies.
---

# ChainReactV2 Memory Curator

Maintains [`docs/PROJECT_MEMORY.md`](../../../docs/PROJECT_MEMORY.md) — one rolling,
pruned, curated state index that lets a fresh chat get oriented in ~2 minutes. It is an
**index + thin durable-decision log**, not a knowledge base and not source of truth.

> **Context first.** Before gathering ChainReactV2 repo/project context, follow the
> [`chainreactv2-mcp-context`](../chainreactv2-mcp-context/SKILL.md) skill — use the MCP
> (`get_project_memory`, rule docs, current slice status) to orient, then verify every line
> against git/the real docs before writing. MCP is orientation; the repo wins on any conflict.

> **Not sure a project-memory write is the right home?** Route the decision through
> [`chainreactv2-skill-curator`](../chainreactv2-skill-curator/SKILL.md) first — it classifies
> whether a durable signal belongs in memory, a skill, `CLAUDE.md`, docs, or nowhere, then
> hands the `PROJECT_MEMORY` case back to this skill to execute.

## Hard rules

- **Memory is NOT source of truth.** Repo docs, commits, and code win. Every memory line
  carries a `→ pointer` to the authoritative doc/commit; if a line can't be tied to one,
  flag or drop it.
- **Verify before you write.** Confirm branch/commit/push state with `git`; confirm "live"
  against `docs/slices/phase-4/v2-go-live-status.md`; confirm each decision against its
  closeout/rule. Never assert from stale memory.
- **One canonical file, no snapshots.** Git history is the snapshot mechanism — do not
  create dated copies.
- **Budget: ≤ ~150 lines / ~8 KB.** Prune before adding. Stay compact.
- **Link, don't restate.** Never paste rule bodies, roadmap/go-live/closeout/outcome detail,
  or long content — point to it.
- **No secrets / privacy.** Never store env values, tokens, API keys, credentials,
  production data, or private customer/user data. Run a self-check before committing.
- **Docs-only. Local commit. No push.** No source/test/config/V1 changes.

## What to read

1. Current [`docs/PROJECT_MEMORY.md`](../../../docs/PROJECT_MEMORY.md).
2. The triggering report or closeout.
3. Relevant `docs/slices/` (closeouts/outcomes), `docs/rules/`, `docs/roadmap/`, and status
   docs — only as needed to verify a line.
4. `git` — current branch, HEAD, whether the branch is on origin (push state).

## Procedure

1. **Verify first.** Gather ground truth (git + the specific docs each change touches).
2. **Resolve conflicts** using repo docs/commits/code as source of truth; correct any
   memory line that disagrees.
3. **Prune before adding** — drop closed follow-ups, superseded decisions, and aged-out
   completed arcs (keep ~6; git retains the rest). Stay within budget.
4. **Add** only verified, durable items as one-liners with a `→ pointer`.
5. **Link, don't restate.**
6. **Security/privacy self-check** — scan the diff for secrets/env/tokens/credentials/PII;
   abort if any appear.
7. **Update the `Last curated: <YYYY-MM-DD> @ <commit>` stamp.**
8. **Write + report.** One docs-only local commit; report which lines were **added /
   pruned / corrected** and why. No push.

## Section semantics

- **Current status** — overwritten each curation (branch, push-gate, live/prod, focus).
- **Durable decisions** — `[date] one-liner → pointer`; pruned only when superseded.
- **Open risks & follow-ups** — `[owner] item — status → pointer`; removed when closed.
- **Recently completed arcs** — rolling ~6 → closeout/commit links; older ones drop off.
- **Owner preferences** — new/chat-derived only; otherwise point to `CLAUDE.md` /
  `.claude/skills/README.md`.

## What NOT to capture

- secrets / env / tokens / credentials / production or customer data
- per-message chat noise; unverified speculation
- copied rule bodies (→ `docs/rules/`)
- every slice (→ closeouts); roadmap/go-live detail (→ `docs/slices/`, `docs/roadmap/`)
- anything already authoritative elsewhere — link it instead

## Output

- Updated `docs/PROJECT_MEMORY.md` (within budget, links resolve, stamp refreshed).
- A short report: lines added / pruned / corrected, with reasons; confirmation of the
  security self-check; "docs-only, nothing pushed."
- One local commit, e.g. `docs: curate PROJECT_MEMORY (<trigger>)`. No push.
