---
name: chainreactv2-skill-curator
description: Controlled router for maintaining ChainReactV2 skills, project memory, and top-level operating rules when a durable decision or repeated workflow emerges. Use when Marcus says "update the skill / make this a rule / remember this / Claude should always…", when a slice/arc closeout surfaces durable process knowledge, when a repeated workflow or a recurring mistake should become reusable guidance, when project direction changes durably, when a new MCP/tooling capability lands, or when an existing skill is stale/duplicative/too broad. NOT an automatic self-rewriter and NOT triggered by turn count. Classifies the change into one of six buckets (PROJECT_MEMORY · EXISTING_SKILL_UPDATE · NEW_SKILL · CLAUDE_MD · DOCS_OR_CLOSEOUT · NO_DURABLE_UPDATE), then applies the minimal scoped patch — preferring edits over new skills, project memory over skills for state, CLAUDE.md only for broad rules, docs for detail. Delegates project-memory writes to chainreactv2-memory-curator and never duplicates MCP-routing rules. Asks approval before broad rewrites. Local-only, no push.
---

# ChainReactV2 Skill Curator

A **controlled, human-driven router** for keeping the ChainReactV2 operating layer
(skills + `docs/PROJECT_MEMORY.md` + `CLAUDE.md`) accurate as durable decisions and
repeated workflows emerge. Its job is to **decide where a durable update belongs** and
apply the **smallest** patch — not to rewrite the skill library.

> **Context first.** Before gathering ChainReactV2 repo/project context, follow the
> [`chainreactv2-mcp-context`](../chainreactv2-mcp-context/SKILL.md) skill — use the MCP for
> current project memory, skill inventory, and operating rules to orient, then read the
> actual skill/doc files before editing.

## This is NOT an auto-rewriter

- **No turn-count trigger.** Nothing about "every N turns." This skill runs only when one of
  the boundary conditions below is met.
- **Human-controlled.** Broad rewrites need Marcus's explicit approval. Small, explicitly
  requested updates get a minimal scoped patch and a report of exactly what changed.
- **Minimal patches; avoid skill bloat.** Default to the smallest change in the most specific
  place. Don't grow a skill into a project history.

## When to use this skill

- Marcus explicitly says **"update the skill," "make this a rule," "remember this," "Claude
  should always…,"** or similar.
- A **slice/arc closes out** and genuinely new *durable process knowledge* emerged (not just
  slice detail — that's a closeout).
- A **repeated workflow** appears that would benefit from a reusable skill.
- Claude **repeatedly makes the same mistake** and the fix should become reusable guidance.
- **Project direction changes** in a durable way (posture, branch strategy, architecture spine).
- A **new MCP / tooling capability** is added.
- An **existing skill is stale, duplicative, or too broad** and needs tightening/splitting.
- A long conversation hits a **meaningful milestone** and Marcus asks whether memory/skills
  should be refined.

**Do not** trigger on arbitrary turn count, on routine implementation, or to "tidy" skills
that are fine.

## Decision framework — classify first, then patch

Put the candidate update in exactly one bucket. If it spans two, pick the most authoritative
home and link from the others; do not duplicate the content.

| Bucket | When it applies | Where it lands |
|---|---|---|
| **PROJECT_MEMORY** | Durable project status, decision, open follow-up, deployment posture, or owner preference. | `docs/PROJECT_MEMORY.md` — **delegate to [`chainreactv2-memory-curator`](../chainreactv2-memory-curator/SKILL.md)**. |
| **EXISTING_SKILL_UPDATE** | A repeated procedure or rule belongs in a skill that already exists. | Minimal edit to that skill's SKILL.md. |
| **NEW_SKILL** | A genuinely new, repeatable workflow exists and fits no existing skill. | New `.claude/skills/<name>/SKILL.md` (only if the §criteria below all hold). |
| **CLAUDE_MD** | A top-level operating-constitution rule that applies **broadly** across ChainReactV2 work. | Small note in `CLAUDE.md`. |
| **DOCS_OR_CLOSEOUT** | Slice-specific detail, a technical contract, or arc handoff. | `docs/slices/<phase>/…`, `docs/rules/…`, or a closeout. |
| **NO_DURABLE_UPDATE** | The conversation was useful but not worth codifying. | Nothing. Say so and stop. |

`NO_DURABLE_UPDATE` is a valid, common outcome. Codifying noise is worse than codifying nothing.

## Strict rules for creating a NEW skill

Create a new skill **only when all** of these hold:

- the workflow is **repeatable**,
- it will **likely be used more than once**,
- it has a **clear trigger condition**,
- it has **clear inputs/outputs**,
- it **does not fit an existing skill**, and
- it can **stay small and procedure-focused**.

**Do NOT create a new skill for:** one-off implementation details · temporary slice status ·
decisions that belong in project memory · rules that belong in `CLAUDE.md` · content that
belongs in `docs/rules` or `docs/slices` · vague preferences with no repeatable procedure.

When in doubt, **extend an existing skill or write project memory instead.**

## Patching rules

- **Prefer editing an existing skill over creating a new one.**
- **Prefer `docs/PROJECT_MEMORY.md`** for durable state/decision/follow-up/posture/preference
  updates — via the memory-curator skill.
- **Prefer `CLAUDE.md` only** for broad, top-level operating rules that apply across the repo.
- **Prefer `docs/slices` / `docs/rules`** for detailed technical contracts and per-arc detail.
- **Keep skill edits short and local** — a pointer or a tightened rule, not a rewrite.
- **Link to authoritative docs instead of copying** long content into a skill.
- **Do not duplicate MCP-routing rules** — point to
  [`chainreactv2-mcp-context`](../chainreactv2-mcp-context/SKILL.md).
- **Do not duplicate memory-curation rules** — when the update belongs in project memory,
  hand off to [`chainreactv2-memory-curator`](../chainreactv2-memory-curator/SKILL.md).
- **Don't turn skills into long project histories** — that's what closeouts and memory are for.

## Safety & quality rules

- **No secrets / privacy.** Never store secrets, tokens, env values, credentials, private
  user/customer data, or production data in a skill or in memory.
- **Strict honesty.** Never claim a check ran unless it actually ran in this conversation.
- **Conflict → stop and report.** If repo docs, MCP memory, and chat claims disagree, do not
  silently pick one — surface the conflict. **Repo docs / commits / code win** over stale chat
  memory.
- **Approval before broad rewrites.** Restructuring a skill, splitting/merging skills, or
  changing a broad `CLAUDE.md` rule needs Marcus's explicit OK first.
- **Minimal scoped patch for small explicit requests.** When Marcus asks for a specific small
  skill/memory update, apply just that and report exactly what changed.
- **Local only. No push.** Commit locally (scoped to the curation change); never push.

## Procedure

1. **Orient** via `chainreactv2-mcp-context` (project memory, skill inventory, operating rules),
   then read the actual target skill/doc files.
2. **Classify** the candidate update into one of the six buckets. State the bucket and why.
3. **Verify** the claim against repo docs/commits — don't codify unverified chat memory.
   On conflict, stop and report.
4. **Route & patch minimally:**
   - `PROJECT_MEMORY` → hand off to memory-curator.
   - `EXISTING_SKILL_UPDATE` / `NEW_SKILL` / `CLAUDE_MD` / `DOCS_OR_CLOSEOUT` → smallest patch
     in that home; if it's a NEW_SKILL, confirm every §criterion first and add it to
     [`.claude/skills/README.md`](../README.md).
   - `NO_DURABLE_UPDATE` → report and stop.
5. **Broad change?** Get Marcus's approval before applying.
6. **Verify the docs/skills change** — `npm run lint:structure` (the established docs/skills
   structure check) and confirm links/paths resolve. State exactly what ran.
7. **Commit locally, scoped to the curation change. No push.** Report bucket chosen, files
   changed, and what was deliberately left alone.

## How this differs from the memory-curator skill

- **memory-curator** is the **executor** for one bucket: it owns *writing*
  `docs/PROJECT_MEMORY.md` (verify, prune, link, budget, stamp).
- **skill-curator** is the **router** across *all* surfaces: it decides whether a durable
  signal belongs in memory, an existing skill, a new skill, `CLAUDE.md`, docs, or nowhere —
  then delegates the PROJECT_MEMORY case to memory-curator and applies the others itself.

They compose: skill-curator classifies; memory-curator executes the memory write. When
`CLAUDE.md` or an explicit Marcus instruction conflicts with this skill, they win.
