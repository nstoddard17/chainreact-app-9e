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
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

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
