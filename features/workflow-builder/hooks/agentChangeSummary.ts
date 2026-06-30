import type { ConfigDiff } from "@/core/workflows/buildConfigDiff";

/**
 * AGENT-CHANGE-HISTORY-1 — pure derivation of the VALUE-FREE change summary
 * (counts + a structural title) recorded on an agent-change history item.
 *
 * It reads ONLY the structural shape of the config diff (per-node status +
 * field-change/missing-required COUNTS) — never any config value, before/after,
 * or secret. So the result is safe to persist + display. Pure: no React, no I/O.
 */

export interface AgentChangeCounts {
  readonly addedNodeCount: number;
  readonly removedNodeCount: number;
  readonly changedNodeCount: number;
  /** Config fields touched (added + changed + removed) across all diffed nodes. */
  readonly changedConfigCount: number;
  /** Required fields still empty on added/changed nodes. */
  readonly setupIssueCount: number;
}

export const EMPTY_AGENT_CHANGE_COUNTS: AgentChangeCounts = {
  addedNodeCount: 0,
  removedNodeCount: 0,
  changedNodeCount: 0,
  changedConfigCount: 0,
  setupIssueCount: 0,
};

/** Count nodes/fields by structural status. Null diff (additive/new-workflow path) → zeros. */
export function summarizeConfigDiff(diff: ConfigDiff | null): AgentChangeCounts {
  if (!diff) return EMPTY_AGENT_CHANGE_COUNTS;
  let added = 0;
  let removed = 0;
  let changed = 0;
  let configFields = 0;
  let setupIssues = 0;
  for (const node of diff.nodes) {
    if (node.status === "added") added += 1;
    else if (node.status === "removed") removed += 1;
    else if (node.status === "changed") changed += 1;
    configFields +=
      node.addedFields.length + node.changedFields.length + node.removedFields.length;
    setupIssues += node.missingRequiredFields.length;
  }
  return {
    addedNodeCount: added,
    removedNodeCount: removed,
    changedNodeCount: changed,
    changedConfigCount: configFields,
    setupIssueCount: setupIssues,
  };
}

/** A short, value-free structural label, e.g. "1 node added, 1 node removed". Null when nothing notable. */
export function buildAgentChangeTitle(counts: AgentChangeCounts): string | null {
  const parts: string[] = [];
  if (counts.addedNodeCount > 0) {
    parts.push(`${counts.addedNodeCount} node${counts.addedNodeCount === 1 ? "" : "s"} added`);
  }
  if (counts.removedNodeCount > 0) {
    parts.push(`${counts.removedNodeCount} node${counts.removedNodeCount === 1 ? "" : "s"} removed`);
  }
  if (counts.changedNodeCount > 0) {
    parts.push(`${counts.changedNodeCount} node${counts.changedNodeCount === 1 ? "" : "s"} changed`);
  }
  if (parts.length > 0) return parts.join(", ");
  if (counts.changedConfigCount > 0) return "Configuration updated";
  return null;
}
