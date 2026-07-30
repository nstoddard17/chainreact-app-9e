/**
 * Structure guard: the workflow builder has ONE source of viewport truth
 * (BUILDER-RESPONSIVE-LAYOUT-1).
 *
 * The failure mode this exists to prevent is the one the slice brief calls out
 * explicitly: "multiple unrelated `window.innerWidth` listeners". Responsive
 * behaviour rots when the next person needing a width adds their own resize
 * handler with their own threshold — the header ends up disagreeing with the
 * rail about what "narrow" means, and nobody can find all the places to change.
 *
 * So: exactly one module may ask the browser about width, exactly one module may
 * define the thresholds, and nothing in the builder may listen for `resize`.
 * A future slice that genuinely needs element-level measurement should follow
 * the analytics precedent (`useResponsiveGrid`, a scoped `ResizeObserver` on the
 * element that matters) and extend this test to name it — deliberately, not by
 * accident.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const BUILDER = join(ROOT, "features", "workflow-builder");

/** The single module allowed to query the viewport. */
const VIEWPORT_OWNER = "features/workflow-builder/layout/useBuilderLayout.ts";
/** The single module allowed to define breakpoint numbers. */
const POLICY_OWNER = "features/workflow-builder/layout/builderLayoutPolicy.ts";

function collect(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collect(full));
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

/**
 * Strip comments before scanning. Without this the guard fires on its own
 * subject matter: the modules that legitimately own viewport access DOCUMENT why
 * `window.innerWidth` is the wrong tool, and a prose mention is not a call.
 * Scanning code and not commentary is what keeps this test honest in both
 * directions — it must not be silenceable by moving a call into a comment
 * either, hence stripping rather than skipping the owner files.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

const files = collect(BUILDER).map((absolute) => ({
  path: relative(ROOT, absolute).replace(/\\/g, "/"),
  source: stripComments(readFileSync(absolute, "utf8")),
  raw: readFileSync(absolute, "utf8"),
}));

describe("builder responsive layout — single source of viewport truth", () => {
  it("finds builder files to scan (guards against a silently empty sweep)", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("no builder file reads window.innerWidth / innerHeight", () => {
    const offenders = files
      .filter(({ source }) => /\b(?:window\.)?inner(?:Width|Height)\b/.test(source))
      .map(({ path }) => path);
    expect(offenders).toEqual([]);
  });

  it("no builder file registers a window resize listener", () => {
    const offenders = files
      .filter(({ source }) =>
        /addEventListener\(\s*['"]resize['"]|onresize\s*=/.test(source),
      )
      .map(({ path }) => path);
    expect(offenders).toEqual([]);
  });

  it("only useBuilderLayout queries the viewport WIDTH via matchMedia", () => {
    // `prefers-reduced-motion` is a different question — an accessibility
    // preference, not a layout width — and several builder surfaces legitimately
    // ask it. Only width/height queries are restricted.
    const offenders = files
      .filter(({ path }) => path !== VIEWPORT_OWNER)
      .filter(({ source }) => {
        const calls = source.match(/matchMedia\([^)]*\)/g) ?? [];
        return calls.some((call) => /min-width|max-width|min-height|max-height/.test(call));
      })
      .map(({ path }) => path);
    expect(offenders).toEqual([]);
  });

  it("only builderLayoutPolicy hard-codes the breakpoint numbers", () => {
    const policy = files.find(({ path }) => path === POLICY_OWNER);
    expect(policy).toBeDefined();
    expect(policy!.raw).toMatch(/BUILDER_WIDE_MIN_WIDTH\s*=\s*1280/);
    expect(policy!.raw).toMatch(/BUILDER_MEDIUM_MIN_WIDTH\s*=\s*900/);

    // Nothing else may restate 900 / 1280 as a pixel threshold. A component that
    // needs the boundary imports the constant.
    const offenders = files
      .filter(({ path }) => path !== POLICY_OWNER && path !== VIEWPORT_OWNER)
      .filter(({ source }) =>
        /(?:min-width|max-width)\s*:\s*(?:900|1280|1279|899)(?:\.\d+)?px/.test(source),
      )
      .map(({ path }) => path);
    expect(offenders).toEqual([]);
  });

  it("no builder file uses a CSS transform or zoom to shrink the whole surface", () => {
    // The brief forbids "global transforms that visually shrink the entire
    // builder" and browser-zoom tricks as a substitute for real layout. Scoped
    // transforms (a node hover lift, an icon rotation) are fine; scaling a
    // layout container is not.
    const offenders = files
      .filter(({ source }) =>
        /zoom\s*:\s*[\d.]|transform\s*:\s*['"`]?\s*scale\(\s*0?\.\d/.test(source),
      )
      .map(({ path }) => path);
    expect(offenders).toEqual([]);
  });

  it("no builder component reaches for server-only data access directly", () => {
    // `client-server-boundary.test.ts` covers all of features/ for
    // services/repositories imports; this adds the builder-scoped raw-access
    // forms that rule doesn't look for, so a responsive refactor can't smuggle
    // one in alongside a layout change.
    const offenders = files
      .filter(({ source }) => /supabase\s*\.\s*from\s*\(|createClient\s*\(/.test(source))
      .map(({ path }) => path);
    expect(offenders).toEqual([]);
  });

  it("keeps exactly one builder shell — no parallel narrow-screen implementation", () => {
    // Two builder implementations is the failure the brief rules out; the cheap
    // structural proxy is that only one module composes the shell layout.
    const shellDefiners = files
      .filter(({ source }) => /export function BuilderShell\b/.test(source))
      .map(({ path }) => path);
    expect(shellDefiners).toEqual(["features/workflow-builder/layout/BuilderShell.tsx"]);
  });
});
