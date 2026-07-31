/**
 * Structure guard for the guided spreadsheet configuration surface
 * (SHEETS-GUIDED-CONFIG-1).
 *
 * The guided layer's whole value is that it is a PRESENTATION of the
 * existing configuration system. Three ways that could quietly stop
 * being true, each of which this guard makes fail loudly:
 *
 *   1. A component starts fetching provider data itself, instead of
 *      going through the resolver hook → typed client → route → service
 *      path. That would bypass credential policy and the shared recovery
 *      states.
 *   2. A component branches on a provider id. The moment
 *      `if (provider === "google-sheets")` appears, adding Excel means
 *      editing shared components rather than adding a table row — the
 *      exact coupling the adapter contract exists to prevent.
 *   3. A component reaches into server code (services / repositories),
 *      which cannot run in the browser at all.
 *
 * Comments are stripped before scanning so the guard never fires on
 * prose that discusses these patterns — and so it cannot be silenced by
 * moving code into a comment.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const GUIDED_DIR = join(
  process.cwd(),
  "features",
  "workflow-builder",
  "config-modal",
  "guided",
);

const SHELL_BODY = join(
  process.cwd(),
  "features",
  "workflow-builder",
  "config-modal",
  "ConfigSetupTabBody.tsx",
);

/** Remove block and line comments plus string-literal contents. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function guidedFiles(): readonly string[] {
  return readdirSync(GUIDED_DIR).filter(
    (f) => f.endsWith(".ts") || f.endsWith(".tsx"),
  );
}

function readGuided(file: string): string {
  return stripComments(readFileSync(join(GUIDED_DIR, file), "utf8"));
}

describe("guided spreadsheet components stay presentational", () => {
  it("has files to scan (the guard cannot pass vacuously)", () => {
    expect(guidedFiles().length).toBeGreaterThan(0);
  });

  it.each(guidedFiles())("%s performs no data fetching of its own", (file) => {
    const source = readGuided(file);
    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(source).not.toMatch(/XMLHttpRequest|axios/);
    // Provider data arrives through the shared resolver hook, never a
    // hand-rolled request to the options route.
    expect(source).not.toMatch(/["'`]\/api\//);
  });

  it.each(guidedFiles())("%s imports no server-only module", (file) => {
    const source = readGuided(file);
    expect(source).not.toMatch(/from\s+["']@\/services\//);
    expect(source).not.toMatch(/from\s+["']@\/repositories\//);
    expect(source).not.toMatch(/from\s+["']@\/workflow-engine\//);
    expect(source).not.toMatch(/@supabase\//);
  });

  it.each(guidedFiles())("%s does not branch on a provider id", (file) => {
    const source = readGuided(file);
    // The registry file legitimately CONTAINS provider-scoped action keys as
    // data; what none of these files may do is compare against one.
    expect(source).not.toMatch(
      /(provider|providerId)\s*===\s*["'`][a-z0-9-]+["'`]/i,
    );
    expect(source).not.toMatch(/["'`]google-sheets["'`]\s*===/);
    // A provider-scoped conditional hidden in a ternary on the action key.
    expect(source).not.toMatch(
      /actionKey\s*===\s*["'`][a-z0-9-]+:[a-z0-9_]+["'`]/i,
    );
  });

  it("only the adapter registry hard-codes provider-scoped action keys", () => {
    const offenders = guidedFiles().filter((file) => {
      if (file === "guidedSpreadsheetAdapters.ts") return false;
      return /["'`](google-sheets|microsoft-excel|airtable):/i.test(
        readGuided(file),
      );
    });
    expect(offenders).toEqual([]);
  });
});

describe("the guided branch is a delegation, not a fork of the config panel", () => {
  it("the Setup body chooses guided-vs-generic in exactly one place", () => {
    const source = stripComments(readFileSync(SHELL_BODY, "utf8"));
    // One lookup decides it…
    const lookups = source.match(/getGuidedSpreadsheetAdapter\(/g) ?? [];
    expect(lookups).toHaveLength(1);
    // …and the generic SchemaForm setup path is still present for every
    // action that has no adapter. Losing this line would silently blank
    // the Setup tab for the whole product.
    expect(source).toMatch(/section="setup"/);
  });

  it("both paths receive the same draft, so neither can drift", () => {
    const source = stripComments(readFileSync(SHELL_BODY, "utf8"));
    const guided = source.slice(source.indexOf("<GuidedConfigLayout"));
    const generic = source.slice(source.indexOf("<SchemaForm"));
    for (const prop of ["values={values}", "errors={errors}"]) {
      expect(guided).toContain(prop);
      expect(generic).toContain(prop);
    }
    expect(guided).toContain("onChange={onChangeField}");
    expect(generic).toContain("onChange={onChangeField}");
  });

  it("the config shell no longer carries the setup body inline", () => {
    // The shell was already over the file-size cap; the guided work had to
    // shrink it rather than deepen it.
    const shell = readFileSync(
      join(
        process.cwd(),
        "features",
        "workflow-builder",
        "config-modal",
        "ConfigModalShell.tsx",
      ),
      "utf8",
    );
    expect(shell).toContain("<ConfigSetupTabBody");
    expect(shell.split("\n").length).toBeLessThan(600);
  });
});
