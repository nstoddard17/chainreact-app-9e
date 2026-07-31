/**
 * Structure guard: the workflow list and the runs list fix overflow at its
 * causes, never mask it, and never duplicate an interactive surface
 * (RESPONSIVE-DATA-SURFACES-5).
 *
 * The duplication rule is the important one here. The obvious way to make an
 * 880px grid work on a phone is to render the table `hidden lg:block` beside a
 * `lg:hidden` card list. That gives every workflow two checkboxes and two action
 * menus, and selection state, permission gating and menu contents can then drift
 * apart between them — a correctness risk on a surface that activates, moves and
 * trashes workflows. Breakpoint-scoped PRESENTATION stays allowed; a
 * breakpoint-scoped CONTROL does not.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const WORKFLOWS_PAGE = join(ROOT, "app", "workflows", "page.tsx");
const RUNS_PAGE = join(ROOT, "app", "runs", "page.tsx");
const WORKFLOWS_FEATURE = join(ROOT, "features", "workflows");
const RUNS_FEATURE = join(ROOT, "features", "runs");

function collect(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collect(full));
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

function code(file: string): string {
  return readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

const rel = (f: string) => relative(ROOT, f).split("\\").join("/");

describe("neither data surface masks horizontal overflow", () => {
  it("uses no overflow-x-hidden / overflow-x-clip", () => {
    const sources = [
      WORKFLOWS_PAGE,
      RUNS_PAGE,
      ...collect(WORKFLOWS_FEATURE),
      ...collect(RUNS_FEATURE),
    ];
    const offenders = sources.filter((f) => /overflow-x-(hidden|clip)/.test(code(f))).map(rel);
    expect(offenders).toEqual([]);
  });
});

describe("both pages own their bounds through AppPageContainer", () => {
  it.each([
    ["app/workflows/page.tsx", WORKFLOWS_PAGE],
    ["app/runs/page.tsx", RUNS_PAGE],
  ])("%s renders the shared container and no hand-rolled <main>", (_label, file) => {
    const page = code(file);
    expect(page).toContain("AppPageContainer");
    expect(page).not.toMatch(/<main\b/);
  });

  it.each([
    ["app/workflows/page.tsx", WORKFLOWS_PAGE],
    ["app/runs/page.tsx", RUNS_PAGE],
  ])("%s does not layer a second gutter on the container", (_label, file) => {
    const tag = /<AppPageContainer[\s\S]*?>/.exec(code(file))?.[0] ?? "";
    expect(tag).not.toMatch(/\bp-\d/);
    expect(tag).not.toMatch(/\bpx-\d/);
    expect(tag).not.toMatch(/\bsm:p-\d/);
    expect(tag).not.toMatch(/\bmax-w-/);
  });
});

describe("the workflow list keeps one set of markup for both presentations", () => {
  const roster = code(join(WORKFLOWS_FEATURE, "WorkflowRow.tsx"));
  const view = code(join(WORKFLOWS_FEATURE, "WorkflowsTable.tsx"));

  it("never hides a CONTROL behind a breakpoint", () => {
    const offenders = [roster, view]
      .flatMap((src, i) =>
        src.split("\n").map((line, n) => ({ line, n: n + 1, file: i === 0 ? "WorkflowRow" : "WorkflowsTable" })),
      )
      .filter(
        ({ line }) =>
          /\blg:hidden\b|\bhidden\b\s[^"]*\blg:(grid|flex|block)\b/.test(line) &&
          /<Button|<select|<input|onClick|onChange|ActionsMenu|StatusToggle/.test(line),
      )
      .map(({ file, n, line }) => `${file}:${n}: ${line.trim().slice(0, 70)}`);
    expect(offenders).toEqual([]);
  });

  it("scopes the table grid, its 880px floor and its scroller to lg and up", () => {
    expect(roster).toContain("lg:grid-cols-[");
    expect(roster).not.toMatch(/"grid items-center/);
    expect(view).toContain("lg:min-w-[880px]");
    expect(view).toContain("lg:overflow-x-auto");
  });

  it("declares that the list must not require sideways panning below lg", () => {
    expect(view).toContain('data-no-pan-below="1024"');
  });

  it("dissolves the card-mode wrappers back into grid tracks rather than re-rendering", () => {
    // `lg:contents` is the mechanism that makes a single DOM possible.
    expect(roster).toContain("lg:contents");
  });
});

describe("legibility floors are attached to allocated regions", () => {
  it("declares a floor on the workflow identity cell and the run identity group", () => {
    expect(code(join(WORKFLOWS_FEATURE, "WorkflowRow.tsx"))).toContain("data-legible-min");
    expect(code(join(RUNS_FEATURE, "RunRow.tsx"))).toContain("data-legible-min");
  });

  it("never declares a floor on a shrink-wrapped region", () => {
    // A `shrink-0` box wraps its content, so its width is content size, not an
    // allocation — measuring it produces false failures on genuinely short
    // content. (This caught a mis-calibrated floor on the action region.)
    const sources = [...collect(WORKFLOWS_FEATURE), ...collect(RUNS_FEATURE)];
    const offenders: string[] = [];
    for (const f of sources) {
      const src = readFileSync(f, "utf8");
      for (const block of src.match(/<div[^>]*data-legible-min[^>]*>/g) ?? []) {
        if (/\bshrink-0\b/.test(block)) offenders.push(`${rel(f)}: ${block.slice(0, 90)}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
