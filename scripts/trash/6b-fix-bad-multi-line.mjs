#!/usr/bin/env node
/**
 * Slice 4.ACCOUNT-MODEL-6b — fix bad multi-line trigger insertions.
 *
 * The polling-context-fix script inserted
 *   `      accountId: "acct-test",`
 * IMMEDIATELY after a `      trigger: makeTrigger({` line, placing the
 * insert INSIDE makeTrigger's argument literal. Move the insertion to
 * AFTER the matching `}),` so it lands as a sibling of `trigger`.
 *
 * Algorithm:
 *   - Find each adjacent pair `      trigger: makeTrigger({\n      accountId: "acct-test",`
 *   - Remove the bad accountId line.
 *   - Track brace depth from the `({` of `makeTrigger(`. When depth returns to 0 (the matching `})`), insert the accountId line on the NEXT line.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILES = [
  "tests/unit/integrations/discord/triggers/slashCommand/deactivate.test.ts",
  "tests/unit/integrations/mailchimp/triggers/segmentUpdated/segmentUpdated.test.ts",
  "tests/unit/integrations/microsoft-onenote/triggers/updatedNote/poll.test.ts",
];

let changed = 0;
for (const rel of FILES) {
  const file = resolve(process.cwd(), rel);
  const src = readFileSync(file, "utf8");
  const lines = src.split("\n");
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    out.push(line);
    // Look for `<ind>trigger: makeTrigger({` followed by `<ind>accountId: "acct-test",`
    const m = line.match(/^(\s+)trigger:\s*makeTrigger\(\{\s*$/);
    if (m && i + 1 < lines.length) {
      const ind = m[1];
      const next = lines[i + 1];
      if (next === `${ind}accountId: "acct-test",`) {
        // Skip emitting the bad line — we'll re-add it after the matching `}).`.
        i++; // skip lines[i+1]
        // Now walk to find the matching closing `})`. Track depth starting at 1.
        let depth = 1;
        let j = i + 1;
        while (j < lines.length && depth > 0) {
          for (const ch of lines[j]) {
            if (ch === "{") depth++;
            else if (ch === "}") depth--;
            if (depth === 0) break;
          }
          out.push(lines[j]);
          if (depth === 0) {
            // Insert accountId AFTER this line.
            out.push(`${ind}accountId: "acct-test",`);
          }
          j++;
        }
        i = j - 1;
      }
    }
  }
  const joined = out.join("\n");
  if (joined !== src) {
    writeFileSync(file, joined);
    changed++;
  }
}
console.log(`Fix multi-line broken insertion complete: ${changed} files corrected.`);
