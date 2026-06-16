---
name: chainreactv2-closeout-writer
description: Use when a ChainReactV2 arc or slice-group is complete and needs a concise closeout/handoff doc. Produces a docs-only closeout under docs/slices/<phase>/ summarizing the completed commit chain, current behavior, security/no-leak guarantees, data/RLS/model notes, UI behavior, deferred limitations, the verification baseline, and recommended next tracks. Strict honesty: never claims a verification command was run unless it actually was, distinguishes inherited from newly-measured baselines, and flags unapplied migrations and feature-flag default states. No push.
---

# ChainReactV2 Closeout Writer

For wrapping up a finished arc. The closeout is a **handoff**: the next chat (or Marcus)
should be able to read it and know exactly where things stand without re-deriving it.

> **Context first.** Before gathering ChainReactV2 repo/project context, follow the
> [`chainreactv2-mcp-context`](../chainreactv2-mcp-context/SKILL.md) skill — use the MCP for
> curated project memory, current slice status, and relevant rule docs to orient, then verify
> the commit chain and verification baseline against git/the real files before writing the closeout.

## Hard rules (honesty first)

- **Docs-only.** No source/test/migration/UI changes. Local commit, **no push.**
- **Never claim a command was run unless you actually ran it** in this conversation. If
  you didn't run `npm test` / `typecheck` / `lint`, say "not run this session" — do not
  imply a green bar you didn't see.
- **Distinguish inherited baseline from newly measured baseline.** If the test/typecheck
  state is carried over from earlier work, label it "inherited from `<commit>`." Only call
  something "newly measured" if you ran it now and report the actual numbers.
- **Flag unapplied migrations.** If a migration was written but not `db:push`ed, say so
  explicitly.
- **State feature flags and their default.** Name every flag the arc added/uses and
  whether it's ON or OFF (risky/public should be OFF).
- **No fabrication.** Verify each "what shipped" claim against the actual commits/files.

## Required closeout structure

1. **Summary** — 1–2 sentences per slice: what the arc accomplished.
2. **Completed commit chain** — chronological, each as
   `<9-char hash> — <message> (<MARKER>) _(YYYY-MM-DD)_`. These must be real commits
   (`git log`), not invented.
3. **Current behavior** — what the system now does, end to end, after the arc.
4. **Security / no-leak guarantees** — the invariants now enforced (e.g. "co-member
   personal credentials never enumerated", "non-members get 404", "service-role-only
   writes", "no co-member fallback"). Tie to the security skill's defaults.
5. **Data / RLS / model notes** — tables added/changed, RLS + GRANT posture, account-model
   implications (account-scoping, Team/Business caps). Note anything unapplied.
6. **UI behavior** — what users see; confirm no fake/unsupported controls shipped.
7. **Deferred / known limitations** — honestly listed, with why deferred.
8. **Verification baseline** — what was actually run this session vs inherited; exact
   commands + results where run; explicit "not run this session" otherwise. Mention
   unapplied migrations and flag states here too.
9. **Recommended next tracks** — the strongest next slices/arcs to pick up.
10. **Closeout confirmation** — "Docs-only. Nothing pushed." + the doc path.

## Process

1. `git log` the arc's range to get the **real** commit chain (hashes + dates).
2. Cross-check "what shipped" claims against the commits/files — don't paraphrase from
   memory.
3. Determine verification state honestly: what did you run *now*? What's inherited?
4. Write the doc at `docs/slices/<phase>/<area>-closeout.md` matching the house style
   (header block with Type/Date/Branch; relative `../../../` links; 9-char hashes).
5. Local commit `docs(<area>): <arc> closeout (<MARKER>)`. No push.
6. Report: commit hash, doc path, "docs-only, nothing pushed," and the verification
   honesty note (run-now vs inherited; unapplied migrations; flag states).
