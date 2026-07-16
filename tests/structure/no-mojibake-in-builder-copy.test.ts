/**
 * @jest-environment node
 *
 * Mojibake guard for builder-visible copy.
 *
 * Why this exists: a metadata sweep edited provider `.meta.ts` copy with a
 * script that round-tripped UTF-8 through Latin-1, double-encoding every
 * typographic character. An em-dash (`—`, U+2014 = `E2 80 94`) came back as
 * `C3 A2 C2 80 C2 94` — which renders in the builder as a stray `â` followed
 * by invisible control characters. It reached production in one field
 * description before being caught by a test author reading the copy.
 *
 * The bug class is silent: TypeScript compiles, Zod validates, tests that
 * don't assert the exact substring pass, and reviewers skim past `â` in a
 * diff. So it gets a structural guard instead of vigilance.
 *
 * Scope: the whole repo's TS/TSX/MD, because the sweep that caused it touched
 * ~200 files across every provider. Cheap to run, and any hit is a real defect
 * — these byte sequences have no legitimate use in this codebase.
 */
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Double-encoded forms of the punctuation our copy actually uses. Each is the
 * UTF-8 encoding of the Latin-1 misreading of a real UTF-8 sequence.
 */
const MOJIBAKE: ReadonlyArray<{ bytes: Buffer; intended: string }> = [
  { bytes: Buffer.from([0xc3, 0xa2, 0xc2, 0x80, 0xc2, 0x94]), intended: "— (em dash)" },
  { bytes: Buffer.from([0xc3, 0xa2, 0xc2, 0x80, 0xc2, 0x93]), intended: "– (en dash)" },
  { bytes: Buffer.from([0xc3, 0xa2, 0xc2, 0x86, 0xc2, 0x92]), intended: "→ (arrow)" },
  { bytes: Buffer.from([0xc3, 0xa2, 0xc2, 0x80, 0xc2, 0x99]), intended: "’ (apostrophe)" },
  { bytes: Buffer.from([0xc3, 0xa2, 0xc2, 0x80, 0xc2, 0x9c]), intended: "“ (open quote)" },
  { bytes: Buffer.from([0xc3, 0xa2, 0xc2, 0x80, 0xc2, 0x9d]), intended: "” (close quote)" },
  { bytes: Buffer.from([0xc3, 0xa2, 0xc2, 0x80, 0xc2, 0xa6]), intended: "… (ellipsis)" },
  { bytes: Buffer.from([0xc3, 0x82, 0xc2, 0xb7]), intended: "· (middot)" },
  // The single-step variant (UTF-8 read as cp1252 once, re-encoded).
  { bytes: Buffer.from([0xc3, 0xa2, 0xe2, 0x80, 0x94]), intended: "— (em dash)" },
];

const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  ".next",
  "dist",
  "coverage",
  "playwright-report",
  "test-results",
]);
const EXTS = new Set([".ts", ".tsx", ".md"]);

function walk(dir: string, out: string[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(path.join(dir, entry.name), out);
    } else if (EXTS.has(path.extname(entry.name))) {
      out.push(path.join(dir, entry.name));
    }
  }
}

describe("no mojibake in repo text", () => {
  const repoRoot = path.resolve(__dirname, "../..");

  it("no file contains double-encoded typographic characters", () => {
    const files: string[] = [];
    walk(repoRoot, files);
    expect(files.length).toBeGreaterThan(500); // sanity: we actually walked the repo

    const offenders: string[] = [];
    for (const file of files) {
      const raw = fs.readFileSync(file);
      for (const { bytes, intended } of MOJIBAKE) {
        if (raw.includes(bytes)) {
          offenders.push(
            `${path.relative(repoRoot, file)} — corrupted ${intended}`,
          );
        }
      }
    }
    if (offenders.length > 0) {
      throw new Error(
        `${offenders.length} file(s) contain double-encoded characters (they render as a stray "â" + invisible control chars):\n` +
          offenders.map((o) => `  • ${o}`).join("\n") +
          "\n\nThis happens when a script rewrites files through a Latin-1 round-trip. " +
          "Rewrite the affected string with the real character, and make the editing " +
          "script read/write UTF-8 explicitly.",
      );
    }
    expect(offenders).toEqual([]);
  });
});
