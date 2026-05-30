import type { WorkflowDefinition } from "@/contracts/workflow";

/**
 * Pure summary of a workflow definition for list/dashboard rows
 * (Slice 4.WORKFLOWS-PAGE-1).
 *
 * Reads ONLY `node.provider` and `node.kind` — NEVER `node.config` or any
 * resolved value. So it is safe to run server-side and surface its output to
 * the client: the only data that leaves is the set of distinct provider ids
 * plus trigger/action counts. No secrets, no config, no field values.
 *
 * Provider ids are returned distinct + ordered: providers used by trigger
 * nodes first (in first-seen order), then providers introduced by action
 * nodes. This keeps the "what kicks it off" provider visually first in the
 * chip stack without any provider-specific branching.
 */

export interface WorkflowDefinitionSummary {
  /** Distinct provider ids, trigger-providers first, then action-providers. */
  readonly providerIds: readonly string[];
  readonly triggerCount: number;
  readonly actionCount: number;
}

export function summarizeDefinition(
  def: WorkflowDefinition | null | undefined,
): WorkflowDefinitionSummary {
  const nodes = def?.nodes ?? [];
  let triggerCount = 0;
  let actionCount = 0;

  const triggerProviders: string[] = [];
  const actionProviders: string[] = [];
  const seen = new Set<string>();

  for (const node of nodes) {
    if (node.kind === "trigger") triggerCount += 1;
    else actionCount += 1;

    const provider = node.provider;
    if (!provider) continue;
    if (seen.has(provider)) continue;
    seen.add(provider);
    if (node.kind === "trigger") triggerProviders.push(provider);
    else actionProviders.push(provider);
  }

  return {
    providerIds: [...triggerProviders, ...actionProviders],
    triggerCount,
    actionCount,
  };
}
