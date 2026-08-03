/** @jest-environment node */
/**
 * React Agent boundary — architectural import guard (REACT-AGENT-CS-1-SERVICE-BOUNDARY).
 *
 * The boundary must stay narrow + side-effect-free. This statically scans every source
 * file under `services/ai/reactAgent/` and asserts it imports/uses none of the forbidden
 * surfaces: the external MCP server, shell/process execution, arbitrary fs, the Supabase
 * service-role/admin client, or any workflow-MUTATION API. This is the durable guard that
 * keeps CS-1's "no MCP / no mutation / no DB / no shell" promise from silently regressing
 * as later slices extend the boundary.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), "services", "ai", "reactAgent");

function sourceFiles(): string[] {
  return readdirSync(DIR)
    .filter((f) => f.endsWith(".ts"))
    .map((f) => join(DIR, f));
}

/** Remove block + line comments so forbidden-CODE checks don't trip on prose that
 *  merely NAMES a forbidden surface to say the boundary avoids it. */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function readAll(): { file: string; text: string }[] {
  // Default = comment-stripped code (for forbidden-usage checks).
  return sourceFiles().map((file) => ({
    file,
    text: stripComments(readFileSync(file, "utf8")),
  }));
}

function readAllRaw(): { file: string; text: string }[] {
  return sourceFiles().map((file) => ({ file, text: readFileSync(file, "utf8") }));
}

describe("ReactAgent boundary — forbidden surfaces are absent", () => {
  it("has source files to scan", () => {
    expect(sourceFiles().length).toBeGreaterThan(0);
  });

  const forbidden: { label: string; pattern: RegExp }[] = [
    { label: "external MCP server", pattern: /scripts\/mcp/ },
    { label: "child_process / shell", pattern: /child_process|execSync|spawn\(|execa/ },
    { label: "arbitrary fs", pattern: /\b(from|require)\s*\(?\s*["']node:fs["']|["']fs["']/ },
    {
      label: "supabase service-role / admin client",
      pattern: /service[_-]?role|createServiceRoleClient|createAdminClient|SUPABASE_SERVICE_ROLE/i,
    },
    {
      label: "workflow mutation API",
      pattern:
        /saveDraftDefinition|updateWorkflow|applyWorkflowPatch|lifecycleOrchestrator|activateWorkflow|deleteWorkflow|repositories\/workflows/,
    },
    { label: "direct model client call", pattern: /openai|anthropic|createPlannerModelClient|\.chat\.completions/i },
  ];

  it.each(forbidden)("does not reference $label", ({ pattern }) => {
    for (const { file, text } of readAll()) {
      expect({ file, matched: pattern.test(text) }).toEqual({ file, matched: false });
    }
  });

  it("imports only local (relative) modules — no app-service / cross-layer imports in CS-1", () => {
    const importRe = /^\s*import\s[^;]*?from\s+["']([^"']+)["']/gm;
    for (const { file, text } of readAllRaw()) {
      let m: RegExpExecArray | null;
      while ((m = importRe.exec(text)) !== null) {
        const spec = m[1]!;
        // CS-1 boundary depends on nothing but its own local files.
        expect({ file, spec, ok: spec.startsWith(".") }).toEqual({ file, spec, ok: true });
      }
    }
  });

  // CS-5c — the audit recorder lives in the `audit/` SUBMODULE (which may import the
  // DB repository) and is NOT scanned above (only top-level boundary `.ts` files are).
  // This guard keeps the CORE boundary files import-safe: they must never import the
  // audit submodule or a DB repository directly. CS-5d injects the recorder into
  // `runAuthorizedCapability` from the gated ROUTE — the core stays DB-free.
  it("core boundary files do not import the audit submodule or any DB repository", () => {
    const importRe = /^\s*import\s[^;]*?from\s+["']([^"']+)["']/gm;
    for (const { file, text } of readAllRaw()) {
      let m: RegExpExecArray | null;
      while ((m = importRe.exec(text)) !== null) {
        const spec = m[1]!;
        const forbidden =
          spec.includes("/audit") ||
          /(^|\/)repositories\//.test(spec) ||
          spec.startsWith("@/repositories");
        expect({ file, spec, forbidden }).toEqual({ file, spec, forbidden: false });
      }
    }
  });
});
