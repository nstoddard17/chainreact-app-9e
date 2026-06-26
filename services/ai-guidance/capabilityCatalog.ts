/**
 * Public capability catalog for the guidance prompt (HERMES-AGENT-WORKFLOW-EDITOR-LIVE).
 *
 * Returns the de-duplicated, sorted list of `provider:type` capability KEYS the editor model may propose
 * from. Pure registry data — public capability identities, NOT user data, secrets, or ids. Used to keep
 * a model-proposed EDIT grounded in real capabilities (ChainReact still rejects anything off-catalog at
 * `validateWorkflowPatch`, so this is reliability, not a trust boundary).
 */

import { listAllActionMetas, listAllTriggerMetas } from "@/services/discovery/_registry";

let cached: readonly string[] | null = null;

/** All trigger + action capability keys (`provider:type`), sorted, de-duplicated. Memoized. */
export function buildCapabilityCatalogKeys(): readonly string[] {
  if (cached) return cached;
  const keys = new Set<string>();
  for (const m of listAllTriggerMetas()) keys.add(m.key);
  for (const m of listAllActionMetas()) keys.add(m.key);
  cached = [...keys].sort();
  return cached;
}
