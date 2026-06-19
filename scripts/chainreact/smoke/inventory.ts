/**
 * Action smoke harness — OFFLINE CLI inventory adapter.
 *
 * Reads the SAME canonical sources the app uses, but as TEXT, so the operator
 * CLI stays import-free and offline (its standing charter — no app runtime, no
 * execution, no DB, no network):
 *
 *   - Registered actions come from `services/execution/handlers/_handlerInventory.ts`
 *     `ALL_HANDLERS` entries — the one true list of executable (provider, type)
 *     handlers. Parsing the inventory text (instead of importing it) mirrors the
 *     existing `actionRegistry.ts` approach and avoids dragging server-only handler
 *     modules into the CLI build. A Jest structure test
 *     (`tests/unit/smoke-actions/registry-parity`) asserts this text parse equals
 *     the real `listRegisteredHandlers()` so the two can never drift.
 *
 *   - Fixtures come from `tests/fixtures/action-smoke/<provider>/<action>.ts`. The
 *     CLI only needs the descriptor subset (provider, action, risk, requiredEnv),
 *     which it extracts with narrow regexes. The full typed fixture is consumed by
 *     the Jest execution harness.
 *
 * Pure over an injected `FsDeps` (read-only). No writes, no exec, no network.
 */
import type { FsDeps } from "../repo";
import {
  type FixtureDescriptor,
  type RegisteredAction,
  isActionRisk,
} from "./core";

export const HANDLER_INVENTORY_PATH = "services/execution/handlers/_handlerInventory.ts";
export const FIXTURES_ROOT = "tests/fixtures/action-smoke";

/**
 * Parse `{ provider: "x", type: "y", handler: z }` entries from the handler
 * inventory text. The `[\s\S]*?` between fields tolerates the multi-line entries
 * (e.g. create_spreadsheet) without over-matching, because it is bounded by the
 * required `type:` token. Returns [] when the text is empty/unreadable.
 */
export function parseRegisteredActions(inventoryText: string): RegisteredAction[] {
  if (!inventoryText.trim()) return [];
  const re = /provider:\s*"([a-z0-9][a-z0-9-]*)"\s*,\s*type:\s*"([a-z0-9_]+)"\s*,\s*handler:/g;
  const out: RegisteredAction[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(inventoryText)) !== null) {
    out.push({ provider: m[1] as string, action: m[2] as string });
  }
  return out;
}

/** Read + parse the registered actions via `fs`. */
export function readRegisteredActions(fs: FsDeps): RegisteredAction[] {
  return parseRegisteredActions(fs.readText(HANDLER_INVENTORY_PATH));
}

/**
 * Extract the descriptor fields from one fixture file's text. `risk` is required
 * and must be a valid enum (an invalid/missing risk is reported as a parse error,
 * not silently dropped, so a malformed fixture never disappears from inventory).
 */
export function parseFixtureDescriptor(
  provider: string,
  action: string,
  fixtureText: string,
): { descriptor: FixtureDescriptor } | { error: string } {
  const riskMatch = fixtureText.match(/risk:\s*"([a-z]+)"/);
  const risk = riskMatch?.[1];
  if (!risk || !isActionRisk(risk)) {
    return {
      error: `${provider}:${action}: fixture is missing a valid risk: "read"|"write"|"destructive".`,
    };
  }

  // requiredEnv: ["A", "B"] — tolerate single/double quotes + whitespace.
  const envBlock = fixtureText.match(/requiredEnv:\s*\[([^\]]*)\]/);
  const requiredEnv = envBlock
    ? [...(envBlock[1] ?? "").matchAll(/["']([^"']+)["']/g)].map((m) => m[1] as string)
    : [];

  return { descriptor: { provider, action, risk, requiredEnv } };
}

export interface FixtureScan {
  readonly descriptors: readonly FixtureDescriptor[];
  /** Parse-level problems (malformed fixtures); surfaced alongside violations. */
  readonly errors: readonly string[];
}

/**
 * Discover fixtures under `tests/fixtures/action-smoke/<provider>/<action>.ts`.
 * `<provider>` is the directory name; `<action>` is the filename without `.ts`.
 * Files starting with `_` (e.g. `_contract.ts`) and non-`.ts` files are ignored.
 */
export function scanFixtures(fs: FsDeps): FixtureScan {
  const descriptors: FixtureDescriptor[] = [];
  const errors: string[] = [];

  if (!fs.exists(FIXTURES_ROOT) || !fs.isDirectory(FIXTURES_ROOT)) {
    return { descriptors, errors };
  }

  for (const provider of fs.listDir(FIXTURES_ROOT)) {
    const providerDir = `${FIXTURES_ROOT}/${provider}`;
    if (!fs.isDirectory(providerDir)) continue;
    for (const file of fs.listDir(providerDir)) {
      if (!file.endsWith(".ts") || file.startsWith("_") || file.endsWith(".d.ts")) continue;
      const action = file.slice(0, -3);
      const text = fs.readText(`${providerDir}/${file}`);
      const parsed = parseFixtureDescriptor(provider, action, text);
      if ("error" in parsed) errors.push(parsed.error);
      else descriptors.push(parsed.descriptor);
    }
  }

  descriptors.sort((a, b) => a.provider.localeCompare(b.provider) || a.action.localeCompare(b.action));
  return { descriptors, errors };
}

// ─── --changed support ───────────────────────────────────────────────────────

const FIXTURE_PATH_RE = new RegExp(`^${FIXTURES_ROOT}/([a-z0-9-]+)/([a-z0-9_]+)\\.ts$`);
const HANDLER_PATH_RE = /^integrations\/([a-z0-9-]+)\/actions\/(?:[a-z0-9_-]+\/)*[A-Za-z0-9_]+\.ts$/;

/**
 * Map a set of changed repo-relative paths to the (provider:action) keys they
 * affect, used by `--changed` to scope the inventory to the local diff.
 *
 *   - A changed fixture file yields its exact provider:action key.
 *   - A changed handler file under integrations/<provider>/actions/ yields a
 *     provider WILDCARD (provider:*) — handler filenames don't 1:1 map to action
 *     types (camelCase file vs snake_case type), so we widen to the provider and
 *     let the caller match any of that provider's actions.
 *
 * Returns `{ keys, providers }`: exact keys plus providers to include wholesale.
 */
export function changedToScope(changedFiles: readonly string[]): {
  keys: Set<string>;
  providers: Set<string>;
} {
  const keys = new Set<string>();
  const providers = new Set<string>();
  for (const raw of changedFiles) {
    const path = raw.trim();
    const fx = path.match(FIXTURE_PATH_RE);
    if (fx) {
      keys.add(`${fx[1]}:${fx[2]}`);
      continue;
    }
    const hx = path.match(HANDLER_PATH_RE);
    if (hx) providers.add(hx[1] as string);
  }
  return { keys, providers };
}

/**
 * Build the `onlyKeys` set buildInventory consumes for `--changed`, given the
 * changed scope + the full registered list. Returns null when nothing in the
 * diff maps to an action (caller treats null as "no changed actions").
 */
export function changedOnlyKeys(
  changedFiles: readonly string[],
  registered: readonly RegisteredAction[],
): Set<string> | null {
  const { keys, providers } = changedToScope(changedFiles);
  if (keys.size === 0 && providers.size === 0) return null;
  const result = new Set<string>(keys);
  for (const r of registered) {
    if (providers.has(r.provider)) result.add(`${r.provider}:${r.action}`);
  }
  return result.size > 0 ? result : null;
}
