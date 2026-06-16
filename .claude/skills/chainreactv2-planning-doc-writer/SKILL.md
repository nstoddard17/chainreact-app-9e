---
name: chainreactv2-planning-doc-writer
description: Use for a ChainReactV2 planning-only slice — designing an approach before any implementation. Produces a planning/design doc under docs/slices/<phase>/ that is grounded in the actual codebase (real files inspected and cited), separates verified current state from recommended future state, evaluates alternatives, and ends with an implementation slice breakdown. Implements NOTHING — no source, tests, migrations, or UI changes. Docs-only local commit, no push.
---

# ChainReactV2 Planning Doc Writer

For planning/design slices. The deliverable is **a doc, not code.** Its credibility comes
entirely from being grounded in the real repo, not from plausible-sounding guesses.

> **Context first.** Before gathering ChainReactV2 repo/project context, follow the
> [`chainreactv2-mcp-context`](../chainreactv2-mcp-context/SKILL.md) skill — use the MCP for
> curated project memory, relevant rule docs, provider manifests, builder-metadata gaps, and
> current slice status to orient, then inspect (and cite) the actual files/code in the doc.

## Hard boundaries (state these in the doc and honor them)

- **Inspect the real code first.** Open the actual files in the relevant call path. The
  doc must cite them.
- **No implementation.** No source, tests, migrations, schema, or UI changes. The only
  file you write is the planning doc (plus any sub-doc it explicitly needs).
- **Separate current state from future state.** Every "today it works like X" claim must
  trace to a file you read. Every "we should do Y" is clearly labeled as a recommendation.
- **No fabrication.** If you can't confirm something, write "unverified" and say what
  you'd need to confirm it. Never present a guess as fact.
- **Docs-only local commit. No push.**

## House style (match existing `docs/slices/<phase>/` docs)

Open the title with a slice marker and a **Type** line that explicitly disclaims
implementation, e.g.:

```
# 4.<AREA>-<N> — <Title> Plan

**Type:** Planning / design only. **No source, migrations, tests, UI, or behavior
changes in this slice. Nothing pushed.**
**Date:** <YYYY-MM-DD>
**Branch:** `<current branch>`

**Source of truth (verified current state):**
[file](../../../path/to/file.ts) (what it does) ·
[file2](../../../path/to/file2.ts) (what it does) · …
```

- Use **relative `../../../` markdown links** to real files (depth depends on the doc's
  folder).
- Reference prior commits by **9-char hash** when describing what already shipped.
- Place the doc where its peers live: `docs/slices/<phase>/<area>-plan.md`.

## Required doc structure

1. **Context** — why now; the arc this fits into; links to parent plans/closeouts.
2. **Current codebase findings** — verified current state, each claim tied to a file you
   read. List the files inspected (the "Source of truth" block). Be specific (functions,
   line ranges).
3. **Product / model decision** — what the feature actually is and is deliberately NOT.
   Anchor to the V2 account-scoped model and credential-sharing policy where relevant.
4. **Recommended approach** — the chosen design, end to end.
5. **Alternatives considered** — a comparison (table works well) scored on the dimensions
   that matter (security, migration ease, builder/UI complexity, execution/AI
   consistency, offboarding, future flexibility). Say why each is accepted/rejected.
6. **Security / data model** — schema sketch, RLS/GRANT plan, no-leak implications. If the
   area is sensitive, pull in **chainreactv2-security-review** thinking.
7. **API / service / UI expectations** — contracts and surfaces that change, described not
   built. No fake UI — only controls a real backend can support.
8. **Tests required** — what the implementation slices must prove (by area).
9. **Implementation slice breakdown** — ordered CS-1…CS-N slices, each small/bounded,
   with what ships behind which flag (default OFF for risky/public).
10. **Risks / open questions** — real decisions left open, with a recommendation each.
11. **Acceptance criteria** — for *this planning slice* (doc exists, grounded, no code
    changed, nothing pushed) and the criteria the implementation must later meet.
12. **Hard boundaries** — restate what this slice did NOT change.
13. **Recommended next step** — the single next slice to pick up.

## Process

1. Identify the real files in scope; read them. Capture exact behavior + paths.
2. Draft the doc following the structure above.
3. Verify every "current state" line against a file — fix or flag anything unconfirmed.
4. `git add` the doc only; local commit `docs(<area>): <title> plan (<MARKER>)`.
5. Report: commit hash, doc path, files inspected, and "docs-only, nothing pushed."
