/** @jest-environment node */
/**
 * Phase A-1 verification advisory tools.
 *
 * Business rule: `suggest_verification_for_changed_files` RECOMMENDS checks; it
 * never executes one, pushes, or mutates anything. The recommendation mapping is
 * a pure function of changed paths, and caller-supplied paths are treated as
 * inert strings (never interpolated into a shell). `list_available_npm_checks`
 * is inventory-only and must cover every allowlisted script.
 */
import { ALLOWED_NPM_SCRIPTS } from "@/scripts/mcp/config";
import { commandTools, listAvailableNpmChecks } from "@/scripts/mcp/tools/commands";
import { recommendChecksForPaths, verifyTools } from "@/scripts/mcp/tools/verify";

const checks = (paths: string[]): string[] =>
  recommendChecksForPaths(paths).map((r) => r.check);

describe("recommendChecksForPaths (pure mapping)", () => {
  it("recommends typecheck + lint + structure for a TS source change", () => {
    const c = checks(["services/diagnostics/runReport.ts"]);
    expect(c).toEqual(
      expect.arrayContaining(["npm run typecheck", "npm run lint", "npm run lint:structure"]),
    );
  });

  it("recommends the route authorization test for an app/api route change", () => {
    const c = checks(["app/api/internal/diagnostics/run-failure/route.ts"]);
    expect(c).toEqual(
      expect.arrayContaining(["npm test tests/structure/api-route-authorization.test.ts"]),
    );
  });

  it("recommends the discovery-meta gate for integration metadata changes", () => {
    expect(checks(["integrations/slack/manifest.ts"])).toEqual(
      expect.arrayContaining(["npm test tests/structure/discovery-meta-coverage.test.ts"]),
    );
  });

  it("recommends the migration lint (read-only) for migration changes", () => {
    expect(checks(["supabase/migrations/20260101_x.sql"])).toEqual(
      expect.arrayContaining(["npm run lint:migrations"]),
    );
  });

  it("recommends the MCP smoke + unit suite for scripts/mcp changes", () => {
    expect(checks(["scripts/mcp/tools/repoNav.ts"])).toEqual(
      expect.arrayContaining(["npm run mcp:smoke", "npm test tests/unit/mcp"]),
    );
  });

  it("returns nothing for no changed files", () => {
    expect(recommendChecksForPaths([])).toEqual([]);
  });

  it("treats caller paths as inert strings — no shell interpolation, no throw", () => {
    // A path crafted to look like a shell injection is just a string here; it is
    // never passed to a process. A `.ts` suffix still maps to typecheck.
    const c = checks(['"; rm -rf / #.ts']);
    expect(c).toContain("npm run typecheck");
  });

  it("recommendations are advisory data, not executed (pure, repeatable)", () => {
    const a = recommendChecksForPaths(["app/x.ts"]);
    const b = recommendChecksForPaths(["app/x.ts"]);
    expect(a).toEqual(b);
  });
});

describe("suggest_verification_for_changed_files handler (explicit paths)", () => {
  const handler = () => {
    const t = verifyTools.find((x) => x.name === "suggest_verification_for_changed_files");
    if (!t) throw new Error("tool not found");
    return t.handler;
  };

  it("uses provided paths without invoking git and lists recommendations", () => {
    const out = handler()({ paths: ["app/api/x/route.ts"] }) as string;
    expect(out).toContain("provided paths");
    expect(out).toContain("api-route-authorization.test.ts");
    expect(out).toMatch(/does NOT run them/);
  });

  it("reports nothing-to-do for an empty provided list", () => {
    const out = handler()({ paths: [] }) as string;
    expect(out).toMatch(/No changed files/);
  });
});

describe("list_available_npm_checks", () => {
  it("describes every allowlisted script and states the no-mutation boundary", () => {
    const out = listAvailableNpmChecks();
    for (const key of Object.keys(ALLOWED_NPM_SCRIPTS)) {
      expect(out).toContain(key);
    }
    expect(out).toMatch(/no db:push/i);
    expect(out).toMatch(/read-only/i);
  });

  it("is registered as an inventory-only command tool", () => {
    const names = commandTools.map((t) => t.name);
    expect(names).toContain("list_available_npm_checks");
  });
});
