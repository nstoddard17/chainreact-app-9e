import type { ActionHandler } from "./types";
import { ALL_HANDLERS } from "./_handlerInventory";

/**
 * Action handler registry — public surface.
 *
 * The inventory of (provider, type, handler) tuples + the per-handler
 * imports lives in [`_handlerInventory.ts`](./_handlerInventory.ts) so this
 * file stays under the max-lines lint budget. The split is data-only;
 * this module owns duplicate-detection at load + the public lookup APIs
 * (`getActionHandler`, `listRegisteredHandlers`).
 *
 * Per docs/rules/provider-registry.md (same convention as the integration
 * manifest registry): explicit imports surface in PRs. Each provider's
 * action slice appends an entry to `ALL_HANDLERS` in the inventory file.
 */

const byKey: ReadonlyMap<string, ActionHandler> = (() => {
  const m = new Map<string, ActionHandler>();
  for (const entry of ALL_HANDLERS) {
    const key = `${entry.provider}:${entry.type}`;
    if (m.has(key)) {
      throw new Error(`Duplicate action handler registered for ${key}.`);
    }
    m.set(key, entry.handler);
  }
  return m;
})();

export function getActionHandler(
  provider: string,
  type: string,
): ActionHandler | undefined {
  return byKey.get(`${provider}:${type}`);
}

export function listRegisteredHandlers(): ReadonlyArray<{
  provider: string;
  type: string;
}> {
  return ALL_HANDLERS.map(({ provider, type }) => ({ provider, type }));
}
