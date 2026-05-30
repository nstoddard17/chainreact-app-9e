import { readFileSync } from "node:fs";

const src = readFileSync(
  "integrations/discord/triggers/newMessage/normalize.ts",
  "utf8",
);

// Find all `accountId:` keys.
const re = /\baccountId:/g;
const keys = [];
let mm;
while ((mm = re.exec(src)) !== null) keys.push(mm.index);
console.log("accountId: positions:", keys);

for (const idx of keys) {
  console.log(`\nKey at idx ${idx} —`);
  console.log("  context:", JSON.stringify(src.slice(idx - 20, idx + 20)));
  // Walk backward
  let depth = 0;
  let i = idx - 1;
  let enclosingStart = -1;
  while (i >= 0) {
    const ch = src[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      i--;
      while (i >= 0) {
        if (src[i] === quote && src[i - 1] !== "\\") break;
        i--;
      }
      i--;
      continue;
    }
    if (ch === "}") {
      depth++;
      i--;
      continue;
    }
    if (ch === "{") {
      if (depth === 0) {
        enclosingStart = i;
        break;
      }
      depth--;
      i--;
      continue;
    }
    i--;
  }
  console.log("  enclosingStart:", enclosingStart);
  if (enclosingStart !== -1) {
    // Forward match
    let depth2 = 0;
    let j = enclosingStart;
    while (j < src.length) {
      const ch = src[j];
      if (ch === '"' || ch === "'" || ch === "`") {
        const quote = ch;
        j++;
        while (j < src.length) {
          if (src[j] === "\\") {
            j += 2;
            continue;
          }
          if (src[j] === quote) {
            j++;
            break;
          }
          j++;
        }
        continue;
      }
      if (ch === "/" && src[j + 1] === "/") {
        const eol = src.indexOf("\n", j);
        j = eol === -1 ? src.length : eol;
        continue;
      }
      if (ch === "{") depth2++;
      else if (ch === "}") {
        depth2--;
        if (depth2 === 0) break;
      }
      j++;
    }
    const literal = src.slice(enclosingStart, j + 1);
    console.log("  literal len:", literal.length);
    console.log("  fingerprints:");
    console.log("    provider:", /\bprovider\b/.test(literal));
    console.log("    eventType:", /\beventType\b/.test(literal));
    console.log("    eventId:", /\beventId\b/.test(literal));
    console.log("    occurredAt:", /\boccurredAt\b/.test(literal));
    console.log("    payload:", /\bpayload\b/.test(literal));
    console.log("  first 200:", literal.slice(0, 200));
  }
}
