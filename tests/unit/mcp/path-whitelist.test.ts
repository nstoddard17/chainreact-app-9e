/**
 * Protects the internal MCP server's whitelist-first file guard.
 *
 * Business rule (docs/rules + task brief): the dev MCP server must only reach
 * curated docs / manifests, must reject path traversal, and must refuse
 * secret-bearing filenames (.env, *.key, service-role, …). A regression here
 * would let an AI host read files outside the curated, secret-free surface.
 */
import {
  isBlockedName,
  PathNotAllowedError,
  resolveAllowedPath,
} from "@/scripts/mcp/security/paths";

describe("internal MCP path whitelist", () => {
  it("resolves a whitelisted rule doc to an absolute path under the repo", () => {
    const abs = resolveAllowedPath("docs/rules/provider-registry.md", ["docs"]);
    expect(abs).toContain("provider-registry.md");
    expect(abs.split(/[\\/]/)).toContain("docs");
  });

  it("rejects parent-directory traversal that escapes the repo root", () => {
    expect(() =>
      resolveAllowedPath("../../../etc/passwd", ["docs"]),
    ).toThrow(PathNotAllowedError);
  });

  it("rejects a path that normalizes out of the allowed doc root", () => {
    // docs/../package.json stays inside the repo but leaves the docs whitelist.
    expect(() => resolveAllowedPath("docs/../package.json", ["docs"])).toThrow(
      PathNotAllowedError,
    );
  });

  it("rejects absolute paths outright", () => {
    expect(() => resolveAllowedPath("/etc/passwd", ["docs"])).toThrow(
      PathNotAllowedError,
    );
  });

  it("rejects .env files even if a caller points at the whitelist", () => {
    expect(() => resolveAllowedPath(".env", ["docs"])).toThrow(
      PathNotAllowedError,
    );
    expect(() => resolveAllowedPath("docs/app.env", ["docs"])).toThrow(
      PathNotAllowedError,
    );
  });

  it("rejects secret-bearing filenames inside an allowed root", () => {
    expect(() =>
      resolveAllowedPath("docs/my-service-role.md", ["docs"]),
    ).toThrow(PathNotAllowedError);
    expect(() => resolveAllowedPath("docs/api.key", ["docs"])).toThrow(
      PathNotAllowedError,
    );
  });

  it("rejects any path that traverses a blocked directory segment", () => {
    expect(() =>
      resolveAllowedPath("docs/node_modules/leak.md", ["docs"]),
    ).toThrow(PathNotAllowedError);
  });

  it("classifies blocked vs allowed leaf names for the doc walker", () => {
    expect(isBlockedName(".env")).toBe(true);
    expect(isBlockedName("node_modules")).toBe(true);
    expect(isBlockedName("service-role.ts")).toBe(true);
    expect(isBlockedName("provider-registry.md")).toBe(false);
  });
});
