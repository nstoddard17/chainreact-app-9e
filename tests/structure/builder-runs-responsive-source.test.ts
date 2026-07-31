/**
 * Structure guard: the builder's run surfaces fix overflow at its causes, keep a
 * single interactive implementation, and declare legibility floors only on
 * regions that actually allocate space (RESPONSIVE-BUILDER-RUNS-6).
 *
 * The panning rule is the one that carries the most weight here. These surfaces
 * are the first where BOTH answers are correct in different places: the Runs
 * panel, its history nav and the run detail must never require sideways panning,
 * while the per-step JSON viewer must be allowed to scroll, because reflowing
 * JSON destroys the structure the author is reading. A guard that treated
 * "horizontal scrolling" as uniformly good or bad would be wrong twice.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const BUILDER = join(ROOT, "features", "workflow-builder");
const RUNS_PANEL = join(BUILDER, "canvas", "RunsPanel.tsx");
const RUN_DETAIL = join(BUILDER, "canvas", "RunDetail.tsx");
const RUNS_PARTS = join(BUILDER, "canvas", "runsPanelParts.tsx");
const RESULTS_PANEL = join(BUILDER, "panels", "RunResultsPanel.tsx");

const RUN_SOURCES = [RUNS_PANEL, RUN_DETAIL, RUNS_PARTS, RESULTS_PANEL];

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

describe("the builder run surfaces do not mask overflow", () => {
  it("adds no overflow-x-hidden / overflow-x-clip", () => {
    const offenders = RUN_SOURCES.filter((f) => /overflow-x-(hidden|clip)/.test(code(f))).map(rel);
    expect(offenders).toEqual([]);
  });
});

describe("the panning policy distinguishes the panel from the data viewer", () => {
  it("declares that the Runs panel, its history nav and the detail never pan", () => {
    expect(code(RUNS_PANEL)).toContain('data-no-pan-below');
    expect(code(RUNS_PANEL).match(/data-no-pan-below/g) ?? []).toHaveLength(2); // panel + nav
    expect(code(RUN_DETAIL)).toContain("data-no-pan-below");
  });

  it("leaves the per-step JSON viewer free to scroll, and bounded", () => {
    const results = code(RESULTS_PANEL);
    // Allowed to scroll — reflowing JSON would destroy its structure…
    expect(results).toContain("overflow-auto");
    // …but capped, so its intrinsic content width cannot size the panel.
    const pre = /className="[^"]*overflow-auto[^"]*"/.exec(results)?.[0] ?? "";
    expect(pre).toContain("max-w-full");
    expect(pre).toContain("min-w-0");
    expect(pre).toContain("max-h-48");
  });

  it("never declares no-pan on the JSON viewer itself", () => {
    // Declaring it there would forbid exactly the behaviour that surface needs.
    const results = code(RESULTS_PANEL);
    const preTag = /<pre[\s\S]*?>/.exec(results)?.[0] ?? "";
    expect(preTag).not.toContain("data-no-pan-below");
  });
});

describe("the Runs tab keeps one interactive implementation", () => {
  const panel = code(RUNS_PANEL);

  it("mounts both surfaces and toggles visibility rather than re-rendering one", () => {
    // Two mounted surfaces whose visibility changes — not a desktop tree beside a
    // mobile tree, which would double every control and could drift apart.
    expect(panel).toContain('data-testid="runs-list-surface"');
    expect(panel).toContain('data-testid="runs-detail-surface"');
    expect(panel).toContain("lg:flex");
  });

  it("keeps ONE selection state and a presentation-only narrow-view state", () => {
    // `selectedRunId` decides WHICH run in both presentations; `narrowView` only
    // decides which surface is on screen when there is not room for both.
    expect(panel.match(/setSelectedRunId/g)?.length ?? 0).toBeGreaterThan(0);
    expect(panel).toContain("narrowView");
    // The narrow-view state must never be read to decide data — only layout.
    expect(panel).not.toMatch(/narrowView[\s\S]{0,80}(getWorkflowRun|listWorkflowRuns)/);
  });

  it("puts no viewport listener or width branch in the run surfaces", () => {
    // The builder has ONE source of viewport truth (`useBuilderLayout`); run
    // components must express responsiveness in CSS, not in JS width branches.
    for (const f of RUN_SOURCES) {
      const src = code(f);
      expect(src).not.toContain("window.innerWidth");
      expect(src).not.toContain("addEventListener(\"resize\"");
      expect(src).not.toContain("matchMedia");
    }
  });
});

describe("legibility floors sit on allocated regions only", () => {
  it("declares floors on the run detail pane and both step identity cells", () => {
    expect(code(RUN_DETAIL)).toContain("data-legible-min");
    expect(code(RUNS_PARTS)).toContain("data-legible-min");
    expect(code(RESULTS_PANEL)).toContain("data-legible-min");
  });

  it("never declares a floor on a shrink-0 box anywhere in the builder", () => {
    // A `shrink-0` box wraps its content, so its width is content size rather
    // than an allocation — measuring it produces false failures on legitimately
    // short content. Same rule the data-surfaces batch established.
    const offenders: string[] = [];
    for (const f of collect(BUILDER)) {
      const src = readFileSync(f, "utf8");
      for (const tag of src.match(/<[a-zA-Z]+[^>]*data-legible-min[^>]*>/g) ?? []) {
        if (/\bshrink-0\b/.test(tag)) offenders.push(`${rel(f)}: ${tag.slice(0, 90)}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
