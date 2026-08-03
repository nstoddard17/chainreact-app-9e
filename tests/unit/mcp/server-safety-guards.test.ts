/** @jest-environment node */
/**
 * Protects the internal MCP server's hard safety boundaries.
 *
 * Business rules (task brief + account-ownership / database-security direction):
 *   - The dev tool must NOT import any Supabase / service-role / repository /
 *     database client. It is a read-only repo/doc tool with no DB access.
 *   - The command wrappers may only run an allowlist of exact, non-mutating npm
 *     scripts — never db:push, migrations, deploy, or git.
 * A regression on either is a data-exposure or destructive-action risk.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { ALLOWED_NPM_SCRIPTS } from "@/scripts/mcp/config";

const MCP_ROOT = resolve(__dirname, "../../../scripts/mcp");

function collectTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "dist" || name === "node_modules") continue;
    const abs = join(dir, name);
    const s = statSync(abs);
    if (s.isDirectory()) out.push(...collectTsFiles(abs));
    else if (name.endsWith(".ts")) out.push(abs);
  }
  return out;
}

describe("internal MCP server safety guards", () => {
  const files = collectTsFiles(MCP_ROOT);

  it("ships multiple source files (sanity: the scan found the tree)", () => {
    expect(files.length).toBeGreaterThan(8);
  });

  it("never imports a Supabase / service-role / repository / DB client", () => {
    const forbidden = [
      "@supabase",
      "supabase-js",
      "serviceRoleClient",
      "SERVICE_ROLE",
      "repositories/",
      "createClient(",
      "pg",
    ];
    const offenders: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      // Only inspect import/require lines for module references.
      for (const line of text.split("\n")) {
        const isImport = /\b(import|require)\b/.test(line);
        for (const needle of forbidden) {
          if (needle === "SERVICE_ROLE") {
            if (line.includes(needle)) offenders.push(`${file}: ${line.trim()}`);
          } else if (isImport && line.includes(needle)) {
            offenders.push(`${file}: ${line.trim()}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("only allowlists exact, non-mutating npm scripts", () => {
    const allowed = Object.values(ALLOWED_NPM_SCRIPTS);
    // lint:migrations (Phase B) is the STATIC migration RLS lint
    // (check-migration-rls.mjs) — it reads migration files and never applies
    // them / runs db:push / connects to a DB. It is read-only like the others.
    expect(allowed.sort()).toEqual(["lint", "lint:migrations", "lint:structure", "typecheck"]);

    const banned = [
      "db:push",
      "deploy",
      "push",
      "build",
      "start",
      "dev",
      "test:e2e",
      "smoke:prod",
    ];
    for (const script of banned) {
      expect(allowed).not.toContain(script);
    }
    // No allowlisted script may be an apply/push/deploy/migration-apply variant.
    for (const script of allowed) {
      expect(script).not.toMatch(/db:push|deploy|apply|--push/i);
    }
  });

  it("exposes no generic file-read or shell-execution tool name", async () => {
    const { buildRegistry } = await import("@/scripts/mcp/tools");
    const names = buildRegistry()
      .list()
      .map((t) => t.name);
    for (const banned of ["read_file", "exec", "run_command", "make_api_call", "run_shell"]) {
      expect(names).not.toContain(banned);
    }
  });
});
