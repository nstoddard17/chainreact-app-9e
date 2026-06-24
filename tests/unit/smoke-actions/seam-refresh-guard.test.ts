/**
 * @jest-environment node
 *
 * Guard: smoke-only discovery / read-back seams must call provider HTTP wrappers
 * through `refreshAndRetry` — NEVER a raw `decryptToken(...)` + direct wrapper call.
 *
 * Why this exists (SMOKE-WRITE-11 -> 12 bug): the Airtable text-field discovery and
 * record read-back seams called the raw API wrappers directly. Airtable OAuth tokens
 * are short-lived, so on a stale token they 401'd and the harness FALSELY reported
 * BLOCKED_ENV even though the engine path (which uses refreshAndRetry) was healthy.
 * The fix routes every seam read through refreshAndRetry, exactly like the action
 * handlers + option resolvers. This test locks that in: a new raw seam (the same
 * mistake) fails CI instead of silently misreporting a refreshable provider.
 *
 * Source-level guard (reads the files as text) so it never imports the server-only
 * `writeHarnessDeps` module graph (enqueueRun / supabase / engine). Scans the thin
 * composition file AND every focused seam module under `writeHarnessDeps/` (the
 * provider readers/discovery were split out of the single file in SMOKE-HARNESS-SPLIT).
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const SMOKE_DIR = resolve(__dirname, "../../smoke-actions");
const DEPS_DIR = resolve(SMOKE_DIR, "writeHarnessDeps");

/** The thin composer + every focused seam module that may call a provider wrapper. */
const SEAM_FILES: readonly string[] = [
  resolve(SMOKE_DIR, "writeHarnessDeps.ts"),
  ...readdirSync(DEPS_DIR)
    .filter((f) => f.endsWith(".ts"))
    .map((f) => resolve(DEPS_DIR, f)),
];

/** Provider HTTP read wrappers a seam may call — each MUST be inside refreshAndRetry. */
const PROVIDER_READ_WRAPPERS = [
  "cardsGet",
  "cardsListComments",
  "recordsList",
  "recordsGet",
  "basesGetSchema",
  "notionSearch",
  "filesGetMetadata",
  "driveItemsGet",
  "googleEventsGet",
  "outlookEventsGet",
] as const;

interface SeamSource {
  readonly path: string;
  readonly name: string;
  readonly source: string;
  readonly lines: string[];
}

const SEAMS: readonly SeamSource[] = SEAM_FILES.map((path) => {
  const source = readFileSync(path, "utf8");
  return { path, name: path.split(/[\\/]/).slice(-2).join("/"), source, lines: source.split(/\r?\n/) };
});

describe("write-harness smoke seams use refreshAndRetry (no raw token reads)", () => {
  it("scans the composer + the focused seam modules", () => {
    // Sanity: the split modules exist + are being scanned (so a future move can't
    // silently drop a file out of guard coverage).
    expect(SEAMS.length).toBeGreaterThanOrEqual(7);
    const names = SEAMS.map((s) => s.name);
    for (const expected of [
      "smoke-actions/writeHarnessDeps.ts",
      "writeHarnessDeps/airtable.ts",
      "writeHarnessDeps/trello.ts",
      "writeHarnessDeps/notion.ts",
      "writeHarnessDeps/fileProviders.ts",
      "writeHarnessDeps/calendars.ts",
    ]) {
      expect(names).toContain(expected);
    }
  });

  it("never decrypts a token directly — every provider read goes through refreshAndRetry", () => {
    // refreshAndRetry decrypts internally; a `decryptToken(` in a seam file means
    // someone hand-rolled a raw provider call that bypasses the refresh path.
    const offenders: string[] = [];
    for (const seam of SEAMS) {
      seam.lines.forEach((l, i) => {
        // Code lines only — a comment that documents the banned pattern (e.g.
        // "NEVER a raw decryptToken(...)") is not a real call.
        const t = l.trim();
        if (t.startsWith("*") || t.startsWith("//") || t.startsWith("/*")) return;
        if (/\bdecryptToken\s*\(/.test(l)) offenders.push(`${seam.name} L${i + 1}: ${l.trim()}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it("imports + uses refreshAndRetry for the seam reads", () => {
    const combined = SEAMS.map((s) => s.source).join("\n");
    expect(combined).toMatch(/import\s*\{\s*refreshAndRetry\s*\}/);
    // At least one refreshAndRetry per refreshable/handler-wrapped provider seam.
    const count = (combined.match(/refreshAndRetry\s*\(/g) ?? []).length;
    expect(count).toBeGreaterThanOrEqual(3);
  });

  it("calls each provider read wrapper only inside a refreshAndRetry apiCall lambda", () => {
    // Heuristic: a wrapper call must sit on a line that contains `apiCall:` OR whose
    // nearest preceding non-blank line contains `apiCall:` (handles same-line and
    // wrapped-arrow formatting). Resolver `.resolve(...)` discovery seams are exempt
    // — they delegate to option resolvers that already wrap in refreshAndRetry.
    const violations: string[] = [];
    for (const seam of SEAMS) {
      for (const wrapper of PROVIDER_READ_WRAPPERS) {
        const callRe = new RegExp(`(^|[^.\\w])${wrapper}\\s*\\(`);
        seam.lines.forEach((line, idx) => {
          if (/^\s*import\b/.test(line)) return;
          if (!callRe.test(line)) return;
          if (/apiCall\s*:/.test(line)) return; // same-line arrow
          // look back to the nearest non-blank, non-comment line
          for (let j = idx - 1; j >= 0; j--) {
            const prev = seam.lines[j]!.trim();
            if (prev === "" || prev.startsWith("//") || prev.startsWith("*")) continue;
            if (/apiCall\s*:/.test(prev)) return; // wrapped arrow: apiCall: (t) =>\n  wrapper({
            break;
          }
          violations.push(`${seam.name} L${idx + 1} (${wrapper}): ${line.trim()}`);
        });
      }
    }
    expect(violations).toEqual([]);
  });
});
