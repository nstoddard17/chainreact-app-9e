#!/usr/bin/env node
/**
 * Slice 4.ACCOUNT-MODEL-6b — test-file sweep.
 *
 * Mechanical updates for test fixtures + test bodies after the
 * IntegrationRecord shape change (userId → accountId + connectedByUserId)
 * and the TriggerEvent field rename (accountId → providerAccountId).
 *
 * Patterns rewritten (file scope: tests/**\/*.ts):
 *
 * A. TriggerEvent constructions — within object literals that look like
 *    a TriggerEvent (contain `provider:`, `eventType:`, `eventId:`,
 *    `occurredAt:`, `accountId:`, `payload:` keys, in any order),
 *    rename the `accountId:` key to `providerAccountId:`.
 *
 * B. IntegrationRecord constructions — within object literals that look
 *    like an IntegrationRecord (the fingerprint is the simultaneous
 *    presence of `accessTokenEncrypted:` + `refreshTokenEncrypted:` +
 *    `providerAccountId:`), replace the `userId: "<X>"` key with
 *    `accountId: "acct-<X>",\n  connectedByUserId: "<X>",`. Idempotent
 *    on repeat — if `accountId:` is already present, no-op.
 *
 * C. ActionHandlerInput-shaped objects passed to action handlers (also
 *    used by polling-handler context tests). Identified by the
 *    simultaneous presence of `workflowId:` + `userId:` + `runId:` +
 *    `nodeId:` + `triggerEvent:`. Insert `accountId: "<X>",` after the
 *    `userId: "<X>",` line. Idempotent.
 *
 * D. refreshAndRetry call sites in tests — same shape as the main sweep
 *    (userId → accountId, old accountId → providerAccountId).
 *
 * Out of scope:
 *   - Migration test fixtures that intentionally exercise the
 *     legacy compat-trigger path against the OLD `userId` insert
 *     signature (`tests/integration/migrations/account-id-foundation-*.test.ts`).
 *     Those tests are pre-cutover semantic checks and the sweep skips
 *     them via file-name allowlist.
 */

import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

const ROOT = process.cwd();
const TESTS_DIR = resolve(ROOT, "tests");

const SKIP_FILES = new Set([
  resolve(
    ROOT,
    "tests/integration/migrations/account-id-foundation-backfill.test.ts",
  ),
  resolve(
    ROOT,
    "tests/integration/migrations/account-id-foundation-dual-rls.test.ts",
  ),
  resolve(
    ROOT,
    "tests/integration/migrations/account-id-foundation-compat-trigger.test.ts",
  ),
]);

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full, out);
    } else if (
      (name.endsWith(".ts") || name.endsWith(".tsx")) &&
      !SKIP_FILES.has(resolve(full))
    ) {
      out.push(full);
    }
  }
  return out;
}

const files = walk(TESTS_DIR);

/**
 * Find balanced-brace object literals starting at `start` and return
 * `{ start, end }` (end = index just after the closing `}`).
 *
 * Assumes `src[start]` is `{`.
 */
function findBalancedBrace(src, start) {
  let depth = 0;
  let i = start;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      i++;
      while (i < src.length) {
        if (src[i] === "\\") {
          i += 2;
          continue;
        }
        if (src[i] === quote) {
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    if (ch === "/" && src[i + 1] === "/") {
      const eol = src.indexOf("\n", i);
      i = eol === -1 ? src.length : eol;
      continue;
    }
    if (ch === "/" && src[i + 1] === "*") {
      const close = src.indexOf("*/", i + 2);
      i = close === -1 ? src.length : close + 2;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return { start, end: i + 1 };
    }
    i++;
  }
  return null;
}

function rewriteTriggerEventLiterals(src) {
  const TRIGGER_EVENT_FINGERPRINT = /provider:\s*["']/;
  const HAS_EVENT_TYPE = /eventType:\s*["']/;
  const HAS_EVENT_ID = /eventId:\s*["']/;
  const HAS_OCCURRED_AT = /occurredAt:\s*["']/;
  const HAS_ACCOUNT_ID_KEY = /\baccountId:\s*/;

  let out = "";
  let i = 0;
  while (i < src.length) {
    if (src[i] === "{") {
      const balanced = findBalancedBrace(src, i);
      if (balanced) {
        const inner = src.slice(balanced.start, balanced.end);
        if (
          TRIGGER_EVENT_FINGERPRINT.test(inner) &&
          HAS_EVENT_TYPE.test(inner) &&
          HAS_EVENT_ID.test(inner) &&
          HAS_OCCURRED_AT.test(inner) &&
          HAS_ACCOUNT_ID_KEY.test(inner)
        ) {
          // Rewrite the `accountId:` key inside this literal to
          // `providerAccountId:`. Use a single replace on the FIRST
          // occurrence (TriggerEvent has only one `accountId:` key).
          const rewritten = inner.replace(
            /\baccountId:/,
            "providerAccountId:",
          );
          out += rewritten;
          i = balanced.end;
          continue;
        }
      }
    }
    out += src[i];
    i++;
  }
  return out;
}

function rewriteIntegrationRecordLiterals(src) {
  const INTEGRATION_FINGERPRINT = /accessTokenEncrypted:\s*["']/;
  const HAS_REFRESH = /refreshTokenEncrypted:/;
  const HAS_PROVIDER_ACCOUNT = /providerAccountId:\s*["']/;
  const HAS_USER_ID_KEY = /\buserId:\s*["']/;
  const HAS_ACCOUNT_ID_KEY = /\baccountId:\s*["']/;

  let out = "";
  let i = 0;
  while (i < src.length) {
    if (src[i] === "{") {
      const balanced = findBalancedBrace(src, i);
      if (balanced) {
        const inner = src.slice(balanced.start, balanced.end);
        if (
          INTEGRATION_FINGERPRINT.test(inner) &&
          HAS_REFRESH.test(inner) &&
          HAS_PROVIDER_ACCOUNT.test(inner) &&
          HAS_USER_ID_KEY.test(inner) &&
          !HAS_ACCOUNT_ID_KEY.test(inner)
        ) {
          // Replace `userId: "<X>"` with `accountId: "acct-<X>",
          //                              connectedByUserId: "<X>",`
          const rewritten = inner.replace(
            /([\t ]*)userId:\s*("[^"]+")(,?)/,
            (_match, ind, val, comma) =>
              `${ind}accountId: ${val.replace(/^"/, '"acct-')}${comma}\n${ind}connectedByUserId: ${val}${comma}`,
          );
          out += rewritten;
          i = balanced.end;
          continue;
        }
      }
    }
    out += src[i];
    i++;
  }
  return out;
}

function rewriteActionHandlerInputLiterals(src) {
  const HAS_WORKFLOW_ID = /\bworkflowId:\s*["']/;
  const HAS_USER_ID = /\buserId:\s*["']/;
  const HAS_RUN_ID = /\brunId:\s*["']/;
  const HAS_NODE_ID = /\bnodeId:\s*["']/;
  const HAS_TRIGGER_EVENT = /\btriggerEvent:\s*/;
  const HAS_ACCOUNT_ID = /\baccountId:\s*/;

  let out = "";
  let i = 0;
  while (i < src.length) {
    if (src[i] === "{") {
      const balanced = findBalancedBrace(src, i);
      if (balanced) {
        const inner = src.slice(balanced.start, balanced.end);
        if (
          HAS_WORKFLOW_ID.test(inner) &&
          HAS_USER_ID.test(inner) &&
          HAS_RUN_ID.test(inner) &&
          HAS_NODE_ID.test(inner) &&
          HAS_TRIGGER_EVENT.test(inner) &&
          !HAS_ACCOUNT_ID.test(inner)
        ) {
          const rewritten = inner.replace(
            /([\t ]*)userId:\s*("[^"]+")(,?)\s*\n/,
            (_match, ind, val, comma) =>
              `${ind}userId: ${val}${comma}\n${ind}accountId: ${val.replace(/^"/, '"acct-')}${comma}\n`,
          );
          out += rewritten;
          i = balanced.end;
          continue;
        }
      }
    }
    out += src[i];
    i++;
  }
  return out;
}

function rewriteRefreshAndRetryInTests(src) {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const idx = src.indexOf("refreshAndRetry(", i);
    if (idx === -1) {
      out += src.slice(i);
      break;
    }
    out += src.slice(i, idx);
    let j = idx + "refreshAndRetry(".length;
    let depth = 1;
    const startArg = j;
    while (j < src.length && depth > 0) {
      const ch = src[j];
      if (ch === "(") depth++;
      else if (ch === ")") depth--;
      else if (ch === '"' || ch === "'" || ch === "`") {
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
      j++;
    }
    const arg = src.slice(startArg, j - 1);
    let newArg = arg;
    newArg = newArg.replace(/\buserId: "([^"]+)",/g, 'accountId: "acct-$1",');
    newArg = newArg.replace(/\buserId: ([\w.]+),/g, "accountId: $1.accountId,");
    out += "refreshAndRetry(" + newArg + ")";
    i = j;
  }
  return out;
}

let changed = 0;
for (const file of files) {
  const src = readFileSync(file, "utf8");
  let out = src;
  out = rewriteTriggerEventLiterals(out);
  out = rewriteIntegrationRecordLiterals(out);
  out = rewriteActionHandlerInputLiterals(out);
  if (out !== src) {
    writeFileSync(file, out);
    changed++;
  }
}

console.log(`Test sweep complete: ${changed} files modified.`);
