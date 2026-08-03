# Rule: Responsive layout and validation

**Slices:** BUILDER-RESPONSIVE-LAYOUT-1 · RESPONSIVE-FOUNDATION-1 · RESPONSIVE-PAGES-2 ·
RESPONSIVE-SETTINGS-3 · RESPONSIVE-TEAM-4 · RESPONSIVE-DATA-SURFACES-5 ·
RESPONSIVE-BUILDER-RUNS-6 · **Status:** durable rule

## Purpose

This rule covers **both halves** of responsive work in ChainReactV2: what the product
must do when space runs out, and what must be measured before anyone claims it does.

It exists because the six accepted responsive batches kept re-learning the same three
lessons, in this order:

1. A page can have **no horizontal scrollbar** and still be broken — a card with
   `overflow-hidden` for its rounded corners silently *clips* the burst.
2. A region can be **perfectly contained** and still be unusable — the Team pending-invite
   row laid the invitee's email out at seven pixels while nothing escaped anything.
3. A surface can be **contained and legible** and still be the wrong product — the
   workflows table preserved every column inside an 880px scroller, so a phone user had
   to drag the table sideways to reach the actions menu.

Containment, legibility and panning are three different claims. Each needs its own
assertion, because each of the three defects above passed the other two.

This is a rule for **future, unrelated surfaces**. The completed batches are evidence,
not the subject.

---

## Resolved decisions

| Decision | Value |
| --- | --- |
| Supported width range | **360px → 1600px**, continuous |
| Sweep granularity | **≤ 8px** increments across the whole range |
| Named screenshot widths | 1600 · 1440 · 1200 · 1024 · 820 · 640 · 480 · 390 · 360 |
| Assertion classes | **containment · legibility · panning policy** — all three, always |
| Overflow masking | **Forbidden** as a fix. `overflow-x-hidden` / `overflow-x-clip` hide defects |
| Desktop/mobile duplication | **Forbidden** for interactive markup. One DOM, one state source |
| Page bounds | `AppPageContainer` with a **named** width variant — never a one-off `max-w-*` |
| Green harness | **Insufficient** on its own. It must be proven to catch the pre-fix defect |
| Builder tiers | `wide` ≥ 1280 · `medium` 900–1279 · `narrow` < 900. Phones are `narrow`, not a fourth tier |
| Media queries | **`min-width` only** — browsers round fractional lengths, so exclusive `max-width` bands mis-resolve every boundary |

---

## Product / layout rules

### 1. Every layout group chooses a behavior

The common failure mode is not a *wrong* behavior. It is **no behavior selected**. When a
group has no declared answer, the browser picks one: competing minimum sizes resolve by
letting one side push, clip or compress another — and the side that yields is decided by
`min-width: auto` defaults and intrinsic content, not by product intent.

Every group of content that shares a line must deliberately pick one or more of:

| Behavior | Use when | Landed example |
| --- | --- | --- |
| **Shrink** | The region is flexible text or an input | Search side `flex-1 min-w-0 basis-56 md:basis-96` in [WorkflowsToolbar.tsx](../../features/workflows/WorkflowsToolbar.tsx) |
| **Wrap** | Human-readable labels and action clusters | Toolbar row `flex-wrap`; action cluster stays `shrink-0` so it drops as a unit |
| **Reflow** | A grid whose column count is the variable | Stat cards `repeat(auto-fit, minmax(min(170px,100%), 1fr))` in [WorkflowsStatCards.tsx](../../features/workflows/WorkflowsStatCards.tsx) |
| **Stack** | A row of label + control | `sm:flex-row` in [SettingRow.tsx](../../features/team/SettingRow.tsx) |
| **Collapse** | Navigation that cannot fit inline | Rail → [AppMobileBar.tsx](../../components/app-shell/AppMobileBar.tsx) + nav drawer below `md` |
| **Truncate** | Compact identity where the value is reachable elsewhere | `lg:truncate` on the workflow name in [WorkflowRow.tsx](../../features/workflows/WorkflowRow.tsx) |
| **Switch presentation** | The desktop shape has a hard minimum width | Table → stacked cards via `lg:contents` ([WorkflowRow.tsx](../../features/workflows/WorkflowRow.tsx)); list+detail → one surface at a time ([RunsPanel.tsx](../../features/workflow-builder/canvas/RunsPanel.tsx)) |
| **Overflow menu** | Secondary actions compete with primary ones | Builder header `compact`/`minimal` densities ([builderLayoutPolicy.ts](../../features/workflow-builder/layout/builderLayoutPolicy.ts)) |
| **Contained horizontal scroll** | The data is genuinely irreducible | Roles capability matrix ([RolesTable.tsx](../../features/team/RolesTable.tsx)); per-step JSON ([RunResultsPanel.tsx](../../features/workflow-builder/panels/RunResultsPanel.tsx)) |

Note the asymmetry that must be decided explicitly: **search yields, fixed controls do
not.** In `WorkflowsToolbar` the identity/search side carries `min-w-0 flex-1`; the action
cluster carries `shrink-0`. Getting this backwards is what pushed the row past the page.

### 2. Container-aware layout

- **Prefer available container space over viewport-only breakpoint assumptions.** A
  sidebar means viewport width is *not* content width. The authenticated shell takes a
  64px rail from `md` up, so a page at 1024px viewport has ~960px of content — and the
  builder's run surfaces sit inside a canvas narrower still, which is why their panning
  floors are declared at `1600` rather than a viewport breakpoint.
- **Use `minmax(0, 1fr)`, not a bare `1fr`.** A bare `1fr` track has an automatic minimum
  of its content size and refuses to shrink. See the Team roster tracks
  `minmax(0,2.4fr)_minmax(0,1.2fr)_minmax(0,1fr)_auto` in [MembersTable.tsx](../../features/team/MembersTable.tsx).
- **Use `min(<track minimum>, 100%)` when a nominal card minimum could exceed a phone
  container.** `minmax(300px, 1fr)` overflows a 360px viewport once gutters are taken;
  `minmax(min(300px,100%), 1fr)` does not. Landed in
  [TemplatesDashboard.tsx](../../features/templates/TemplatesDashboard.tsx) (300px),
  [WorkflowsDashboard.tsx](../../features/workflows/WorkflowsDashboard.tsx) (280px) and
  `WorkflowsStatCards.tsx` (170px).
- **A track may carry a floor when the content genuinely needs one** — `WorkflowRow`'s
  identity track is `minmax(200px, 2.4fr)` because six columns sharing 880px otherwise
  starve the name. A floor is a *decision*, and it obliges you to switch presentation
  before the sum of floors stops fitting.
- **Breakpoints are still allowed — but justify them by the minimum usable size of the
  actual layout.**

**The Workflows table is the model for deriving a threshold.** The desktop grid needs
`lg:min-w-[880px]` to keep six columns readable. 880px plus the rail plus gutters cannot
fit below roughly the `lg` boundary, so the presentation switches to stacked cards *at*
`lg` (1024px) and the panning floor is declared at exactly `data-no-pan-below="1024"`. The
number came from the content requirement; it was not picked because 1024 is a familiar
breakpoint. See [WorkflowsTable.tsx](../../features/workflows/WorkflowsTable.tsx).

### 3. Audit the whole width chain, not the leaf

A child cannot shrink if any ancestor refuses to. **Adding `truncate` to a child is inert
when an ancestor does not permit it to shrink** — `text-overflow: ellipsis` needs a
constrained width, and `min-width: auto` on any ancestor removes the constraint.

Walk the complete ancestor chain and account for every one of:

- `min-width: 0` (present or missing — the single most common root cause)
- fixed widths (`w-[300px]`) and percentage widths
- grid track minimums (a bare `1fr`, an oversized `minmax` floor)
- intrinsic / preformatted content (`<pre>`, `white-space: nowrap`, long unbroken tokens)
- `flex-shrink` / `shrink-0` on an ancestor that should have yielded
- nested scroll containers (an inner scroller absorbs the symptom and hides the cause)
- absolutely / fixed-positioned overlays (measured against the viewport, not the parent)
- clipped cards (`overflow-hidden` for rounded corners will hide the burst)
- code blocks and tables that establish an ancestor's minimum width

The landed proof: a single `shrink-0` on the control slot of `SettingRow` made a long email
the row's minimum width and pushed ~300px of content under the settings card's
`overflow-hidden`. The guard now forbids that class on that component by name —
[responsive-source-guards.test.ts (account-settings section)](../../tests/structure/responsive-source-guards.test.ts).

### 4. `min-w-0`, `shrink-0`, wrapping, truncation

| Tool | Belongs on |
| --- | --- |
| `min-w-0` | Identity regions, text, inputs, and any flexible region that must be *allowed* to shrink |
| `shrink-0` | Controls, icons, badges and shapes that must stay usable at their intrinsic size |
| Wrapping (`flex-wrap`, `break-words`) | Human-readable labels, descriptions, cards, action clusters |
| Truncation (`truncate`) | Compact identity regions **where the full value is otherwise accessible** |
| Targeted breaking (`break-all`) | Emails, IDs, URLs and other unbroken tokens — **and nothing else** |
| Internal scrolling | Code, JSON, logs, and genuinely wide tables |

Truncation and wrapping are often the *same element at different widths*: the workflow name
is `break-words ... lg:truncate` — it wraps in card mode where it owns a whole line, and
ellipses in the table where the column is fixed and alignment is the point. The member
email is `break-all ... sm:truncate` for the same reason.

**Do not apply `break-all` or aggressive word breaking to ordinary prose.** It is for
unbroken machine tokens. On sentences it produces mid-word breaks that read as corruption.

### 5. No overflow masking

> **A responsive defect is never fixed with page-level `overflow-x-hidden`,
> `overflow-x-clip`, or any equivalent masking.**

- A clipped or hidden child is **still a failure** — the content is gone, not fitted.
- Card-level clipping conceals the *worst* cases: the settings `Panel` carries
  `overflow-hidden` for its rounded corners, so a 300px burst inside it left the document
  `scrollWidth` completely green while the content was visibly cut off.
- Therefore **the harness must inspect descendants, not only document width** (see
  Validation §A).

Four structure guards enforce the absence of masking across the swept surfaces:
[account-settings](../../tests/structure/responsive-source-guards.test.ts) ·
[team](../../tests/structure/responsive-source-guards.test.ts) ·
[data-surfaces](../../tests/structure/responsive-source-guards.test.ts) ·
[builder-runs](../../tests/structure/responsive-source-guards.test.ts).

**Legitimate local overflow** — a bounded panel whose content is irreducibly wide:

- a JSON / code / log viewer
- a capability matrix
- a genuine provider-output table
- other irreducibly wide technical content

Such a scroller **must be capped so it cannot size its own card**. Every landed one carries
`max-w-full`; the JSON viewer carries `max-h-48 min-w-0 max-w-full overflow-auto`. It must
never widen the page or the primary surface, and the guards assert the cap by inspecting the
`className` that declares the scroller.

### 6. One responsive DOM, one state source

> **Responsive CSS and presentation wrappers change layout and visibility. They do not
> produce a second set of controls.**

The pattern:

- One set of interactive controls
- One permission calculation
- One selected state
- Breakpoint-scoped **presentation** is fine and necessary (`hidden sm:grid` on column
  headings, `sm:hidden` on a card-mode "Joined" label)
- Breakpoint-scoped **controls** are not

The mechanism that makes a single DOM possible is `display: contents`: a wrapper is a
wrapping row on a phone and *no box at all* in the table, so the same children become grid
tracks without being re-rendered. `sm:contents` in [MembersTable.tsx](../../features/team/MembersTable.tsx);
`lg:contents` in [WorkflowRow.tsx](../../features/workflows/WorkflowRow.tsx).

What duplicated desktop/mobile markup actually costs:

- **Action availability drift** — the mobile menu keeps offering an action the desktop menu removed
- **Permission drift** — two independent gates on a surface that removes members or trashes workflows
- **Selection drift** — two checkboxes per row, two selection sets
- **Duplicate accessible controls** — two elements with the same accessible name, one of them hidden
- **Tests that validate only one implementation** — and pass while the other is wrong
- **Two requests or two side effects** from one user intent

Accepted examples: the Team member table/card transition, the workflow table/card
transition, and the Builder Runs list/detail visibility switch.

Where a semantic constraint genuinely requires separate presentation markup, it must draw
from **one shared action/data source**, and it needs an explicit test that the two
presentations cannot drift. The structure guards approximate this cheaply: they fail when a
line carries both a breakpoint visibility class and a control (`<Button`, `<select`,
`<input`, `onClick`, `onChange`, `ActionsMenu`, `StatusToggle`), and the rendered proof that
exactly one control set exists per row lives in
[teamResponsive.test.tsx](../../tests/unit/features/team/teamResponsive.test.tsx) and
[workflowListResponsive.test.tsx](../../tests/unit/features/workflows/workflowListResponsive.test.tsx).

### 7. Preserve state across a presentation change

**Viewport state determines presentation. It never determines business state.**

- Resizing must not refetch or clear a selected entity.
- Responsive drawers and panels preserve pending edits, transcripts, selected runs and
  scroll position wherever practical.
- Prefer keeping a stateful surface **mounted** when unmounting would lose data or refetch.
- Do not duplicate business data into responsive-only state.

**Builder Runs is the reference implementation.** Both surfaces stay mounted at every width
and only visibility changes:

- `selectedRunId` is the single source of truth for *which* run is shown.
- `narrowView` (`"list" | "detail"`) decides only *which surface is on screen* when there
  is not room for both, and is ignored entirely from `lg` up.
- Unmounting the detail on resize would refetch the run; unmounting the list would lose its
  scroll position. So neither is unmounted — list → detail → back → detail does not refetch.

The guard asserts both surfaces are mounted (`runs-list-surface`, `runs-detail-surface`)
and that `narrowView` is never read near a data call —
`expect(panel).not.toMatch(/narrowView[\s\S]{0,80}(getWorkflowRun|listWorkflowRuns)/)`.

The same principle governs the builder's overlay surfaces: the agent rail keeps its
collapsed payload mounted-but-hidden precisely to preserve the transcript.

### 8. Tables, stacked rows, and local scrollers

**Stack into rows/cards when:**

- the data is ordinary management information,
- the columns can be regrouped meaningfully,
- the actions must stay reachable, and
- a phone user should not have to pan to operate the row.

→ Team members, pending invitations, the workflow management list.

**Keep a contained horizontal scroller when:**

- the comparison is genuinely two-dimensional,
- the column *relationships* are the point,
- stacking would repeat the headings for every row and destroy the comparison, or
- the content is provider-owned or technical data whose structure must not be reflowed.

→ The roles/capability matrix, JSON and logs, wide provider-output tables.

A local scroller that a narrow-screen user cannot discover is its own defect. Where the
scroll is not otherwise obvious, ship a hint — `team-roles-scroll-hint` in
[RolesTable.tsx](../../features/team/RolesTable.tsx), asserted by the Team guard.

The Team guard also pins the *count*: exactly one `overflow-x-auto` exists in the whole team
surface, and it is the roles matrix. If a second appears, the stack-vs-scroll decision is
being made again and must be made deliberately.

### 9. `AppPageContainer`

[components/app-shell/AppPageContainer.tsx](../../components/app-shell/AppPageContainer.tsx)
is a deliberately small shared component, not a design-system layer. Its responsibilities
are fixed and few:

1. **A bounded readable width** — `max-width` from a named variant.
2. **Centering** — `mx-auto`.
3. **Fluid horizontal gutters** — `padding-inline: clamp(1rem, 2.5vw, 2rem)`. One fluid
   value replaces a `p-6 sm:p-8` step, so the gutter shrinks *continuously* rather than
   holding 24px until 640px and then jumping. 16px a side at 360px, capped at 32px at 1600px.
4. **`min-width: 0`** — the load-bearing line. Without it a flex/grid child defaults to
   `min-width: auto`, refuses to shrink below its content, and pushes the page wider than
   the viewport.

**Named variants** (`APP_PAGE_WIDTHS`):

| Variant | Width | Use for |
| --- | --- | --- |
| `app` (default) | 1600px | Dashboards and card grids |
| `content` | 1152px | A focused list — Runs |
| `reading` | 672px | A single narrow column of prose — Notifications |

Rules:

- **Prefer an existing named variant.** Three named values, not an open `maxWidth` string,
  so the set stays reviewable and pages cannot drift into a dozen bespoke widths.
- **A new variant must represent reusable layout intent**, not one page's preference.
- **Do not add an unexplained one-off numeric width to a page.** The guards assert
  `width="(app|content|reading)"`.
- **Remove the old hand-rolled gutter/max-width rather than layering both systems.** The
  guards reject `p-*`, `px-*`, `sm:p-*` and `max-w-*` on the `<AppPageContainer>` tag itself,
  because the container already applies the gutter and doubling it is the bug that
  motivated the check.
- **Render the container instead of a hand-rolled `<main>`** — the guards assert the page
  contains no `<main>` element of its own.
- **Do not use it for a full-bleed canvas or an intentionally unbounded surface.** It does
  not position, does not scroll, and does not clip. Dialogs, overlays and toasts are
  `fixed` and escape it by design; bounding them there would break them. It never sets
  `overflow-x: hidden`.

Contract values are **exported** (`APP_PAGE_MAX_WIDTH`, `APP_PAGE_PADDING_INLINE`,
`APP_PAGE_WIDTHS`) so tests assert them by value rather than scraping a generated class
string — see [AppPageContainer.test.tsx](../../tests/unit/components/app-shell/AppPageContainer.test.tsx).

### 10. Overlays — drawers, sheets, dialogs, popovers, menus, toasts

Every overlay must have:

- **Viewport-constrained width** — it is measured against the *viewport*, not its in-flow
  parent (see Validation §A).
- **Internal vertical scrolling** when its content can exceed the viewport height.
- **Wrapping titles and descriptions** — an overlay title is prose, not a token.
- **Footer actions that wrap or stack** rather than pushing the sheet wider.
- **Focus trap and restoration** — focus goes in on open, Tab stays in, focus returns on
  close.
- **Escape closes.**
- **No clipping.**
- **No real or sensitive data in visual fixtures.**

In the builder these are shared, not reimplemented per surface:
[useBuilderOverlaySurface.ts](../../features/workflow-builder/layout/useBuilderOverlaySurface.ts)
owns focus-in, Tab containment, focus restore and Escape for both the agent rail and the
node-configuration sheet. It is DOM-only: it never decides whether a surface should be open
and never touches the graph, conversation or config draft. In panel mode it is passed
`active: false` and does nothing, so a wide-desktop in-flow rail behaves exactly as before.

Its focusable-element filter excludes `offsetParent === null`, which matters specifically
because the rail keeps its collapsed payload **mounted but hidden** to preserve the
transcript (rule §7) — those controls must not become Tab targets.

---

## The three-part validation model

Three assertion classes. Each catches defects the other two pass. All three are required.

The reference implementation is
[scripts/responsive/measure-app-shell.mjs](../../scripts/responsive/measure-app-shell.mjs) —
a Playwright/Chromium measurement pass over static HTML fragments emitted by the
`tests/tools/*Screens.harness.test.tsx` files. **No database, no auth, no dev server.**

The wrapper reproduces the authenticated shell around each fragment — a 64px rail from
`md` up, a 56px top bar, the mobile bar below `md` — because measuring the fragment against
the bare viewport would flatter it: a real page never gets the full width. The wrapper sets
`body { overflow-x: auto }` deliberately, so accidental overflow becomes **visible and
measurable rather than clipped**.

### A. Containment

*Does anything leave the box that is supposed to hold it?*

Four questions, all asked at every swept width:

1. **Does the document exceed the viewport?** `documentElement.scrollWidth - clientWidth`.
2. **Does a named region overflow itself?** `el.scrollWidth - el.clientWidth`, per region.
3. **Does a region extend past the viewport?** `rect.right - width`.
4. **Does a descendant escape the box that lays it out?**

Implementation details that make it honest — each of these **moves** an assertion to the
correct frame of reference rather than dropping it:

- **Walk descendants, not only direct children.** A card grid fails as one visible burst,
  so a direct-child check sufficed for Templates. A settings page does not: it fails as a
  long input or a 74-character email bursting out of a small box three levels down. The
  deep pass runs `el.querySelectorAll("*")` and measures every node against **its own**
  parent.
- **`display: contents` generates no box.** Its rect is empty, so every child would
  "escape" it. Resolve upward to the nearest ancestor that actually generates a box — the
  element genuinely responsible for laying the node out. This keeps the node under
  assertion instead of skipping it. (Required by `sm:contents` / `lg:contents`, the very
  mechanism rule §6 mandates.)
- **Out-of-flow children are excluded from *parent* containment.** `position: fixed` and
  `position: absolute` children are not laid out by that parent, so escaping it is not a
  defect — a fixed toast is anchored to the viewport by design. They are still measured
  against the **viewport** as their own region.
- **A declared scroller is not a containment failure.** An element whose computed
  `overflow-x` is `auto` or `scroll` has opted in: content wider than the box is the point.
  Its *internal* scroll is not reported as overflow — but its own containment (does the
  scroller stay inside its card?) is still checked, and whether it was **allowed** to scroll
  there is answered by the panning policy (§C). Nothing is let off.

Regions are declared as a selector list, including `[data-testid^=...]` prefix matches for
per-entity rows (`team-member-`, `run-row-`, `runs-row-1`) — because these pages fail
*inside individual rows*, where identity competes with badges, metadata and an action
control on one line.

### B. Legibility floors

*Is a region technically contained but allocated too little width to remain readable or
operable?*

**"Contained" and "readable" are different claims and both are required.** The Team roster
taught this: the identity track was `2.4fr` with `min-w-0`, so when space ran out the name
and email column was the only thing that could yield — down to 64px, of which 32px was the
avatar — while the role select, the date and the Remove button kept their intrinsic widths.
The pending-invite row was worse: the invitee's email, the single most important field on
that row, laid out at **seven pixels**. Nothing escaped anything. A pure containment sweep
passed it.

**The declaration.** An element opts in by naming the width below which it stops being
readable:

```tsx
data-legible-min="180"
data-legible-what="workflow identity"
```

The **component owns the number**; the harness only enforces what the component claims. An
element that has stacked to full width satisfies its floor for free.

**Calibration rules — where a floor may and may not go:**

- ✅ **Allocated cells and regions** — a grid track, a flex child that receives space.
- ❌ **Shrink-wrapped text.** Its width is its content size, not an allocation.
- ❌ **`shrink-0` controls.** Same reason — a mis-calibrated floor on the workflow action
  region was caught this way and removed.
- ❌ **Icon buttons whose natural width is valid.**
- **Calibrate against both short and long content.** A floor tuned only to long content
  produces false failures on legitimately short values.
- **A structure guard should reject invalid declarations where it can.** Both the
  data-surfaces and builder-runs guards scan for `data-legible-min` on a tag that also
  carries `shrink-0` and fail with the offending tag.

Landed floors, all on allocated regions: workflow identity 180 · run identity 220 · member
identity 180 · invitation identity 180 · run detail pane 280 · run step identity 140 ·
results step identity 140.

### C. Horizontal-panning policy

*Is horizontal panning an acceptable product behavior for this region?*

Containment and legibility both miss this **by design**. The workflows list was a hard
`min-w-[880px]` grid inside an `overflow-x-auto` card: nothing overflowed the document
because the scroller absorbed it, and nothing was squeezed because inside the scroller every
column had its full width. Both existing assertions passed — while a phone user had to drag
an 880px table sideways to reach the actions column.

**The declaration**, deliberately opt-in:

```tsx
data-no-pan-below="1024"
```

Below that viewport width, `scrollWidth - clientWidth` on that element must be 0. A
genuinely irreducible matrix or a JSON viewer is *allowed* to pan and stays un-annotated.

Requiring the declaration matters most where a surface would otherwise "pass" through an
always-on scroller: an unannotated `overflow-x-auto` region is exempt from the containment
overflow check (§A), so **without a panning declaration a dense surface can look green while
being unusable.** Declare it wherever a local scroller exists, and wherever a dense surface
sits inside one.

**Horizontal panning is disallowed for:** the page shell · the page container · toolbars ·
forms · management lists · run navigation · run summaries · humanized errors · ordinary
metadata.

**Contained panning is allowed for:** JSON · code · logs · capability matrices · genuine
output tables · other irreducibly wide technical content.

The builder run surfaces are the case where **both answers are correct in the same feature**,
which is why the policy is per-element and not a global setting:

| Element | Declaration | Why |
| --- | --- | --- |
| Runs tab panel | `data-no-pan-below="1600"` | A run summary must never pan, at any supported width |
| Runs history nav | `data-no-pan-below="1600"` | Same |
| Run detail pane | `data-no-pan-below="1600"` | Same |
| Per-step JSON `<pre>` | **none** (`max-h-48 min-w-0 max-w-full overflow-auto`) | Reflowing JSON destroys the structure the author is reading |

The builder floors are `1600` rather than a viewport breakpoint because these surfaces live
**inside the canvas**, not inside the page container — viewport width is not their content
width (rule §2). The guard asserts the JSON viewer is bounded *and* that
`data-no-pan-below` is never declared on it, since that would forbid exactly the behavior
that surface needs.

---

### D. Control presence — the limit of geometry

*Is every control the surface promises still **there** at this width?*

**Geometry cannot answer this, and it never will.** The three assertion classes above
all measure boxes that exist. They are silent about a box that stopped existing.

The marketing header proved it. It dropped all five primary navigation links below
960px with `display: none` and nothing in their place — no trigger, no menu, no
replacement. Pricing became unreachable from navigation on every phone. Measured
against the pre-fix source, that defect produces:

| assertion | result |
| --- | --- |
| containment | **0 failures** — nothing overflows |
| legibility | **0 failures** — nothing is compressed |
| panning | **0 failures** — nothing pans |
| document width | **clean** |

A fully green sweep, on a page whose navigation is gone. `display: none` is the
perfect crime: the harness sees a tidier page and approves.

**The rule.** Hiding a control at a breakpoint is only acceptable when the same
destination or action remains reachable through another control that IS present at
that width. "It collapses into the menu" is a claim that must be **asserted**, not
assumed — and asserted behaviourally, because pixels cannot check it.

Required whenever a breakpoint hides anything interactive:

- A rendered test that every hidden destination/action is still reachable at that
  width, from the control that replaced it.
- A test that exactly **one** control exists per action (per rule §6) — the fix for a
  missing menu must not become a duplicated one.
- A structure guard that the hiding rule and the replacement ship **together**: a rule
  that hides the controls is only valid inside a block that also reveals the trigger.

Landed example: [MarketingNav.tsx](../../features/marketing/MarketingNav.tsx) (one
`NAV_LINKS` declaration, one `<nav>`, one state source) with
[marketingResponsive.test.tsx](../../tests/unit/features/marketing/marketingResponsive.test.tsx)
and [responsive-source-guards.test.ts (marketing section)](../../tests/structure/responsive-source-guards.test.ts)
carrying the assertion the sweep cannot.

**Generalise this.** Before trusting any green responsive run, ask what the harness is
structurally incapable of seeing on this surface — missing controls, wrong reading
order, an unreachable focus target, a control rendered but not operable — and put that
under a different instrument. A harness's silence is not evidence.

## Continuous-width validation

**The default responsive sweep for major responsive work:**

- **360px → 1600px**, in increments of **at most 8px**.
- Run against **representative fixture states**, not one happy-path render.
- **Named screenshots at 1600 · 1440 · 1200 · 1024 · 820 · 640 · 480 · 390 · 360.**

**Named widths must be captured explicitly even when they do not fall on the sweep's
arithmetic progression.** An 8px grid starting at 360 does not land on 390 or 820 — those
two were initially swept past and never screenshotted. The reference harness unions the
named set into the sweep and re-sorts, so every named width is both measured *and*
captured. Any new sweep must do the same.

The point of the dense sweep is defects **between** the named widths: a layout can pass at
640 and at 480 and still tear at 517. Geometry-only reads are cheap — 156+ measurements per
state.

**Required fixture states** (scale to the surface's real risk):

- Normal
- Long-content — long names, 74-character emails, long error text
- Empty
- Loading / disabled
- Error
- Overlay, where applicable
- Interactive compact — menus open, bulk bar showing, selection active
- Permission variant, where applicable

Do not demand every state for a trivial component. **The fixture set must reflect the
surface's real risk**, and a harness should say which states it deliberately did not
fixture and why. The builder-runs harness does exactly that in its header comment: it
records that these surfaces render no input viewer, trigger-payload viewer, log viewer or
file reference, so those states are deliberately absent rather than forgotten.

`SHOTS=0` measures without screenshotting. **The measurement is never skipped** — the sweep
is the gate; the screenshots are owner evidence, and re-shooting 100+ full-page PNGs on
every measure-fix-measure iteration is the slow part.

**Report failures grouped, not flat.** The same defect repeats at every width it breaks at,
so a flat list buries a handful of root causes under hundreds of near-duplicate lines.
Collapse to `(state × defect shape)` — normalising pixel counts — and report the **width
range** each group breaks across. That is the form a fix is actually planned from.

---

## Non-vacuous validation

> **A green harness is worthless until it has been shown to detect the defect it was
> written for.**

Accepted proof methods:

- Run the harness against **pre-fix source**.
- **Temporarily revert** the responsive fix and re-run.
- **Mutation-test** the specific behavior (remove the `min-w-0`, drop the `lg:contents`,
  restore the `shrink-0`).
- Introduce a **controlled fixture defect**.

**Report, for the failing run:**

- number of distinct failures,
- the width range each group breaks across,
- the affected groups / regions,
- which **assertion classes** fired, and
- **which defects a document-width check alone would have missed** — this is the number
  that justifies the deep-escape, legibility and panning passes existing at all.

**Never weaken an assertion to make the final source pass.** When an assertion legitimately
changes — for example when declared scrollers were exempted from the containment overflow
check — **mutation-test a previous known defect that depended on it**, to prove coverage
*moved to another instrument* rather than disappearing. Every exemption in the reference
harness is paired with the assertion that took over: fixed/absolute children → viewport
regions; `display: contents` → nearest box-generating ancestor; declared scrollers →
panning policy.

---

## Screenshots and fixtures

- **Synthetic data only.** Never production or customer data.
- **Never** credentials, tokens, signed URLs, secrets, billing IDs, or private email
  addresses — including in fixture props that never render.
- Store generated screenshots under the gitignored **`owner-review/`** convention
  (`.gitignore`), e.g. `owner-review/responsive-app-shell/<state>/<width>.png`.
- **Use per-state subfolders** — a full certification writes 100+ screenshots, and a flat
  directory is unreviewable. (Historical note: this was also a *lint* requirement, because
  the leaf-folder check scanned `owner-review/` despite it being gitignored. As of
  RESPONSIVE-CERTIFICATION-10 that directory is excluded from the check — it is generated
  output, not source, and "split the folder" is not a remedy a generator can apply. The
  subfolder convention stands on reviewability alone.) See
  [project-structure-and-module-boundaries.md](./project-structure-and-module-boundaries.md).
- **Do not commit screenshots** unless Marcus explicitly asks.
- **State which screenshots were directly reviewed.** Do not claim review of all generated
  images without having opened them.

---

## Allowed behavior

- Contained horizontal scrolling inside a bounded, capped panel for irreducibly wide
  technical content, with a discoverability hint where the scroll is not obvious.
- Breakpoint-scoped **presentation** classes (`hidden sm:grid`, `sm:hidden` on a label).
- `display: contents` to dissolve a card-mode wrapper back into grid tracks.
- Truncation where the full value remains accessible elsewhere.
- `break-all` on emails, IDs, URLs and other unbroken machine tokens.
- A grid track floor (`minmax(200px, …)`) when the content genuinely requires it — provided
  the presentation switches before the sum of floors stops fitting.
- Keeping a surface mounted-but-hidden to preserve its state.
- Overlays escaping `AppPageContainer` — they are `fixed` by design.

## Disallowed behavior

- Page-level `overflow-x-hidden` / `overflow-x-clip` (or any masking) as a fix.
- A second, breakpoint-scoped set of **interactive controls** for the same entity.
- A viewport change that triggers a refetch, a save, an activation, a graph mutation or any
  business side effect.
- `window.innerWidth`, `window.innerHeight`, or a `resize` listener in a surface component;
  in the builder, any `matchMedia` width query outside
  [useBuilderLayout.ts](../../features/workflow-builder/layout/useBuilderLayout.ts) and any
  restatement of the breakpoint numbers outside
  [builderLayoutPolicy.ts](../../features/workflow-builder/layout/builderLayoutPolicy.ts).
- A global CSS `transform: scale(…)` or `zoom` to shrink a whole surface, and any second
  "mobile" implementation of an existing surface.
- Exclusive `max-width` media-query bands — `min-width` only, checked widest-first.
- A legibility floor on a `shrink-0` box or shrink-wrapped text.
- A one-off numeric page width, or a second gutter layered on `AppPageContainer`.
- `break-all` on ordinary prose.
- Weakening an assertion so the final source passes.

## Edge cases

| Case | Answer |
| --- | --- |
| Fixed/absolute overlay "escapes" its parent | Not a defect. Measure it against the **viewport** instead. |
| `display: contents` wrapper has an empty rect | Resolve to the nearest box-generating ancestor; keep the node under assertion. |
| A declared scroller's content is wider than its box | Not a containment failure. The question is whether it was **allowed** to scroll there → panning policy. |
| Region is contained but 7px wide | Legibility failure. Declare a floor on the allocated region. |
| Region has an always-on scroller and looks green | Add `data-no-pan-below` — otherwise the scroller exempts it from the overflow check. |
| A surface is inside the canvas, not the page | Viewport width ≠ content width. Declare the panning floor at the top of the supported range (`1600`), not a viewport breakpoint. |
| Nominal card minimum exceeds a phone container | `minmax(min(300px,100%), 1fr)`, never `minmax(300px, 1fr)`. |
| Named screenshot width is off the 8px grid (390, 820) | Union it into the sweep explicitly. |
| A truncation doesn't take effect | An ancestor is refusing to shrink. Audit the whole width chain — do not add more `truncate`. |

---

## Required tests

For any surface receiving responsive work:

1. **A continuous-width browser sweep** — 360→1600, ≤8px, across the representative fixture
   states, asserting **containment + legibility + panning**.

   ```bash
   npm run verify:responsive          # every surface, one shared build
   npm run verify:responsive -- --shots   # …and the named-width screenshots
   ```

   That is the **only supported entry point**. It clears stale fragments, re-emits every
   fixture, compiles one Tailwind build, and runs all three measurement passes against it
   — so a surface cannot pass on last week's artifacts.
   [scripts/responsive/verify.mjs](../../scripts/responsive/verify.mjs) ·
   passes: [measure-app-shell.mjs](../../scripts/responsive/measure-app-shell.mjs) ·
   [measure-auth.mjs](../../scripts/responsive/measure-auth.mjs) ·
   [measure-marketing.mjs](../../scripts/responsive/measure-marketing.mjs) ·
   fixture emitters: `tests/tools/*Screens.harness.test.tsx`.

   **A new surface joins the certification** by adding its emitter to `EMITTERS` in
   `verify.mjs` and its regions to the pass whose page frame it shares. A surface that
   is swept but never added to the runner is a surface that stops being checked.
2. **A structure guard** for the surface, asserting at minimum: no overflow masking; the
   named/allowed set of local scrollers and their caps; page bounds via a named
   `AppPageContainer` variant with no layered gutter; no breakpoint-scoped control; legibility
   floors present and not on `shrink-0`; panning declarations present where required.
   Pattern: [team](../../tests/structure/responsive-source-guards.test.ts) ·
   [data-surfaces](../../tests/structure/responsive-source-guards.test.ts) ·
   [builder-runs](../../tests/structure/responsive-source-guards.test.ts) ·
   [account-settings](../../tests/structure/responsive-source-guards.test.ts).
   Strip comments before scanning so the guard never fires on prose that discusses the
   pattern — and so it cannot be silenced by moving code into a comment.
3. **Rendered behavior tests** proving exactly one control set per entity, that permissions
   are computed once, and that a presentation switch preserves selection and pending state.
   E.g. [teamResponsive.test.tsx](../../tests/unit/features/team/teamResponsive.test.tsx),
   [runsPanelResponsive.test.tsx](../../tests/unit/features/workflow-builder/canvas/runsPanelResponsive.test.tsx),
   [runResultsResponsive.test.tsx](../../tests/unit/features/workflow-builder/panels/runResultsResponsive.test.tsx).
4. **A non-vacuity proof** (see above), reported with counts and width ranges.

Run the relevant suites **by path**, and report exact suite/test totals — per
[testing-strategy.md](./testing-strategy.md), a bare `npm test` is not the default gate.

---

## Completion checklist

Reusable by future responsive implementation prompts:

- [ ] Every layout group has an explicit out-of-space behavior.
- [ ] Full ancestor width chain audited.
- [ ] No page-level overflow masking introduced.
- [ ] Long prose, identifiers, and technical content use type-appropriate behavior.
- [ ] Interactive desktop/mobile duplicates avoided.
- [ ] Responsive presentation preserves business state and permissions.
- [ ] Ordinary management data does not require phone panning.
- [ ] Legitimate local scrollers are bounded and declared.
- [ ] Containment assertions pass.
- [ ] Legibility floors pass.
- [ ] Panning-policy assertions pass.
- [ ] **Every control hidden at a breakpoint is reachable another way, and that is
      asserted behaviourally** — geometry cannot see a missing control (§D).
- [ ] Continuous-width sweep passes — `npm run verify:responsive`, all passes green.
- [ ] The surface's emitter is registered in `verify.mjs`, so it stays certified.
- [ ] Named screenshots generated and representative ones reviewed (say which).
- [ ] Harness proven non-vacuous.
- [ ] Relevant behavior, payload, permission, and structure tests pass.
- [ ] Blocked validation and pre-existing failures reported separately.

---

## Authoritative implementation examples

| Concern | File |
| --- | --- |
| Shared page container | [components/app-shell/AppPageContainer.tsx](../../components/app-shell/AppPageContainer.tsx) |
| Top / mobile bar | [AppTopBar.tsx](../../components/app-shell/AppTopBar.tsx) · [AppMobileBar.tsx](../../components/app-shell/AppMobileBar.tsx) |
| Responsive management row | [features/team/MembersTable.tsx](../../features/team/MembersTable.tsx) (`sm:contents`, floor 180) |
| Workflow table ↔ card | [WorkflowsTable.tsx](../../features/workflows/WorkflowsTable.tsx) · [WorkflowRow.tsx](../../features/workflows/WorkflowRow.tsx) |
| Builder Runs list ↔ detail | [features/workflow-builder/canvas/RunsPanel.tsx](../../features/workflow-builder/canvas/RunsPanel.tsx) · [RunDetail.tsx](../../features/workflow-builder/canvas/RunDetail.tsx) |
| JSON / local scroller | [RunResultsPanel.tsx](../../features/workflow-builder/panels/RunResultsPanel.tsx) · [RolesTable.tsx](../../features/team/RolesTable.tsx) |
| Builder tiers + overlay behavior | [builderLayoutPolicy.ts](../../features/workflow-builder/layout/builderLayoutPolicy.ts) · [useBuilderOverlaySurface.ts](../../features/workflow-builder/layout/useBuilderOverlaySurface.ts) |
| Responsive measurement harness | [scripts/responsive/measure-app-shell.mjs](../../scripts/responsive/measure-app-shell.mjs) |
| Fixture emitters | `tests/tools/{templates,workflows,accountSettings,team,dataSurface,builderRuns}Screens.harness.test.tsx` |
| Containment assertion | `measure-app-shell.mjs` — `escapes` / `deepEscapes` |
| Legibility declaration | `data-legible-min` / `data-legible-what` — [WorkflowRow.tsx](../../features/workflows/WorkflowRow.tsx), [RunRow.tsx](../../features/runs/RunRow.tsx) |
| Panning declaration | `data-no-pan-below` — [WorkflowsTable.tsx](../../features/workflows/WorkflowsTable.tsx) (1024), [RunsPanel.tsx](../../features/workflow-builder/canvas/RunsPanel.tsx) (1600) |
| Structure guards | [tests/structure/](../../tests/structure/) — `responsive-source-guards.test.ts` (one suite; each surface keeps its own describe) |

## Scope of the completed sweep

The **signed-in** surfaces are swept and guarded: Workflow Builder shell, React Agent
presentation, builder configuration drawer/sheet, Templates, Workflows dashboard and
toolbar, Workflows list/table, Runs list, Builder Runs list/detail, Account Settings, Team
management, and the shared `AppTopBar` / `AppMobileBar` / `AppPageContainer`.

Accepted commit range: `1f4db2684` → `265723b87` (2026-07-30 → 2026-07-31).

**Public marketing and authentication surfaces are NOT swept.** They have no fixture
emitter, no structure guard and no measured evidence. Treat them as unverified until a
batch applies this rule to them.

## Related rules

- [testing-strategy.md](./testing-strategy.md) — verification scope and reporting honesty.
- [workflow-builder-ui.md](./workflow-builder-ui.md) — the builder's responsive tiers and
  presentation model.
- [project-structure-and-module-boundaries.md](./project-structure-and-module-boundaries.md)
  — leaf-folder limits (which is why generated screenshots use per-state subfolders).
