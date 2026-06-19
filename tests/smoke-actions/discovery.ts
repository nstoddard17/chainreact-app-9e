/**
 * Action smoke harness — discovery adapter over the REAL registry.
 *
 * Single source of truth: the executable surface is whatever
 * `listRegisteredHandlers()` reports from
 * services/execution/handlers/_registry.ts. The harness does NOT maintain its
 * own action list — it reads the same registry the engine dispatches through.
 * (The offline CLI reads the inventory FILE as text; a parity test asserts the
 * two agree.)
 */
import { listRegisteredHandlers } from "@/services/execution/handlers/_registry";
import { getActionMeta } from "@/services/discovery/_registry";
import type { RegisteredAction } from "@/scripts/chainreact/smoke/core";

/** Every registered executable action as { provider, action }. */
export function listRegisteredActions(): RegisteredAction[] {
  return listRegisteredHandlers().map((h) => ({ provider: h.provider, action: h.type }));
}

export function registeredActionKeys(): Set<string> {
  return new Set(listRegisteredActions().map((a) => `${a.provider}:${a.action}`));
}

/** Friendly display name for an action (from discovery meta), or the raw key. */
export function actionDisplayName(provider: string, action: string): string {
  return getActionMeta(`${provider}:${action}`)?.displayName ?? `${provider}:${action}`;
}
