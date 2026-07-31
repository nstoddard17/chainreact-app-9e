/**
 * Cross-surface guard: a breakpoint may HIDE a control only when something present
 * at that width still reaches the same place (RESPONSIVE-CERTIFICATION-10).
 *
 * This is the assertion class the browser sweep is structurally incapable of
 * carrying, and it is the most expensive lesson of the whole responsive arc.
 *
 * The public marketing header dropped all five primary navigation links below
 * 960px with `display: none` and nothing in their place. Measured against the
 * pre-fix source, that produced ZERO containment failures, ZERO legibility
 * failures, ZERO panning failures and a clean document width — a fully green
 * sweep on a page whose navigation was gone. Pricing was unreachable from the nav
 * on every phone. Geometry measures boxes that exist; it is silent about a box
 * that stopped existing.
 *
 * So this guard sweeps EVERY responsive surface for the shape of that mistake:
 * a rule that hides an interactive region at a breakpoint. Each one must be
 * paired, in the same stylesheet, with the replacement that makes it honest.
 *
 * It is deliberately a small allow-list rather than a heuristic. A new entry is
 * cheap to add and forces the author to say out loud what replaces the thing they
 * just hid — which is the whole point.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");

function collect(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collect(full));
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

const rel = (f: string) => relative(ROOT, f).split("\\").join("/");

/**
 * Every place a stylesheet hides an INTERACTIVE region at a breakpoint, with the
 * control that keeps its destinations reachable at that width. "Replacement" is
 * the token that must appear in the same file — the thing a narrow-screen user
 * actually operates instead.
 */
const SANCTIONED_COLLAPSES = [
  {
    file: "features/marketing/MarketingHeader.tsx",
    hides: ".mk-nav-links",
    replacement: "mk-nav-toggle",
    why: "the five primary links collapse into a disclosure; without the toggle they simply vanish",
  },
] as const;

describe("a hidden control always has a present replacement", () => {
  it.each(SANCTIONED_COLLAPSES)(
    "$file hides $hides but ships $replacement",
    ({ file, hides, replacement }) => {
      const src = readFileSync(join(ROOT, file), "utf8");

      // Isolate the narrow-width block, so every assertion below is about what is
      // true AT THE WIDTH WHERE THE CONTROLS ARE HIDDEN — not merely somewhere in
      // the file. The first version of this guard only checked that the
      // replacement token appeared anywhere, and a mutation that set the trigger
      // to `display: none` sailed straight through it: the token was still
      // present, just invisible. That is precisely the pre-fix defect, so the
      // guard has to be anchored to the block.
      const narrow = /@media\s*\(max-width:\s*960px\)\s*\{([\s\S]*)\n {6}`\}<\/style>/.exec(src)?.[1]
        ?? /@media\s*\(max-width:\s*960px\)\s*\{([\s\S]*)$/.exec(src)?.[1]
        ?? "";
      expect(narrow).not.toBe("");

      // The hiding rule exists in that block…
      expect(narrow).toContain(`${hides} { display: none; }`);

      // …the replacement control is DISPLAYED there, not merely mentioned…
      const replacementRule =
        new RegExp(`\\.${replacement}\\s*\\{[^}]*display:\\s*([a-z-]+)`).exec(narrow);
      expect(replacementRule).not.toBeNull();
      expect(replacementRule![1]).not.toBe("none");

      // …and the hidden region is re-revealed by that control's own state.
      expect(narrow).toMatch(/\[data-open="true"\][\s\S]{0,80}display:\s*flex/);
    },
  );
});

describe("no responsive surface hides an interactive region unaccounted for", () => {
  /** The surfaces this arc certified. */
  const SURFACES = ["features/marketing", "features/auth"];

  /**
   * A rule that hides something at a WIDTH breakpoint. Two deliberate narrowings:
   *
   *   · only regions that plausibly carry controls (nav, menu, links, actions,
   *     toolbar, cta, controls, buttons);
   *   · only width-conditioned queries. `@media print` legitimately hides the nav
   *     and footer when a legal or security page is printed — that is correct
   *     behaviour, not a responsive defect, and the first version of this guard
   *     flagged it. Scoping to min/max-width keeps the guard about the failure it
   *     was written for.
   */
  const INTERACTIVE_HIDE =
    /@media[^{]*(?:min-width|max-width)[^{]*\{[^}]*?\.[a-z-]*(nav|menu|links|actions|toolbar|cta|controls|buttons)[a-z-]*\s*\{[^}]*display:\s*none/gi;

  it("finds every hide-an-interactive-region rule and each is sanctioned", () => {
    const found: string[] = [];
    for (const surface of SURFACES) {
      for (const f of collect(join(ROOT, surface))) {
        const src = readFileSync(f, "utf8");
        // Strip comments so prose discussing the pattern never trips the guard.
        const code = src.replace(/\/\*[\s\S]*?\*\//g, "");
        for (const match of code.match(INTERACTIVE_HIDE) ?? []) {
          found.push(`${rel(f)} :: ${match.replace(/\s+/g, " ").slice(0, 70)}`);
        }
      }
    }
    // Every hit must belong to a file that declares a sanctioned collapse. A new
    // one fails here until its replacement is named above.
    const sanctionedFiles = new Set<string>(SANCTIONED_COLLAPSES.map((c) => c.file));
    const unaccounted = found.filter((hit) => !sanctionedFiles.has(hit.split(" :: ")[0]!));
    expect(unaccounted).toEqual([]);
  });
});

describe("the responsive harness stays runnable and registered", () => {
  const PKG = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
    scripts: Record<string, string>;
  };

  it("exposes exactly one supported verification command", () => {
    expect(PKG.scripts["verify:responsive"]).toBe("node scripts/responsive/verify.mjs");
  });

  it("keeps the harness out of the disposable zone", () => {
    // `scripts/trash/**` is ESLint-ignored and defined as never-shipped. A
    // verification command living there is one nobody maintains.
    for (const script of ["verify.mjs", "measure-app-shell.mjs", "measure-auth.mjs", "measure-marketing.mjs"]) {
      expect(readdirSync(join(ROOT, "scripts", "responsive"))).toContain(script);
    }
  });

  it("registers every responsive fixture emitter in the runner", () => {
    // A surface that is swept but never added to the runner silently stops being
    // certified — exactly the drift this batch exists to end.
    const runner = readFileSync(join(ROOT, "scripts", "responsive", "verify.mjs"), "utf8");
    const emitters = readdirSync(join(ROOT, "tests", "tools"))
      .filter((f) => f.endsWith(".harness.test.tsx"))
      .map((f) => f.replace(".harness.test.tsx", ""))
      // documentScreens feeds a different, non-responsive harness; no
      // measurement pass consumes its `document-*` fragments.
      .filter((n) => n !== "documentScreens");
    const missing = emitters.filter((n) => !runner.includes(`"${n}"`));
    expect(missing).toEqual([]);
  });

  it("names every measurement pass it claims to run", () => {
    const runner = readFileSync(join(ROOT, "scripts", "responsive", "verify.mjs"), "utf8");
    for (const script of ["measure-app-shell.mjs", "measure-auth.mjs", "measure-marketing.mjs"]) {
      expect(runner).toContain(script);
    }
  });
});
