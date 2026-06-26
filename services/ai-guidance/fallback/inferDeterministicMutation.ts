/**
 * DEMOTED deterministic mutation fallback (HERMES-AGENT-WORKFLOW-EDITOR).
 *
 * The PRIMARY conversational editor is the model returning a general `WorkflowPatch` validated by
 * `proposeWorkflowMutation`. This is a NARROW, SECONDARY fallback used ONLY when the model returns no
 * patch: it recognizes the single common "switch the notification channel between Slack and email"
 * intent and emits GENERAL `PatchOperation`s (removeNode + addNode + re-edge) feeding the SAME pipeline
 * — it does NOT apply anything itself and adds no special-case apply path.
 *
 * It uses STABLE node ids from the current draft (never "the first Slack action") and respects
 * ambiguity: more than one matching notification step → it asks WHICH one rather than guessing. Email
 * provider is asked for when ambiguous (both Gmail + Outlook available, none connected / both connected)
 * unless the goal names one or exactly one is connected. No invented providers; the chosen capability is
 * registry-checked (the downstream `validateWorkflowPatch` re-checks everything). Pure + model-free.
 *
 * NO new one-off intent matchers belong here — broaden coverage by improving the MODEL patch path.
 */

import type { WorkflowDefinition, WorkflowNode } from "@/contracts/workflowDefinition";
import { getActionMeta } from "@/services/discovery/_registry";
import type { PatchOperation } from "@/services/workflows/patch/types";

const GMAIL_SEND = { provider: "gmail", type: "send_email" } as const;
const OUTLOOK_SEND = { provider: "microsoft-outlook", type: "send_email" } as const;
const SLACK_CHANNEL = { provider: "slack", type: "send_channel_message" } as const;
const SLACK_NOTIFY_TYPES = ["send_channel_message", "send_direct_message"];

export interface InferMutationInput {
  readonly goalText: string;
  readonly currentDraft: WorkflowDefinition;
  /** Email providers (gmail / microsoft-outlook) the caller already has connected — drives the default. */
  readonly connectedEmailProviders?: readonly string[];
}

export type MutationOpsResult =
  | { readonly kind: "ops"; readonly operations: PatchOperation[]; readonly summary: string }
  | { readonly kind: "needs_provider_choice"; readonly message: string }
  | { readonly kind: "needs_node_choice"; readonly message: string }
  | { readonly kind: "catalog_gap"; readonly message: string }
  | { readonly kind: "none" };

const EMAIL_PROVIDER_QUESTION =
  "I can switch the notification to email — should I use Gmail or Outlook? Tell me which and I'll update the preview.";

function capabilityExists(provider: string, type: string): boolean {
  return getActionMeta(`${provider}:${type}`) != null;
}

function resolveEmailTarget(goal: string, connected: readonly string[]): { provider: string; type: string } | "ask" | "none" {
  if (/\bgmail\b/.test(goal) && capabilityExists(GMAIL_SEND.provider, GMAIL_SEND.type)) return { ...GMAIL_SEND };
  if (/\b(outlook|office\s?365|microsoft)\b/.test(goal) && capabilityExists(OUTLOOK_SEND.provider, OUTLOOK_SEND.type)) return { ...OUTLOOK_SEND };
  const candidates = [GMAIL_SEND, OUTLOOK_SEND].filter((c) => capabilityExists(c.provider, c.type));
  if (candidates.length === 0) return "none";
  const connectedCandidates = candidates.filter((c) => connected.includes(c.provider));
  if (connectedCandidates.length === 1) return { ...connectedCandidates[0]! };
  if (candidates.length === 1) return { ...candidates[0]! };
  return "ask";
}

/** Build remove + add + re-edge ops that swap `target` for a new action of capability `to`, preserving wiring. */
function buildSwapOps(draft: WorkflowDefinition, target: WorkflowNode, to: { provider: string; type: string }): PatchOperation[] {
  const newId = "swap-new";
  const newNode: WorkflowNode = {
    id: newId,
    kind: "action",
    provider: to.provider,
    type: to.type,
    config: {},
    position: { ...target.position },
  };
  const ops: PatchOperation[] = [{ op: "removeNode", nodeId: target.id }, { op: "addNode", node: newNode }];
  let e = 0;
  for (const edge of draft.edges) {
    if (edge.to === target.id) ops.push({ op: "addEdge", edge: { id: `swap-e${++e}`, from: edge.from, to: newId, ...(edge.label ? { label: edge.label } : {}) } });
    if (edge.from === target.id) ops.push({ op: "addEdge", edge: { id: `swap-e${++e}`, from: newId, to: edge.to, ...(edge.label ? { label: edge.label } : {}) } });
  }
  return ops;
}

export function inferDeterministicMutationOps(input: InferMutationInput): MutationOpsResult {
  const goal = (input.goalText ?? "").trim().toLowerCase();
  const draft = input.currentDraft;
  if (goal.length === 0 || !draft || draft.nodes.length === 0) return { kind: "none" };

  const changeVerb = /\b(change|switch|swap|convert|replace|make it|turn it into|use|instead|rather than)\b/.test(goal);
  const emailIntent = /\b(e-?mail|gmail|outlook)\b/.test(goal);
  const slackIntent = /\bslack\b/.test(goal);

  // Slack notification → email.
  if (emailIntent && (changeVerb || /\bto\s+(an?\s+)?e-?mail\b/.test(goal))) {
    const slackNodes = draft.nodes.filter((n) => n.kind === "action" && n.provider === "slack" && SLACK_NOTIFY_TYPES.includes(n.type));
    if (slackNodes.length === 0) return { kind: "none" };
    if (slackNodes.length > 1) {
      return { kind: "needs_node_choice", message: "You have more than one Slack step — which one should I change to email?" };
    }
    const target = resolveEmailTarget(goal, input.connectedEmailProviders ?? []);
    if (target === "none") return { kind: "catalog_gap", message: "ChainReact doesn't have an email send action in the catalog yet, so I can't switch the notification to email here." };
    if (target === "ask") return { kind: "needs_provider_choice", message: EMAIL_PROVIDER_QUESTION };
    return { kind: "ops", operations: buildSwapOps(draft, slackNodes[0]!, target), summary: "Switch the Slack notification to email" };
  }

  // Email notification → Slack.
  if (slackIntent && changeVerb && !emailIntent) {
    const emailNodes = draft.nodes.filter((n) => n.kind === "action" && (n.provider === "gmail" || n.provider === "microsoft-outlook") && n.type === "send_email");
    if (emailNodes.length === 0) return { kind: "none" };
    if (emailNodes.length > 1) {
      return { kind: "needs_node_choice", message: "You have more than one email step — which one should I change to Slack?" };
    }
    if (!capabilityExists(SLACK_CHANNEL.provider, SLACK_CHANNEL.type)) return { kind: "catalog_gap", message: "ChainReact doesn't have a Slack channel message action in the catalog yet." };
    return { kind: "ops", operations: buildSwapOps(draft, emailNodes[0]!, { ...SLACK_CHANNEL }), summary: "Switch the email notification to Slack" };
  }

  return { kind: "none" };
}
