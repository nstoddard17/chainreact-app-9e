/**
 * Structure guard: the public marketing funnel fixes overflow at its causes, keeps
 * ONE interactive navigation, and declares its one legitimate scroller
 * (RESPONSIVE-MARKETING-9).
 *
 * The rule this exists to hold is the one a geometry sweep provably cannot check.
 * The header used to drop its five primary links at 960px with `display: none`
 * and nothing in their place — measured, that produces ZERO containment,
 * legibility and panning failures. Nothing overflows; the navigation is simply
 * gone, and a phone visitor cannot reach Pricing. So "the links collapse into
 * something" has to be asserted structurally and behaviourally, never by pixels.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const MARKETING = join(ROOT, "features", "marketing");

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
const SOURCES = collect(MARKETING);

describe("the marketing surface does not mask horizontal overflow", () => {
  it("finds marketing sources to scan (guards against a silently empty sweep)", () => {
    expect(SOURCES.length).toBeGreaterThan(15);
  });

  it("uses no overflow-x-hidden / overflow-x-clip", () => {
    const offenders = SOURCES.filter((f) => /overflow-x-(hidden|clip)|overflow-x:\s*(hidden|clip)/.test(code(f))).map(rel);
    expect(offenders).toEqual([]);
  });

  it("keeps the ONE local scroller to the genuinely tabular plan matrix", () => {
    // Five plans across ~30 features is irreducibly two-dimensional; stacking it
    // would repeat the plan headings for every row. Everything else on the public
    // funnel must fit. A second scroller means that decision is being made again.
    const scrollers = SOURCES.filter((f) => /overflow-x:\s*(auto|scroll)/.test(code(f))).map(rel);
    expect(scrollers).toEqual(["features/marketing/PricingPage.tsx"]);
  });

  it("bounds that scroller so it cannot widen its own section", () => {
    const pricing = code(join(MARKETING, "PricingPage.tsx"));
    const rule = /\.pr-cmp-scroll\s*\{[^}]*\}/.exec(pricing)?.[0] ?? "";
    expect(rule).toContain("overflow-x: auto");
    expect(rule).toContain("max-width: 100%");
  });
});

describe("public navigation collapses instead of vanishing", () => {
  const nav = code(join(MARKETING, "MarketingNav.tsx"));
  const header = code(join(MARKETING, "MarketingHeader.tsx"));

  it("declares the primary destinations exactly once", () => {
    expect(nav).toContain("export const NAV_LINKS");
    // The header must not re-list destinations of its own beside the shared set.
    const headerNavLinks = header.match(/className="mk-nav-link"/g) ?? [];
    expect(headerNavLinks).toEqual([]);
  });

  it("ships a menu trigger below the collapse breakpoint", () => {
    expect(nav).toContain("mk-nav-toggle");
    expect(nav).toContain("aria-expanded");
    expect(nav).toContain("aria-controls");
    expect(header).toMatch(/@media\s*\(max-width:\s*960px\)[\s\S]*\.mk-nav-toggle\s*\{\s*display:\s*inline-flex/);
  });

  it("never hides the links without also offering the trigger", () => {
    // The pre-fix defect in one assertion: a rule that hides `.mk-nav-links`
    // below the breakpoint is only acceptable in a block that also shows the
    // toggle and re-displays the links when open.
    const narrowBlock = /@media\s*\(max-width:\s*960px\)\s*\{([\s\S]*?)\n {8}\}/.exec(header)?.[1] ?? "";
    expect(narrowBlock).toContain(".mk-nav-links { display: none; }");
    expect(narrowBlock).toMatch(/\[data-open="true"\]\s*\.mk-nav-links\s*\{\s*[\s\S]*display:\s*flex/);
  });

  it("renders one nav element rather than a desktop/mobile pair", () => {
    const definers = SOURCES.filter((f) => /data-testid="marketing-nav-links"/.test(code(f))).map(rel);
    expect(definers).toEqual(["features/marketing/MarketingNav.tsx"]);
  });

  it("bounds the open panel against the viewport", () => {
    // A panel anchored to the trigger and asked for a fixed width pushed past the
    // right edge at 360–376px (measured). It is anchored to the header gutter.
    expect(header).toMatch(/\[data-open="true"\]\s*\.mk-nav-links\s*\{[\s\S]*?right:\s*clamp/);
    expect(header).toMatch(/\[data-open="true"\]\s*\.mk-nav-links\s*\{[\s\S]*?overflow-y:\s*auto/);
  });
});

describe("public prose breaks targetedly, without indiscriminate word breaking", () => {
  it("never reaches for word-break: break-all on marketing prose", () => {
    const offenders = SOURCES.filter((f) => /word-break:\s*break-all/.test(code(f))).map(rel);
    expect(offenders).toEqual([]);
  });

  it("scopes the token-breaking rule to prose elements in globals", () => {
    const globals = readFileSync(join(ROOT, "app", "globals.css"), "utf8");
    expect(globals).toMatch(
      /\[data-marketing-surface\]\s*:is\([^)]*p[^)]*\)\s*\{\s*overflow-wrap:\s*anywhere/,
    );
  });
});

describe("legibility and panning declarations follow the rule", () => {
  it("declares the panning policy on the comparison section, not on the matrix", () => {
    const pricing = readFileSync(join(MARKETING, "PricingPage.tsx"), "utf8");
    expect(pricing).toContain('data-no-pan-below="1600"');
    // The scroller element itself must stay un-annotated — declaring no-pan there
    // would forbid exactly the behaviour that region needs.
    const scrollerTag = /<div\s+className="pr-cmp-scroll"[\s\S]*?>/.exec(pricing)?.[0] ?? "";
    expect(scrollerTag).not.toContain("data-no-pan-below");
  });

  it("names what every legibility floor protects", () => {
    for (const f of SOURCES) {
      const src = readFileSync(f, "utf8");
      for (const tag of src.match(/<[a-zA-Z]+[^>]*data-legible-min[^>]*>/g) ?? []) {
        expect(tag).toContain("data-legible-what");
      }
    }
  });

  it("never declares a floor on a shrink-wrapped region", () => {
    const offenders: string[] = [];
    for (const f of SOURCES) {
      const src = readFileSync(f, "utf8");
      for (const tag of src.match(/<[a-zA-Z]+[^>]*data-legible-min[^>]*>/g) ?? []) {
        if (/\bshrink-0\b|flex:\s*none/.test(tag)) offenders.push(`${rel(f)}: ${tag.slice(0, 90)}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("the marketing surface keeps its client boundary honest", () => {
  it("adds client JS only where interaction genuinely requires it", () => {
    // The header stays a server component; only the disclosure is a client
    // component. A public marketing page should not ship JS it does not need.
    expect(code(join(MARKETING, "MarketingHeader.tsx"))).not.toContain('"use client"');
    expect(code(join(MARKETING, "MarketingNav.tsx"))).toContain('"use client"');
  });

  it("reaches for no server-only data access from a marketing component", () => {
    const offenders = SOURCES.filter((f) =>
      /from\s+"@\/(services|repositories)\//.test(code(f)),
    ).map(rel);
    expect(offenders).toEqual([]);
  });
});
