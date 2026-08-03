/**
 * Structure boundary test: core/ may import only from contracts/.
 *
 * Per project-structure-and-module-boundaries.md §11 test #8:
 * core/ files may not import from app/, features/, components/, repositories/,
 * services/, or stores/.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const FORBIDDEN_GROUPS = [
  "app",
  "features",
  "components",
  "repositories",
  "services",
  "stores",
];

function collectFiles(dir: string): string[] {
  const out: string[] = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

describe("core/ purity", () => {
  it("no core/ file imports from app/features/components/repositories/services/stores", () => {
    const coreDir = join(ROOT, "core");
    // Fail-closed: core/ exists; a missing dir means the scan is broken, and
    // returning green would disable the purity rule entirely.
    expect(() => statSync(coreDir)).not.toThrow();
    const files = collectFiles(coreDir);
    const offenders: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      for (const group of FORBIDDEN_GROUPS) {
        const re = new RegExp(`from\\s+['"]@/${group}(?:/|['"])`);
        for (const line of src.split("\n")) {
          const match = re.exec(line);
          if (!match) continue;
          // Skip matches inside template literals on the same line —
          // core/mcpCompile/emit.ts CODE-GENERATES import statements as
          // backtick strings; those are emitted text, not real imports.
          if (line.slice(0, match.index).includes("`")) continue;
          offenders.push(`${file.slice(ROOT.length + 1)} imports @/${group}/...`);
          break;
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
