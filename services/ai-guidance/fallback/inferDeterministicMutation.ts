/**
 * Deterministic, catalog-validated MUTATION fallback (HERMES-AGENT-MUTATION-PREVIEW).
 *
 * When the user asks to CHANGE an existing workflow during the React Agent conversation (e.g. "change
 * it to an email notification") and the model returns prose with no plan, ChainReact can still produce
 * a valid, previewable mutation so the canvas actually changes instead of React only describing it.
 *
 * Intentionally NARROW + SAFE — NOT a planner:
 *   - Today's only mutation is a NOTIFICATION-CHANNEL SWAP between Slack and email (both directions),
 *     because both halves are fully catalog-backed and unambiguous to detect.
 *   - It NEVER invents providers/actions: the replacement capability is registry-checked
 *     (`gmail:send_email` / `microsoft-outlook:send_email` / `slack:send_channel_message`) and the whole
 *     produced plan is run through `validateWorkflowPlan`. Any miss → no plan (fail closed).
 *   - It reads `requiredInputs` field KEYS from the action's real metadata — never hardcoded.
 *   - It produces a FULL updated plan that mirrors the CURRENT draft graph with ONE action swapped; the
 *     swapped step carries `replaces` (the old capability) so `planToBuilderPatch` emits a TARGETED
 *     in-place swap (Apply replaces the old action rather than appending a second one). Other nodes,
 *     edges, and the trigger are preserved.
 *   - Email-provider policy: an explicit "gmail"/"outlook" in the goal wins; else, if exactly ONE email
 *     provider is connected, use it (safe default = already used); else (both/neither connected, with
 *     both in the catalog) ASK which to use rather than guessing a generic "email" provider.
 *
 * Deterministic + model-free: NO Hermes/model/network call. Carries no config values, secrets, or ids.
 * The current-graph SHAPE it reads is kind/provider/type only (the caller sends nothing more).
 */

import { WORKFLOW_PLAN_SCHEMA_VERSION, type WorkflowPlan, type WorkflowPlanStep } from "@/contracts/guidanceSession";
import { getActionMeta } from "@/services/discovery/_registry";
import { validateWorkflowPlan } from "../validateWorkflowPlan";
import { requiredActionInputs, requiredTriggerInputs } from "./inferDeterministicPreview";

/** Catalog capabilities this mutation may swap to/from. Each is registry-checked before it ships. */
const GMAIL_SEND = { provider: "gmail", type: "send_email" } as const;
const OUTLOOK_SEND = { provider: "microsoft-outlook", type: "send_email" } as const;
const SLACK_CHANNEL = { provider: "slack", type: "send_channel_message" } as const;
/** Slack notification action types that count as "the notification" for a channel swap. */
const SLACK_NOTIFY_TYPES = ["send_channel_message", "send_direct_message"] as const;
const EMAIL_SEND_TYPES = ["send_email"] as const;

/** De-identified current-graph node SHAPE (kind/provider/type only — no config/ids/secrets). */
export interface CurrentGraphNode {
  readonly kind: string;
  readonly provider: string;
  readonly type: string;
}

export interface InferMutationInput {
  readonly goalText: string;
  readonly currentGraph: readonly CurrentGraphNode[];
  /**
   * Email providers (subset of `gmail` / `microsoft-outlook`) the current user already has connected —
   * drives the "safe default only if already used" policy. Omitted ⇒ no default ⇒ ask when ambiguous.
   */
  readonly connectedEmailProviders?: readonly string[];
}

/** Result of a deterministic mutation attempt. */
export type MutationResult =
  | { readonly kind: "plan"; readonly plan: WorkflowPlan }
  | { readonly kind: "needs_provider_choice"; readonly message: string }
  | { readonly kind: "catalog_gap"; readonly message: string }
  | { readonly kind: "none" };

const EMAIL_PROVIDER_QUESTION =
  "I can switch the notification to email — should I use Gmail or Outlook? Tell me which and I'll update the preview.";

function isAction(n: CurrentGraphNode): boolean {
  return n.kind.trim().toLowerCase() === "action";
}

/** A registry-valid capability key check. */
function capabilityExists(provider: string, type: string): boolean {
  return getActionMeta(`${provider}:${type}`) != null;
}

/**
 * Build a FULL updated plan that mirrors `currentGraph`, swapping the node at `swapIndex` to
 * `to` and marking it with `replaces` (so apply does an in-place swap). Returns null if the graph
 * can't be faithfully represented (any node not registry-resolvable → validateWorkflowPlan fails).
 */
function buildSwapPlan(
  currentGraph: readonly CurrentGraphNode[],
  swapIndex: number,
  to: { provider: string; type: string },
  title: string,
  summary: string,
): WorkflowPlan | null {
  const steps: WorkflowPlanStep[] = currentGraph.map((node, i) => {
    const role: WorkflowPlanStep["role"] = node.kind.trim().toLowerCase() === "trigger" ? "trigger" : "action";
    if (i === swapIndex) {
      const inputs = requiredActionInputs(to.provider, to.type);
      return {
        ref: `s${i}`,
        role: "action",
        provider: to.provider,
        type: to.type,
        purpose: "Send the notification through the new channel (replaces the previous notification step).",
        ...(inputs && inputs.length > 0 ? { requiredInputs: inputs } : {}),
        replaces: { provider: node.provider, type: node.type },
      };
    }
    const inputs = role === "trigger" ? requiredTriggerInputs(node.provider, node.type) : requiredActionInputs(node.provider, node.type);
    return {
      ref: `s${i}`,
      role,
      provider: node.provider,
      type: node.type,
      purpose: role === "trigger" ? "Keep the existing trigger." : "Keep the existing step.",
      ...(inputs && inputs.length > 0 ? { requiredInputs: inputs } : {}),
    };
  });
  const plan: WorkflowPlan = {
    schemaVersion: WORKFLOW_PLAN_SCHEMA_VERSION,
    title,
    summary,
    steps,
    notApplied: true,
  };
  return validateWorkflowPlan(plan).ok ? plan : null;
}

/** Resolve which email provider to swap to, or signal that we must ask. */
function resolveEmailTarget(
  goal: string,
  connected: readonly string[],
): { provider: string; type: string } | "ask" | "none" {
  // Explicit provider in the user's words always wins.
  if (/\bgmail\b/.test(goal) && capabilityExists(GMAIL_SEND.provider, GMAIL_SEND.type)) return { ...GMAIL_SEND };
  if (/\b(outlook|office\s?365|microsoft)\b/.test(goal) && capabilityExists(OUTLOOK_SEND.provider, OUTLOOK_SEND.type)) {
    return { ...OUTLOOK_SEND };
  }
  const candidates = [GMAIL_SEND, OUTLOOK_SEND].filter((c) => capabilityExists(c.provider, c.type));
  if (candidates.length === 0) return "none"; // no email send action in the catalog at all
  const connectedCandidates = candidates.filter((c) => connected.includes(c.provider));
  if (connectedCandidates.length === 1) return { ...connectedCandidates[0]! }; // safe default: already used
  if (candidates.length === 1) return { ...candidates[0]! }; // only one email action exists in the catalog
  return "ask"; // both available, 0 or 2 connected → don't guess; ask Gmail vs Outlook
}

/**
 * Attempt a deterministic, catalog-validated mutation of the CURRENT draft graph for an obvious
 * change request. Returns a full updated plan (with an in-place swap marker), a provider-choice or
 * catalog-gap message, or `none` when nothing safe matches (let other paths / the model text stand).
 */
export function inferDeterministicMutationPlan(input: InferMutationInput): MutationResult {
  const goal = (input.goalText ?? "").trim().toLowerCase();
  const graph = input.currentGraph ?? [];
  if (goal.length === 0 || graph.length === 0) return { kind: "none" };

  const changeVerb = /\b(change|switch|swap|convert|replace|make it|turn it into|use|instead|rather than)\b/.test(goal);
  const emailIntent = /\b(e-?mail|gmail|outlook)\b/.test(goal);
  const slackIntent = /\bslack\b/.test(goal);

  // --- Direction A: Slack notification → email (the reported scenario) ---
  if (emailIntent && (changeVerb || /\bto\s+(an?\s+)?e-?mail\b/.test(goal))) {
    const slackIndex = graph.findIndex(
      (n) => isAction(n) && n.provider === "slack" && SLACK_NOTIFY_TYPES.includes(n.type as (typeof SLACK_NOTIFY_TYPES)[number]),
    );
    if (slackIndex !== -1) {
      const target = resolveEmailTarget(goal, input.connectedEmailProviders ?? []);
      if (target === "none") {
        return {
          kind: "catalog_gap",
          message:
            "ChainReact doesn't have an email send action in the catalog yet, so I can't switch the notification to email here.",
        };
      }
      if (target === "ask") {
        return { kind: "needs_provider_choice", message: EMAIL_PROVIDER_QUESTION };
      }
      const plan = buildSwapPlan(
        graph,
        slackIndex,
        target,
        "Switch the notification to email",
        "Replace the Slack message with an email — choose the recipient and message, then Apply. The trigger/source is unchanged (still set your real trigger if it's a starter).",
      );
      if (plan) return { kind: "plan", plan };
      // Graph couldn't be faithfully represented (a node isn't registry-resolvable) → fail closed.
      return { kind: "none" };
    }
  }

  // --- Direction B: email notification → Slack ---
  if (slackIntent && changeVerb && !emailIntent) {
    const emailIndex = graph.findIndex(
      (n) => isAction(n) && (n.provider === "gmail" || n.provider === "microsoft-outlook") && EMAIL_SEND_TYPES.includes(n.type as (typeof EMAIL_SEND_TYPES)[number]),
    );
    if (emailIndex !== -1) {
      if (!capabilityExists(SLACK_CHANNEL.provider, SLACK_CHANNEL.type)) {
        return {
          kind: "catalog_gap",
          message: "ChainReact doesn't have a Slack channel message action in the catalog yet.",
        };
      }
      const plan = buildSwapPlan(
        graph,
        emailIndex,
        { ...SLACK_CHANNEL },
        "Switch the notification to Slack",
        "Replace the email with a Slack channel message — choose the channel and message, then Apply.",
      );
      if (plan) return { kind: "plan", plan };
      return { kind: "none" };
    }
  }

  return { kind: "none" };
}
