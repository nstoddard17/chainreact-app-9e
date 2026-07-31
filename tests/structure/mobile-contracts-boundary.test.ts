/**
 * Structure boundary lock for packages/mobile-contracts
 * (MOBILE-COMPANION-M0-CONTRACTS-FOUNDATION-1).
 *
 * The package is the ONLY transport contract between the ChainReactV2 backend
 * and the separate ChainReactMobile repo, so it must be extractable and
 * mobile-safe by construction:
 *
 *   1. src imports only `zod` and its own siblings — no `@/` aliases (they do
 *      not resolve in the mobile repo), no server modules, no React/Next, no
 *      node builtins, no supabase, no parent-directory escapes;
 *   2. the barrel re-exports only package-local modules (it IS the allow-list);
 *   3. no source file references denylisted server-only concepts;
 *   4. package.json stays publish-shaped: GitHub Packages registry, zod as a
 *      peer dep, dist-only artifact files, no runtime dependencies.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const PKG = join(ROOT, "packages", "mobile-contracts");
const SRC = join(PKG, "src");

function srcFiles(): string[] {
  return readdirSync(SRC)
    .filter((name) => name.endsWith(".ts"))
    .map((name) => join(SRC, name));
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

function importSpecifiers(source: string): string[] {
  const specs: string[] = [];
  for (const match of source.matchAll(/(?:from|import)\s+["']([^"']+)["']/g)) {
    const spec = match[1];
    if (spec !== undefined) specs.push(spec);
  }
  return specs;
}

describe("packages/mobile-contracts boundary", () => {
  it("has source files (non-vacuous)", () => {
    expect(srcFiles().length).toBeGreaterThanOrEqual(10);
  });

  it("src imports only zod and package-local siblings", () => {
    const offenders: string[] = [];
    for (const file of srcFiles()) {
      const src = readFileSync(file, "utf8");
      for (const spec of importSpecifiers(src)) {
        const ok = spec === "zod" || /^\.\/[A-Za-z0-9_-]+$/.test(spec);
        if (!ok) {
          offenders.push(`${file.slice(ROOT.length + 1)} imports "${spec}"`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the barrel re-exports only package-local modules", () => {
    const barrel = readFileSync(join(SRC, "index.ts"), "utf8");
    for (const spec of importSpecifiers(barrel)) {
      expect(spec).toMatch(/^\.\/[A-Za-z0-9_-]+$/);
    }
  });

  it("no src file references server-only concepts (comment-stripped)", () => {
    const denied = [
      /process\.env/,
      /@supabase/,
      /service_role|serviceRole/,
      /getServiceRoleClient/,
      /from\s+["']react["']/,
      /from\s+["']next(?:\/|["'])/,
      /node:/,
      /["']@\//,
    ];
    const offenders: string[] = [];
    for (const file of srcFiles()) {
      const code = stripComments(readFileSync(file, "utf8"));
      for (const re of denied) {
        if (re.test(code)) {
          offenders.push(`${file.slice(ROOT.length + 1)} matches ${re}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("package.json stays publish-shaped and dependency-free", () => {
    const pkg = JSON.parse(readFileSync(join(PKG, "package.json"), "utf8")) as {
      name: string;
      version: string;
      main: string;
      types: string;
      files: string[];
      dependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
      publishConfig?: { registry?: string };
    };
    expect(pkg.name).toBe("@chainreact/mobile-contracts");
    // Pre-release until /api/mobile/v1 freezes for the first store release.
    expect(pkg.version.startsWith("0.")).toBe(true);
    expect(pkg.main).toBe("./dist/index.js");
    expect(pkg.types).toBe("./dist/index.d.ts");
    // Artifact = built output + fixtures + changelog. Sources never ship.
    expect(pkg.files).toEqual(["dist", "fixtures", "CHANGELOG.md"]);
    // zod is a PEER dep (the app owns one copy); no runtime deps at all.
    expect(pkg.dependencies).toBeUndefined();
    expect(Object.keys(pkg.peerDependencies ?? {})).toEqual(["zod"]);
    // A stray `npm publish` can never target the public registry.
    expect(pkg.publishConfig?.registry).toBe("https://npm.pkg.github.com");
  });

  it("fixtures contain no real-looking credentials or provider identifiers", () => {
    const fixturesDir = join(PKG, "fixtures", "v1");
    const collect = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? collect(join(dir, e.name)) : e.name.endsWith(".json") ? [join(dir, e.name)] : [],
      );
    const files = collect(fixturesDir);
    expect(files.length).toBeGreaterThanOrEqual(12);
    // Real Slack/Google/JWT-shaped values are banned even in negative
    // fixtures — hostile fixtures use obviously-fake FAKE-* markers instead.
    const realLooking = [/xox[a-z]-/, /ya29\./, /eyJ[A-Za-z0-9_-]{20,}/, /sk_live_/, /@gmail\.com/];
    for (const file of files) {
      const body = readFileSync(file, "utf8");
      for (const re of realLooking) {
        expect(`${file.slice(ROOT.length + 1)}: ${re}`.length > 0 && re.test(body)).toBe(false);
      }
    }
  });
});
