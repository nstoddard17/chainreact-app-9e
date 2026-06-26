/**
 * Human-readable summary of a proposed workflow edit (HERMES-AGENT-WORKFLOW-EDITOR).
 *
 * After a model patch validates into a candidate definition, the rail must show a PLAIN-LANGUAGE summary
 * of the change — never the model's raw prose (which can leak JSON or contradict the proposal) and never
 * the machine operation counts. This pure helper diffs the prior draft against the proposed definition
 * and produces one safe sentence using only public CATALOG display names. No ids, refs, config values,
 * secrets, or raw operations.
 */

import type { WorkflowDefinition, WorkflowNode } from "@/contracts/workflowDefinition";
import { getActionMeta, getTriggerMeta } from "@/services/discovery/_registry";

const APPLY_HINT = "Review the preview below, then choose Apply preview if it looks right.";

/** Title-case a provider id for display: `microsoft-outlook` → "Microsoft Outlook", `gmail` → "Gmail". */
function providerTitle(provider: string): string {
  return provider
    .split(/[-_]/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

/** A safe friendly label for a node: "<Provider> <catalog display name>" (falls back to provider/type). */
function friendlyNode(node: WorkflowNode): string {
  const key = `${node.provider}:${node.type}`;
  const meta = node.kind === "trigger" ? getTriggerMeta(key) : getActionMeta(key);
  const name = meta?.displayName ?? node.type;
  return `${providerTitle(node.provider)} ${name}`.trim();
}

function joinList(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

/**
 * One safe sentence describing the proposed change + the Apply hint. Deterministic; no model text.
 */
export function summarizeProposedEdit(prior: WorkflowDefinition, proposed: WorkflowDefinition): string {
  return `I'll ${describeProposedEditChange(prior, proposed)}. ${APPLY_HINT}`;
}

/**
 * The bare CHANGE CLAUSE only (no "I'll", no Apply hint, no trailing period) — e.g.
 * "replace the Slack Send Channel Message step with a Gmail Send Email step". Used for the rail's
 * human "Proposed change:" line and the preview/plan summary so neither ever shows machine op counts.
 * Deterministic; catalog display names only.
 */
export function describeProposedEditChange(prior: WorkflowDefinition, proposed: WorkflowDefinition): string {
  const priorById = new Map(prior.nodes.map((n) => [n.id, n]));
  const proposedById = new Map(proposed.nodes.map((n) => [n.id, n]));

  const priorTrigger = prior.nodes.find((n) => n.kind === "trigger");
  const proposedTrigger = proposed.nodes.find((n) => n.kind === "trigger");
  const triggerChanged =
    !!priorTrigger &&
    !!proposedTrigger &&
    `${priorTrigger.provider}:${priorTrigger.type}` !== `${proposedTrigger.provider}:${proposedTrigger.type}`;

  // Added / removed ACTIONS (triggers handled separately so a trigger swap reads as "change the trigger").
  const removedActions = prior.nodes.filter((n) => n.kind !== "trigger" && !proposedById.has(n.id));
  const addedActions = proposed.nodes.filter((n) => n.kind !== "trigger" && !priorById.has(n.id));
  const reconfigured = proposed.nodes.filter((n) => {
    const p = priorById.get(n.id);
    return p && p.provider === n.provider && p.type === n.type && JSON.stringify(p.config) !== JSON.stringify(n.config);
  });

  const parts: string[] = [];

  // A clean 1:1 action swap reads best as a replacement.
  if (removedActions.length === 1 && addedActions.length === 1) {
    parts.push(`replace the ${friendlyNode(removedActions[0]!)} step with a ${friendlyNode(addedActions[0]!)} step`);
  } else {
    if (addedActions.length) parts.push(`add a ${joinList(addedActions.map(friendlyNode))} step`);
    if (removedActions.length) parts.push(`remove the ${joinList(removedActions.map(friendlyNode))} step`);
  }

  if (triggerChanged && proposedTrigger) parts.push(`change the trigger to ${friendlyNode(proposedTrigger)}`);

  // Only mention a reconfiguration when nothing structural changed (otherwise it's noise).
  if (parts.length === 0 && reconfigured.length) {
    parts.push(`update the ${joinList(reconfigured.map(friendlyNode))} settings`);
  }

  return parts.length ? joinList(parts) : "update your workflow";
}
