#!/usr/bin/env node
/**
 * Broad rename `accountId:` → `providerAccountId:` in normalize.test.ts
 * files that import `NormalizeContext` and have no `IntegrationRecord`
 * mocks (so the only `accountId:` keys present are NormalizeContext-
 * shaped).
 */
import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

const TESTS_DIR = resolve(process.cwd(), "tests");

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (name.endsWith(".ts") || name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

const files = walk(TESTS_DIR);
let changed = 0;
for (const file of files) {
  if (!file.replace(/\\/g, "/").includes("/tests/unit/integrations/")) continue;
  const src = readFileSync(file, "utf8");
  // A normalize.test.ts that lives in `triggers/<name>/normalize.test.ts`
  // OR `webhooks/normalize.test.ts` and imports a `normalize`/`normalizePayload`
  // function from a sibling normalize module is the target.
  const normFile = file.replace(/\\/g, "/");
  const isNormalizeTest = normFile.endsWith("/normalize.test.ts");
  const importsNormalize = /from\s+"[^"]+\/normalize"/.test(src);
  if (!isNormalizeTest || !importsNormalize) continue;
  const hasIntegrationMock = /\baccessTokenEncrypted\b/.test(src);
  const hasActionHandlerInput =
    /\bActionHandlerInput\b/.test(src) || /\bworkflowId:\s*"/.test(src);
  if (hasIntegrationMock || hasActionHandlerInput) continue;
  let out = src;
  out = out.replace(/\baccountId:/g, "providerAccountId:");
  if (out !== src) {
    writeFileSync(file, out);
    changed++;
  }
}
console.log(`Broad normalize-test rename complete: ${changed} files corrected.`);
