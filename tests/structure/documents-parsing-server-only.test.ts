/**
 * Structure boundary test: the document parsing layer is server-only.
 *
 * `services/documents/parsing/*` pulls parser libraries (unpdf/pdfjs,
 * mammoth, exceljs, papaparse) that must never reach a client bundle.
 * Client-side layers (features/, components/, stores/, lib/) may not
 * import it; app/ route handlers (server) and services/ may.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const CLIENT_GROUPS = ["features", "components", "stores", "lib"];
const FORBIDDEN_IMPORT = /from\s+['"]@\/services\/documents\/parsing(?:\/|['"])/;

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

describe("services/documents/parsing server-only boundary", () => {
  it("no client-side layer imports the parsing services", () => {
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

  it("the parsing folder exists (guard is not vacuous)", () => {
    expect(() =>
      statSync(join(ROOT, "services/documents/parsing/parseDocument.ts")),
    ).not.toThrow();
  });
});
