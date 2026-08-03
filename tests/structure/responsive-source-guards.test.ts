/** @jest-environment node */
/**
 * STRUCTURE-TEST-CONSOLIDATION-1 — the responsive-source guard family in ONE
 * suite process. Every surface's rules are preserved verbatim in its own
 * describe (these guards are NOT copy-paste of each other: each carries
 * surface-specific rules with load-bearing rationale — see each section's
 * original header). Consolidation removes seven duplicate recursive walkers
 * and seven jsdom-defaulted suite processes, nothing else.
 * Referenced by docs/rules/responsive-layout-and-validation.md (section
 * names keep the original file stems so those references stay findable).
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";

describe("account-settings-responsive-source", () => {
  /**
   * Structure guard: Account Settings fixes overflow at its causes and owns its
   * page bounds through the shared container (RESPONSIVE-SETTINGS-3).
   *
   * Two failure modes this exists to prevent, both of which turn a green harness
   * into a lie:
   *
   *  1. **Blanket overflow masking.** `overflow-x-hidden` / `overflow-x-clip` on a
   *     page or section makes `document.scrollWidth <= clientWidth` true while the
   *     content underneath is still bursting — the sweep goes green because the
   *     evidence was hidden, not because the layout was fixed. Card-level
   *     `overflow-hidden` (rounded corners on `Panel`) is a different thing and is
   *     allowed; the axis-specific variants are the ones used to hide bugs.
   *
   *  2. **Two width systems layered.** The point of `AppPageContainer` is that one
   *     component owns the page's max-width, fluid gutter and `min-width: 0`. A page
   *     that adopts it AND keeps its old `p-6 sm:p-8` gutter ends up double-padded,
   *     and the next person cannot tell which one is load-bearing.
   */

  const ROOT = resolve(__dirname, "../..");
  const ACCOUNT_PAGE = join(ROOT, "app", "account", "page.tsx");
  const ACCOUNT_FEATURE = join(ROOT, "features", "account");
  /** Shared settings primitives the Account page renders through. */
  const SHARED_SETTINGS = [
    join(ROOT, "features", "team", "SettingRow.tsx"),
    join(ROOT, "features", "team", "Panel.tsx"),
    join(ROOT, "features", "team", "SectionHeading.tsx"),
  ];

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

  const SOURCES = [ACCOUNT_PAGE, ...collect(ACCOUNT_FEATURE), ...SHARED_SETTINGS];

  describe("Account Settings does not mask horizontal overflow", () => {
    it("uses no overflow-x-hidden / overflow-x-clip anywhere in the settings surface", () => {
      const offenders = SOURCES.filter((f) => /overflow-x-(hidden|clip)/.test(code(f))).map((f) =>
        relative(ROOT, f).split("\\").join("/"),
      );
      expect(offenders).toEqual([]);
    });

    it("allows a LOCAL overflow-x-auto scroller only where content is genuinely wide", () => {
      // A pre-formatted code block and a client-config block are the two places
      // where content is legitimately wider than a phone and cannot be reflowed.
      // Each must also be capped so the scroller itself cannot widen its card.
      const scrollers = SOURCES.filter((f) => /overflow-x-auto/.test(code(f)));
      for (const f of scrollers) {
        const body = code(f);
        for (const match of body.match(/className="[^"]*overflow-x-auto[^"]*"/g) ?? []) {
          expect(match).toContain("max-w-full");
        }
      }
      expect(scrollers.map((f) => relative(ROOT, f).split("\\").join("/")).sort()).toEqual([
        "features/account/ApiDocsPanel.tsx",
        "features/account/mcp/McpTokenConfigBlock.tsx",
      ]);
    });
  });

  describe("Account Settings owns its page bounds through AppPageContainer", () => {
    const page = code(ACCOUNT_PAGE);

    it("renders the shared container rather than a hand-rolled <main>", () => {
      expect(page).toContain("AppPageContainer");
      expect(page).not.toMatch(/<main\b/);
    });

    it("does not layer a second gutter on top of the container's fluid padding", () => {
      // The container already applies `padding-inline: clamp(1rem, 2.5vw, 2rem)`.
      // Horizontal padding here would double it; vertical padding is the page's own.
      const containerTag = /<AppPageContainer[\s\S]*?>/.exec(page)?.[0] ?? "";
      // Non-vacuity (STRUCTURE-TEST-CONSOLIDATION-1): a page that DROPPED the
      // container would previously make every negative below pass on "".
      expect(containerTag).not.toBe("");
      expect(containerTag).not.toMatch(/\bp-\d/);
      expect(containerTag).not.toMatch(/\bpx-\d/);
      expect(containerTag).not.toMatch(/\bsm:p-\d/);
      expect(containerTag).not.toMatch(/\bmax-w-/);
    });

    it("asks for a named width variant rather than a one-off numeric width", () => {
      expect(page).toMatch(/width="(app|content|reading)"/);
    });
  });

  describe("the settings row keeps its responsive contract", () => {
    const row = code(join(ROOT, "features", "team", "SettingRow.tsx"));

    it("never pins the control slot with shrink-0 again", () => {
      // This single class is what made a long email the row's minimum width and
      // pushed ~300px of content under the card's `overflow-hidden`.
      expect(row).not.toContain("shrink-0");
    });

    it("stacks before it sits side-by-side", () => {
      expect(row).toContain("sm:flex-row");
      expect(row).toContain("min-w-0");
    });
  });
});

describe("auth-responsive-source", () => {
  /**
   * Structure guard: the authentication surface fixes overflow at its causes, keeps
   * ONE interactive implementation, and declares legibility floors only on regions
   * that actually allocate space (RESPONSIVE-AUTH-8).
   *
   * Auth is the highest-consequence surface in the product: a phone layout failure
   * here does not degrade a feature, it blocks registration, sign-in and recovery
   * outright. Two rules carry the weight.
   *
   * FIRST, the legibility floors are load-bearing in a way they are not elsewhere.
   * The auth split-screen fails by COMPRESSION, not by bursting: with the
   * single-column collapse removed, a 360px phone kept the two-column grid, the form
   * well fell to 128px and the six verification-code cells to 15px — and the document
   * reported ZERO horizontal overflow. Measured. A containment-only sweep passes that
   * silently, so the floors are the only assertion that can see it.
   *
   * SECOND, every slot that renders a value the user did not author must break
   * targetedly. A 60-char provider reference with no break opportunity pushed the
   * document 184px wide at 360px. Long emails happened to survive because Chrome
   * breaks at the at-sign and dot — that is luck, not a design.
   */

  const ROOT = resolve(__dirname, "../..");
  const AUTH_FEATURE = join(ROOT, "features", "auth");
  const AUTH_ROUTES = join(ROOT, "app", "auth");
  const STYLES = join(AUTH_FEATURE, "AuthSurfaceStyles.tsx");

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
  const SOURCES = [...collect(AUTH_FEATURE), ...collect(AUTH_ROUTES)];

  describe("the auth surface does not mask horizontal overflow", () => {
    it("finds auth sources to scan (guards against a silently empty sweep)", () => {
      expect(SOURCES.length).toBeGreaterThan(10);
    });

    it("uses no overflow-x-hidden / overflow-x-clip anywhere on the auth surface", () => {
      const offenders = SOURCES.filter((f) => /overflow-x-(hidden|clip)/.test(code(f))).map(rel);
      expect(offenders).toEqual([]);
    });

    it("introduces no local horizontal scroller", () => {
      // Nothing on an auth screen is irreducibly wide — there is no JSON, no log and
      // no provider table. A scroller appearing here would mean a layout problem was
      // absorbed rather than fixed.
      const offenders = SOURCES.filter((f) => /overflow-x:\s*(auto|scroll)|overflow-x-auto/.test(code(f))).map(rel);
      expect(offenders).toEqual([]);
    });
  });

  describe("the auth split-screen has an explicit out-of-space behavior", () => {
    const styles = code(STYLES);

    it("collapses the two-column grid to one column when there is not room", () => {
      // The bare declaration is `minmax(0,1fr) 1.05fr`. Without this collapse the
      // split persists onto a phone and the form is compressed, not overflowed.
      expect(styles).toMatch(/@media\s*\(max-width:\s*900px\)\s*\{\s*\.au-root\s*\{[^}]*grid-template-columns:\s*1fr/);
    });

    it("hides the decorative showcase rather than letting it squeeze the form", () => {
      expect(styles).toMatch(/@media\s*\(max-width:\s*900px\)\s*\{\s*\.au-show\s*\{[^}]*display:\s*none/);
    });

    it("keeps the form column shrinkable and the form well bounded", () => {
      expect(styles).toMatch(/\.au-form-col\s*\{[^}]*min-width:\s*0/);
      expect(styles).toMatch(/\.au-inner\s*\{[^}]*max-width:\s*380px/);
    });
  });

  describe("every user-supplied value breaks targetedly", () => {
    const styles = code(STYLES);

    // The slots that can receive a value the user did not author: the echoed address
    // and the four message containers that render server/provider text.
    it.each([".au-em", ".au-alert", ".au-status", ".au-note", ".au-fld-err"])(
      "%s uses overflow-wrap: anywhere",
      (selector) => {
        const rule = new RegExp(`\\${selector}\\s*\\{[^}]*overflow-wrap:\\s*anywhere`);
        expect(styles).toMatch(rule);
      },
    );

    it("never reaches for indiscriminate word-break on prose", () => {
      // `overflow-wrap: anywhere` breaks a word only when it would otherwise
      // overflow; `word-break: break-all` breaks every word, mid-sentence. The
      // responsive rule forbids the latter on ordinary prose, and every one of
      // these containers is prose.
      expect(styles).not.toMatch(/word-break:\s*break-all/);
    });
  });

  describe("legibility floors sit on allocated regions only", () => {
    it("declares a floor on the form well, the code grid and the OAuth control", () => {
      expect(code(join(AUTH_FEATURE, "AuthShell.tsx"))).toContain('data-legible-min="280"');
      expect(code(join(AUTH_FEATURE, "AuthCodeInput.tsx"))).toContain('data-legible-min="252"');
      expect(code(join(AUTH_FEATURE, "GoogleSignInButton.tsx"))).toContain('data-legible-min="240"');
    });

    it("names what each floor protects, so a failure is readable", () => {
      for (const f of SOURCES) {
        const src = readFileSync(f, "utf8");
        for (const tag of src.match(/<[a-zA-Z]+[^>]*data-legible-min[^>]*>/g) ?? []) {
          expect(tag).toContain("data-legible-what");
        }
      }
    });

    it("never declares a floor on a shrink-wrapped or shrink-0 region", () => {
      // Same calibration rule the data-surfaces and builder batches established: a
      // box whose width is its content size is not an allocation, and measuring it
      // produces false failures on legitimately short content.
      const offenders: string[] = [];
      for (const f of SOURCES) {
        const src = readFileSync(f, "utf8");
        for (const tag of src.match(/<[a-zA-Z]+[^>]*data-legible-min[^>]*>/g) ?? []) {
          if (/\bshrink-0\b/.test(tag)) offenders.push(`${rel(f)}: ${tag.slice(0, 90)}`);
        }
      }
      expect(offenders).toEqual([]);
    });
  });

  describe("the auth page declares that it must never pan", () => {
    it("declares no-pan on the auth root across the whole supported range", () => {
      expect(code(join(AUTH_FEATURE, "AuthShell.tsx"))).toContain('data-no-pan-below="1600"');
    });
  });

  describe("the auth surface keeps one interactive implementation", () => {
    it("renders exactly one auth shell", () => {
      const definers = SOURCES.filter((f) => /export function AuthShell\b/.test(code(f))).map(rel);
      expect(definers).toEqual(["features/auth/AuthShell.tsx"]);
    });

    it("has no breakpoint-scoped duplicate of a form control", () => {
      // A second, narrow-screen copy of an input, submit, OAuth button or captcha is
      // the failure mode this forbids: two submission paths on the surface that
      // creates accounts is a correctness risk, not a styling preference.
      const offenders = SOURCES.flatMap((f) =>
        code(f)
          .split("\n")
          .map((line, n) => ({ line, n: n + 1, f }))
          .filter(
            ({ line }) =>
              /\b(sm|md|lg):hidden\b|\bhidden\b\s[^"]*\b(sm|md|lg):(flex|block|grid)\b/.test(line) &&
              /<input|<button|AuthField|AuthSubmit|TurnstileWidget|GoogleSignInButton|AuthCodeInput/.test(line),
          )
          .map(({ f: file, n, line }) => `${rel(file)}:${n}: ${line.trim().slice(0, 70)}`),
      );
      expect(offenders).toEqual([]);
    });

    it("puts no viewport listener or JS width branch on the auth surface", () => {
      // Auth responsiveness is expressed in CSS. The one matchMedia call that is
      // allowed asks about reduced motion, which is an accessibility preference and
      // not a layout width.
      for (const f of SOURCES) {
        const src = code(f);
        expect(src).not.toContain("window.innerWidth");
        expect(src).not.toMatch(/addEventListener\(\s*["']resize["']/);
        const widthQueries = (src.match(/matchMedia\([^)]*\)/g) ?? []).filter((c) =>
          /min-width|max-width/.test(c),
        );
        expect(widthQueries).toEqual([]);
      }
    });

    it("does not scale the surface with a transform instead of laying it out", () => {
      const offenders = SOURCES.filter((f) =>
        /zoom:\s*[\d.]|transform:\s*scale\(\s*0?\.\d/.test(code(f)),
      ).map(rel);
      expect(offenders).toEqual([]);
    });
  });
});

describe("builder-responsive-single-viewport-source", () => {
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
});

describe("builder-runs-responsive-source", () => {
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
      // Non-vacuity: the JSON viewer IS a <pre>; if it stops being one, this
      // rule must fail loudly instead of passing against an empty match.
      expect(preTag).not.toBe("");
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
});

describe("data-surfaces-responsive-source", () => {
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
      // Non-vacuity: an absent container must fail here, not green four negatives.
      expect(tag).not.toBe("");
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
});

describe("marketing-responsive-source", () => {
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
      // Non-vacuity: the declared scroller must EXIST for its un-annotation to
      // mean anything — a removed scroller previously passed on "".
      expect(scrollerTag).not.toBe("");
      expect(scrollerTag).not.toContain("data-no-pan-below");
    });

    it("names what every legibility floor protects", () => {
      // Non-vacuity: marketing declares at least one floor today; if every floor
      // vanishes this rule must say so instead of passing over an empty match.
      const floors = SOURCES.flatMap(
        (f) => readFileSync(f, "utf8").match(/<[a-zA-Z]+[^>]*data-legible-min[^>]*>/g) ?? [],
      );
      expect(floors.length).toBeGreaterThan(0);
      for (const tag of floors) {
        expect(tag).toContain("data-legible-what");
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
});

describe("team-responsive-source", () => {
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
      // Non-vacuity: an absent container must fail here, not green four negatives.
      expect(tag).not.toBe("");
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
});

describe("responsive-control-presence", () => {
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
});
