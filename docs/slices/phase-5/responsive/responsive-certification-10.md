# Responsive certification — final cross-surface record

**Slice:** RESPONSIVE-CERTIFICATION-10 · **Date:** 2026-07-31 · **Status:** certified

The authoritative rule is
[`docs/rules/responsive-layout-and-validation.md`](../../../rules/responsive-layout-and-validation.md).
This file records **what was certified, from which build, and what the certification
provably cannot see**. It is not a second copy of the rule.

## The command

```bash
npm run verify:responsive            # measurement only
npm run verify:responsive -- --shots # + named-width screenshots
```

One entry point. It clears stale fragments, re-emits every fixture, compiles **one**
Tailwind build, and runs all three measurement passes against it. No Supabase, no
Docker, no dev server, no database.

Before this slice the same coverage required remembering three script paths under
`scripts/trash/` — a directory the repo defines as disposable and ESLint ignores.
Verification that depends on memory stops happening.

## Certified result (2026-07-31, commit `979cedc97` + this slice)

| pass | surfaces | states | measurements | result |
| --- | --- | --- | --- | --- |
| app shell | Templates · Workflows · Account · Team · Runs · Builder Runs · shared shell | 72 | 11,376 | **PASS** |
| auth | sign-in · sign-up · verify · recovery · MFA | 19 | 3,458 | **PASS** |
| marketing | home · pricing · help · legal · header/footer | 10 | 1,820 | **PASS** |
| **total** | | **101** | **16,654** | **CERTIFIED** |

360→1600px in ≤8px steps; auth and marketing additionally at heights 900/768/640/568
across six widths, asserting the primary action stays reachable.

Assertion classes: containment (document, region, direct-child and deep-descendant
escape) · legibility floors · horizontal-panning policy · vertical reachability.

## What this certification cannot see

**Geometry measures boxes that exist. It is silent about a box that stopped existing.**

The marketing header dropped all five primary navigation links below 960px with
`display: none` and nothing in their place. Measured against the pre-fix source that
defect produced **zero** containment, **zero** legibility, **zero** panning failures and
a clean document width — a fully green sweep on a page whose navigation was gone.

That is now rule §D (control presence) and is carried by
[`tests/structure/responsive-control-presence.test.ts`](../../../../tests/structure/responsive-control-presence.test.ts),
which sweeps every certified surface for width-scoped rules that hide an interactive
region and requires each to name the control that replaces it.

The guard is **non-vacuous, proven by mutation**: setting the nav trigger to
`display: none` — the exact pre-fix defect — fails it with
`Expected: not "none"`. Its first version did *not* catch that (it only checked the
token appeared somewhere in the file), so the assertion was anchored to the
narrow-width block and re-tested.

Also outside geometry's reach, and deliberately left to behaviour tests: reading order,
focus reachability, and whether a rendered control is actually operable.

## Known limitations, recorded honestly

- **Three measurement passes, not one.** Each reproduces a different page frame — the
  signed-in app renders inside a rail + top bar; auth and marketing are full-bleed with
  their own scoped stylesheets. Wrapping any surface in another's chrome would measure a
  page that does not exist. The split is deliberate.
- **The three passes duplicate their assertion engine.** ~200 lines of near-identical
  probe logic. Unifying it is worthwhile but is a change to the assertions themselves,
  which the rule requires be re-proven non-vacuous per surface. That is its own slice,
  not a line item in a certification batch. Two known divergences today: the app-shell
  pass has no vertical-reachability probe, and it lacks the direct-child declared-scroller
  exemption the marketing pass added (inert there — no direct child of a declared scroller
  currently escapes).
- **Fixtures are component-rendered, not route-rendered.** The passes measure real
  components with synthetic props, not a running server. This is what makes a full sweep
  runnable without infrastructure; it does not exercise server-composed page assembly.
- **Screenshots are owner evidence, not a gate.** `--shots` is off by default; the
  measurement is the gate.

## Keeping it certified

A new or reworked surface joins by adding its emitter to `EMITTERS` in
`scripts/responsive/verify.mjs` and its regions to the pass whose frame it shares.
`responsive-control-presence.test.ts` fails if an emitter exists but is not registered —
a surface that is swept once and then forgotten is the failure mode this closes.
