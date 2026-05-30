#!/usr/bin/env node
/**
 * Slice 4.ACCOUNT-MODEL-6b — mechanical sweep across integration handlers,
 * trigger handlers, and resolvers to convert the user-keyed integration
 * lookup signatures to the new account-keyed ones.
 *
 * Mapping summary (mechanical, scoped to call sites where these symbols
 * carry the user-keyed contract):
 *
 *   - `userId: input.userId,`        → `accountId: input.accountId,`
 *   - `userId: integration.userId,`  → `accountId: integration.accountId,`
 *   - `userId: trigger.userId,`      → `accountId: trigger.workflowAccountId!,`
 *   - `userId: ctx.userId,`          → `accountId: integration.accountId,` (resolvers always have `integration` in scope when calling refreshAndRetry)
 *   - `userId: context.trigger.userId,` → `accountId: context.accountId,` (polling handlers)
 *
 *   - `getActiveForExecution(input.userId,`        → `getActiveForExecution(input.accountId,`
 *   - `getActiveForExecution(integration.userId,`  → `getActiveForExecution(integration.accountId,`
 *   - `getActiveForExecution(trigger.userId,`      → `getActiveForExecution(trigger.workflowAccountId!,`
 *   - `getActiveForExecution(context.trigger.userId,` → `getActiveForExecution(context.accountId,`
 *
 *   - `triggerEvent.accountId`       → `triggerEvent.providerAccountId`
 *   - `input.triggerEvent.accountId` → `input.triggerEvent.providerAccountId`
 *   - `trigger.accountId`            → `trigger.providerAccountId` (TriggerResourceRecord)
 *
 *   - Inside refreshAndRetry({ … }) blocks, the old `accountId:` (which
 *     carried the provider account id) is renamed to `providerAccountId:`,
 *     and the shorthand `accountId,` is renamed to `providerAccountId,`.
 *
 * Out of scope (do NOT touch):
 *   - `services/oauth/state.ts` (V2 state has its own accountId)
 *   - `lib/auth/**`, `stores/auth*.ts`
 *   - The Zod schema field rename in contracts/triggerEvent.ts is already done.
 *   - `repositories/**` are hand-edited.
 *   - DB SQL migrations and column names.
 *
 * Idempotent: re-running produces no further changes.
 */

import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

const ROOT = process.cwd();

const INCLUDE_DIRS = ["integrations", "services/triggers", "services/cron", "app/api/webhooks", "services/options"];

const EXCLUDE_DIRS = new Set([
  "node_modules",
  ".next",
  "dist",
  ".git",
  "tests", // tests are handled separately
]);

const FILES_TO_SKIP = new Set([
  // Foundation files — already hand-edited.
  resolve(ROOT, "services/triggers/lifecycle.ts"),
  resolve(ROOT, "services/triggers/preconditions.ts"),
  resolve(ROOT, "services/triggers/pollingRegistry.ts"),
  resolve(ROOT, "services/triggers/activationRegistry.ts"),
  resolve(ROOT, "services/triggers/deactivationRegistry.ts"),
  resolve(ROOT, "services/cron/runPollingTriggers.ts"),
  resolve(ROOT, "services/options/types.ts"),
  resolve(ROOT, "services/options/_registry.ts"),
]);

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (EXCLUDE_DIRS.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full, out);
    } else if ((name.endsWith(".ts") || name.endsWith(".tsx")) && !FILES_TO_SKIP.has(resolve(full))) {
      out.push(full);
    }
  }
  return out;
}

const files = [];
for (const dir of INCLUDE_DIRS) {
  walk(resolve(ROOT, dir), files);
}

/**
 * Find refreshAndRetry({...}) blocks and rewrite their internal keys:
 *   - the existing `accountId:` (provider account) → `providerAccountId:`
 *   - the shorthand `accountId,` → `providerAccountId,`
 * Also `userId: X,` → `accountId: <Y>,` based on which X.
 */
function rewriteRefreshAndRetryBlock(src) {
  // Match each `refreshAndRetry({ ... })` block — argument is one balanced
  // object literal. We scan character by character to handle nesting.
  let out = "";
  let i = 0;
  while (i < src.length) {
    const idx = src.indexOf("refreshAndRetry(", i);
    if (idx === -1) {
      out += src.slice(i);
      break;
    }
    out += src.slice(i, idx);
    // Move past `refreshAndRetry(`
    let j = idx + "refreshAndRetry(".length;
    // Find the matching closing ).
    let depth = 1;
    const startArg = j;
    while (j < src.length && depth > 0) {
      const ch = src[j];
      if (ch === "(") depth++;
      else if (ch === ")") depth--;
      else if (ch === '"' || ch === "'" || ch === "`") {
        // Skip string literal naively (handles \-escapes; doesn't handle nested template expressions).
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
      } else if (ch === "/" && src[j + 1] === "/") {
        // line comment
        const eol = src.indexOf("\n", j);
        j = eol === -1 ? src.length : eol;
        continue;
      } else if (ch === "/" && src[j + 1] === "*") {
        const close = src.indexOf("*/", j + 2);
        j = close === -1 ? src.length : close + 2;
        continue;
      }
      j++;
    }
    const arg = src.slice(startArg, j - 1);
    // Now rewrite the arg.
    let newArg = arg;

    // userId: <expr>, → accountId: <other expr>,
    newArg = newArg.replace(
      /\buserId: input\.userId,/g,
      "accountId: input.accountId,",
    );
    newArg = newArg.replace(
      /\buserId: integration\.userId,/g,
      "accountId: integration.accountId,",
    );
    newArg = newArg.replace(
      /\buserId: ctx\.userId,/g,
      "accountId: integration.accountId,",
    );
    newArg = newArg.replace(
      /\buserId: trigger\.userId,/g,
      "accountId: trigger.workflowAccountId!,",
    );
    newArg = newArg.replace(
      /\buserId: context\.trigger\.userId,/g,
      "accountId: context.accountId,",
    );
    newArg = newArg.replace(
      /\buserId: this\.userId,/g,
      "accountId: this.accountId,",
    );

    // Now the old `accountId:` (carrying provider account) → `providerAccountId:`
    // Only do this AFTER we've inserted the new V2 `accountId:`.
    // We need to be careful to NOT rename the V2 accountId we just inserted.
    // Strategy: do a single pass that respects the line — we look for a line
    // containing `accountId:` AFTER ours. Easiest: temporarily mark V2 lines.
    newArg = newArg.replace(/accountId: input\.accountId,/g, "__V2_ACCT__: input.accountId,");
    newArg = newArg.replace(/accountId: integration\.accountId,/g, "__V2_ACCT__: integration.accountId,");
    newArg = newArg.replace(/accountId: trigger\.workflowAccountId!,/g, "__V2_ACCT__: trigger.workflowAccountId!,");
    newArg = newArg.replace(/accountId: context\.accountId,/g, "__V2_ACCT__: context.accountId,");
    newArg = newArg.replace(/accountId: this\.accountId,/g, "__V2_ACCT__: this.accountId,");

    // Any remaining `accountId:` inside the refreshAndRetry block is the
    // OLD provider-account-id key → rename to providerAccountId.
    newArg = newArg.replace(/\baccountId:/g, "providerAccountId:");
    // Shorthand `accountId,` (a local const named accountId carrying provider id)
    // → `providerAccountId,` — and the const must be renamed too (handled below
    // at the file level).
    newArg = newArg.replace(/(\W)accountId,/g, "$1providerAccountId,");

    // Now un-mark.
    newArg = newArg.replace(/__V2_ACCT__:/g, "accountId:");

    out += "refreshAndRetry(" + newArg + ")";
    i = j;
  }
  return out;
}

/**
 * Outside refreshAndRetry blocks: rewrite call sites that resolve the
 * integration directly via getActiveForExecution.
 */
function rewriteGetActiveForExecution(src) {
  return src
    .replace(/getActiveForExecution\(\s*input\.userId,/g, "getActiveForExecution(input.accountId,")
    .replace(/getActiveForExecution\(\s*integration\.userId,/g, "getActiveForExecution(integration.accountId,")
    .replace(/getActiveForExecution\(\s*trigger\.userId,/g, "getActiveForExecution(trigger.workflowAccountId!,")
    .replace(/getActiveForExecution\(\s*context\.trigger\.userId,/g, "getActiveForExecution(context.accountId,");
}

/**
 * Field renames on objects whose shape changed:
 *   - TriggerEvent.accountId → providerAccountId
 *   - TriggerResourceRecord.accountId → providerAccountId
 *
 * We can't blindly do `.accountId` → `.providerAccountId` because
 * `integration.accountId`, `workflow.accountId`, `ctx.accountId`,
 * `context.accountId`, `dispatchInfo.accountId` are all V2 owner accounts
 * (correct as-is). The safe approach:
 *   - Rename only when the prefix is a recognized TriggerEvent / Trigger
 *     row reference.
 */
function rewriteFieldAccess(src) {
  return src
    // TriggerEvent.accountId callers
    .replace(/\btriggerEvent\.accountId\b/g, "triggerEvent.providerAccountId")
    .replace(/\binput\.triggerEvent\.accountId\b/g, "input.triggerEvent.providerAccountId")
    // .event.accountId — when event is a TriggerEvent (used in some handlers' destructuring).
    // We restrict to common variable names that are TriggerEvent in the codebase audit:
    // `event` (in normalize / receive functions) and `triggerEvent`.
    // Skip `event.accountId` because too many other shapes have `event` (Stripe, GitHub, etc.).
    // The conservative rename of `triggerEvent.accountId` covers the canonical name.
    // Trigger row references
    .replace(/\btrigger\.accountId\b/g, "trigger.providerAccountId")
    // The trigger-resources shorthand inside the local helpers also picks this up;
    // safe because no other `trigger` shape exists in the typed code.
    .replace(/\bintegration\.userId\b/g, "integration.accountId");
  // integration.userId no longer exists. The most common consumer was
  // refreshAndRetry blocks already handled above; this catches stragglers
  // (e.g. logging callers that should now reference the owning account).
}

/**
 * Local-const rename: when a handler had `const accountId = ...`, we
 * renamed the corresponding `accountId,` inside the refreshAndRetry block
 * to `providerAccountId,`. The const itself also needs renaming so the
 * shorthand resolves correctly. The const is always assigned from a
 * TriggerEvent's accountId field (now providerAccountId) or from
 * `null`. We only rename the const when the file contains the rewritten
 * `providerAccountId,` shorthand reference.
 */
function rewriteAccountIdConst(src) {
  // Heuristic: if the file uses the rewritten `providerAccountId,` shorthand
  // (which we introduced), look back for a `const accountId =` line in the
  // same file and rename it (and ALL its references where it's clearly the
  // provider-account local — i.e. expressions referencing
  // `triggerEvent.providerAccountId`).
  if (!src.includes("providerAccountId,")) return src;

  // Common shape: `const accountId =\n    input.triggerEvent.provider === "X"\n      ? input.triggerEvent.providerAccountId\n      : null;`
  const constRegex =
    /(\s)const accountId =\s*\n([\s\S]*?triggerEvent\.providerAccountId[\s\S]*?);/g;
  let s = src;
  s = s.replace(constRegex, (match, ws, body) => {
    return `${ws}const providerAccountId =\n${body};`;
  });

  // Simple inline assigned from triggerEvent.providerAccountId.
  s = s.replace(
    /\bconst accountId =\s*input\.triggerEvent\.providerAccountId;/g,
    "const providerAccountId = input.triggerEvent.providerAccountId;",
  );
  return s;
}

let changedFiles = 0;
let changedLines = 0;
for (const file of files) {
  const src = readFileSync(file, "utf8");
  let out = src;

  out = rewriteRefreshAndRetryBlock(out);
  out = rewriteGetActiveForExecution(out);
  out = rewriteFieldAccess(out);
  out = rewriteAccountIdConst(out);

  if (out !== src) {
    writeFileSync(file, out);
    changedFiles++;
    const beforeLines = src.split("\n").length;
    const afterLines = out.split("\n").length;
    changedLines += Math.abs(afterLines - beforeLines) || 1;
  }
}

console.log(`Sweep complete: ${changedFiles} files modified.`);
