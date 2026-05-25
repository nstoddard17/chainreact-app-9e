import type { WorkflowNode } from "@/contracts/workflowDefinition";
import { getActionMeta } from "@/services/discovery/_registry";

/**
 * Slice 3.SEC-4B — destructive-action confirmation enumerator.
 *
 * Inspects a workflow's nodes and returns the set of action nodes that
 * require the caller to type a confirmation phrase before activation
 * or real-mode (`testMode: false`) execution is allowed to proceed.
 * The route layer is the choke point — this helper is the rule, and
 * the activate / run-now routes are the enforcers.
 *
 * Background: SEC-2A introduced `isDestructive` / `requiresConfirmation`
 * / `riskLevel` fields on `ActionMeta`. SEC-2 used `riskLevel: "high"`
 * + `requiresIntegration: true` to short-circuit external handlers in
 * test mode. SEC-4B closes the symmetric gap on the REAL-execution
 * side: even in real mode, a workflow that contains a destructive
 * action MUST require an explicit caller-typed confirmation before
 * Stripe refunds, calendar-event deletes, mailbox archives, etc. fire.
 *
 * Why not also block on `riskLevel: "high"` alone? The slice scope
 * settles for the minimum-friction rule:
 *   - `requiresConfirmation: true` OR `isDestructive: true` → typed
 *     confirmation required.
 *   - `riskLevel: "high"` alone (e.g. `stripe:create_payment_intent`,
 *     which authorizes a charge but is reversible by canceling before
 *     capture) → no typed confirmation in this slice. The risk
 *     metadata still flows out via /api/providers/[id]/actions so the
 *     builder can render a chip; a future slice with product input
 *     decides whether to require confirmation here too.
 *
 * Fail-closed defaults:
 *   - Unknown action meta (`getActionMeta` returns undefined) → treated
 *     as confirmation-required. The discovery-coverage CI guard
 *     catches missing metas in production, but a meta drift slipping
 *     through MUST NOT silently bypass the gate.
 *   - Empty `provider` / `type` (the transient state the
 *     `WorkflowNode` schema permits while the user picks an action) →
 *     treated as confirmation-required. The orchestrator's
 *     preconditions also block this, but the confirmation gate is the
 *     first defender and surfaces a clear UI signal.
 *
 * Trigger nodes are ignored — only `kind === "action"` is enumerated.
 *
 * Response shape: only the route-safe fields make the trip back to the
 * client. NEVER include resolved config, workflow inputs, Stripe
 * object IDs, or any value derived from the run. The caller picks the
 * confirmation phrase by reading the `confirmationText` literal.
 */

/**
 * The single typed confirmation phrase the caller must echo to proceed
 * past the destructive-action gate. V1 keeps this generic — a future
 * slice may layer per-provider phrases (e.g. "REFUND" for Stripe
 * refund) on top, but cross-provider workflows would then need
 * multiple typed phrases. Generic phrase wins for first cut.
 */
export const REQUIRED_CONFIRMATION_TEXT = "CONFIRM";

export interface ConfirmationRequiredAction {
  nodeId: string;
  provider: string;
  type: string;
  displayName: string;
  /**
   * Optional human-safe risk description from the action's meta.
   * Renders below the confirmation prompt so the user knows what
   * specifically is dangerous. Never contains tokens, IDs, or
   * resolved config.
   */
  riskDescription?: string;
}

export interface RiskConfirmationResult {
  /** True when at least one action in the workflow requires typed confirmation. */
  requiresConfirmation: boolean;
  /** Phrase the caller must echo verbatim — currently `"CONFIRM"`. */
  confirmationText: string;
  /** Per-node confirmation-required descriptors (route-safe shape only). */
  actions: readonly ConfirmationRequiredAction[];
}

/**
 * Enumerate action nodes whose meta requires a typed confirmation.
 * Pure — no I/O, no provider calls, no token decryption.
 *
 * Returns an empty `actions` array (with `requiresConfirmation: false`)
 * when no node trips the rule — including the trivial "workflow has no
 * actions" case.
 */
export function findConfirmationRequiredActions(
  nodes: readonly WorkflowNode[],
): RiskConfirmationResult {
  const actions: ConfirmationRequiredAction[] = [];

  for (const node of nodes) {
    if (node.kind !== "action") continue;

    // Empty provider / type — fail closed. The WorkflowNode schema
    // permits empty `type` while the user picks an action; the route
    // layer surfaces a clear gate before activation rather than
    // silently letting the orchestrator's preconditions catch it.
    if (!node.provider || !node.type) {
      actions.push({
        nodeId: node.id,
        provider: node.provider || "(missing)",
        type: node.type || "(missing)",
        displayName: "Unconfigured action",
        riskDescription:
          "Action has no provider/type selected — confirm before activating to acknowledge the workflow is incomplete.",
      });
      continue;
    }

    const meta = getActionMeta(`${node.provider}:${node.type}`);

    // Unknown meta — fail closed. The discovery-coverage CI guard
    // catches missing metas in production; if one slips through, the
    // confirmation gate refuses to assume safety.
    if (!meta) {
      actions.push({
        nodeId: node.id,
        provider: node.provider,
        type: node.type,
        displayName: `${node.provider}:${node.type}`,
        riskDescription:
          "Action metadata is unavailable — confirm before activating to acknowledge the unknown safety status.",
      });
      continue;
    }

    if (meta.isDestructive || meta.requiresConfirmation) {
      actions.push({
        nodeId: node.id,
        provider: node.provider,
        type: node.type,
        displayName: meta.displayName,
        ...(meta.riskDescription !== undefined
          ? { riskDescription: meta.riskDescription }
          : {}),
      });
    }
  }

  return {
    requiresConfirmation: actions.length > 0,
    confirmationText: REQUIRED_CONFIRMATION_TEXT,
    actions,
  };
}

/**
 * Equality check for the typed confirmation phrase. Trim + case-sensitive
 * compare against the canonical `REQUIRED_CONFIRMATION_TEXT`. We do NOT
 * normalize to upper-case — case sensitivity is intentional friction so a
 * scripted client can't accidentally produce a matching string. Hidden
 * trailing whitespace from copy/paste IS tolerated (trim only).
 */
export function isValidConfirmationText(
  provided: string | undefined,
): boolean {
  if (typeof provided !== "string") return false;
  return provided.trim() === REQUIRED_CONFIRMATION_TEXT;
}
