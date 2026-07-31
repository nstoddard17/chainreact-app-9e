/**
 * Structure guard: the Team page fixes overflow at its causes and owns its page
 * bounds through the shared container (RESPONSIVE-TEAM-4).
 *
 * Mirrors the Account Settings guard, plus one rule specific to this page: the
 * roster's stacked-vs-table switch must stay a SINGLE set of markup. The obvious
 * way to make a table responsive is to render a `hidden sm:block` table beside a
 * `sm:hidden` card list — two DOMs, two sets of controls, and nothing stopping
 * them from disagreeing about which member may be removed. That is a correctness
 * risk on a permissions surface, not a styling preference, so it is guarded here
 * as well as in the behaviour tests.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const TEAM_PAGE = join(ROOT, "app", "team", "page.tsx");
const TEAM_FEATURE = join(ROOT, "features", "team");

function collect(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collect(full));
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** Strip comments so the guard never fires on prose that discusses the pattern. */
function code(file: string): string {
  return readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

const rel = (f: string) => relative(ROOT, f).split("\\").join("/");
const SOURCES = [TEAM_PAGE, ...collect(TEAM_FEATURE)];

describe("the Team page does not mask horizontal overflow", () => {
  it("uses no overflow-x-hidden / overflow-x-clip anywhere in the team surface", () => {
    const offenders = SOURCES.filter((f) => /overflow-x-(hidden|clip)/.test(code(f))).map(rel);
    expect(offenders).toEqual([]);
  });

  it("keeps the ONE local scroller to the genuinely tabular roles matrix", () => {
    // A capability × role matrix cannot be stacked without repeating the role
    // headings for every row and destroying the comparison it exists to make. The
    // member roster is the opposite case and is stacked instead — if a second
    // scroller ever appears here, that decision is being made again and should be
    // made deliberately.
    const scrollers = SOURCES.filter((f) => /overflow-x-auto/.test(code(f))).map(rel);
    expect(scrollers).toEqual(["features/team/RolesTable.tsx"]);
  });

  it("caps that scroller so it cannot widen its own card", () => {
    const roles = code(join(TEAM_FEATURE, "RolesTable.tsx"));
    const match = /className="[^"]*overflow-x-auto[^"]*"/.exec(roles)?.[0] ?? "";
    expect(match).toContain("max-w-full");
  });

  it("tells a narrow-screen user that the matrix scrolls", () => {
    // An undiscoverable scroller is its own defect.
    expect(code(join(TEAM_FEATURE, "RolesTable.tsx"))).toContain("team-roles-scroll-hint");
  });
});

describe("the Team page owns its bounds through AppPageContainer", () => {
  const page = code(TEAM_PAGE);

  it("renders the shared container rather than a hand-rolled <main>", () => {
    expect(page).toContain("AppPageContainer");
    expect(page).not.toMatch(/<main\b/);
  });

  it("does not layer a second gutter on the container's fluid padding", () => {
    const tag = /<AppPageContainer[\s\S]*?>/.exec(page)?.[0] ?? "";
    expect(tag).not.toMatch(/\bp-\d/);
    expect(tag).not.toMatch(/\bpx-\d/);
    expect(tag).not.toMatch(/\bsm:p-\d/);
    expect(tag).not.toMatch(/\bmax-w-/);
  });

  it("asks for a named width variant, not a one-off numeric width", () => {
    expect(page).toMatch(/width="(app|content|reading)"/);
  });
});

describe("the roster keeps one set of markup for both presentations", () => {
  const roster = code(join(TEAM_FEATURE, "MembersTable.tsx"));

  it("never hides a CONTROL behind a breakpoint", () => {
    // The duplication smell is a whole branch of interactive markup shown only
    // above a breakpoint beside another shown only below it — two sets of Remove
    // buttons and role selects that can drift apart in what they permit.
    //
    // Breakpoint-scoped PRESENTATION is fine and necessary: `hidden sm:grid` on
    // the column headings, `sm:hidden` on the card-mode "Joined " label. So the
    // guard is scoped to what actually matters — a visibility-toggled element must
    // not carry a control. (The rendered proof that exactly one control set exists
    // per member lives in tests/unit/features/team/teamResponsive.test.tsx.)
    const offenders = roster
      .split("\n")
      .map((line, i) => ({ line, n: i + 1 }))
      .filter(
        ({ line }) =>
          /\bsm:hidden\b|\bhidden\b\s[^"]*\bsm:(grid|flex|block)\b/.test(line) &&
          /<Button|<select|onClick|onChange/.test(line),
      )
      .map(({ line, n }) => `${n}: ${line.trim().slice(0, 80)}`);
    expect(offenders).toEqual([]);
  });

  it("declares a minimum readable width for member identity", () => {
    expect(roster).toContain("data-legible-min");
  });

  it("dissolves the card-mode wrapper back into grid tracks rather than re-rendering", () => {
    // `sm:contents` is what lets one wrapper be a wrapping row on a phone and no
    // box at all in the table — the mechanism that makes a single DOM possible.
    expect(roster).toContain("sm:contents");
  });
});
