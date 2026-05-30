import { readFileSync } from "node:fs";
const src = readFileSync(
  "integrations/discord/triggers/newMessage/normalize.ts",
  "utf8",
);

const idx = src.indexOf("return {");
const start = src.indexOf("{", idx);
let depth = 0;
let i = start;
let inString = null;
while (i < src.length) {
  const ch = src[i];
  if (inString) {
    if (ch === "\\") {
      i += 2;
      continue;
    }
    if (ch === inString) inString = null;
    i++;
    continue;
  }
  if (ch === '"' || ch === "'" || ch === "`") {
    inString = ch;
    i++;
    continue;
  }
  if (ch === "/" && src[i + 1] === "/") {
    const eol = src.indexOf("\n", i);
    i = eol === -1 ? src.length : eol;
    continue;
  }
  if (ch === "{") depth++;
  else if (ch === "}") {
    depth--;
    if (depth === 0) {
      console.log("end at", i);
      break;
    }
  }
  i++;
}
const inner = src.slice(start, i + 1);
console.log("--- inner length:", inner.length);
console.log(inner.slice(0, 600));
console.log("--- fingerprint tests:");
console.log("provider:", /\bprovider\b/.test(inner));
console.log("eventType:", /\beventType\b/.test(inner));
console.log("eventId:", /\beventId\b/.test(inner));
console.log("occurredAt:", /\boccurredAt\b/.test(inner));
console.log("accountId:", /\baccountId\b/.test(inner));
console.log("payload:", /\bpayload\b/.test(inner));
