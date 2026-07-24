/**
 * Structure boundary test: the AI processor layer is server-only.
 *
 * `services/ai/processor/*` reads server secrets (the gateway token) and
 * makes outbound model calls. Client-side layers (features/, components/,
 * stores/, lib/) may never import it — the builder reaches AI through
 * gated API routes only.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const CLIENT_GROUPS = ["features", "components", "stores", "lib"];
const FORBIDDEN_IMPORT = /from\s+['"]@\/services\/ai\/processor(?:\/|['"])/;

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

describe("services/ai/processor server-only boundary", () => {
  it("no client-side layer imports the AI processor", () => {
    const offenders: string[] = [];
    for (const group of CLIENT_GROUPS) {
      for (const file of collectFiles(join(ROOT, group))) {
        const src = readFileSync(file, "utf8");
        if (FORBIDDEN_IMPORT.test(src)) {
          offenders.push(file.slice(ROOT.length + 1));
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the processor folder exists (guard is not vacuous)", () => {
    expect(() =>
      statSync(join(ROOT, "services/ai/processor/executeAiAction.ts")),
    ).not.toThrow();
  });
});
