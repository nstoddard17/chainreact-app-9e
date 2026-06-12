import type { WorkflowDefinition } from "@/contracts/workflowDefinition";
import { listSharedConnectorUserIdsServiceRole } from "@/repositories/integrations";
import {
  computeRunEditEligibility,
  distinctPrivateProviders,
  type RunEditEligibilityResult,
} from "@/core/integrations/sharingEligibility";
import { isConnectionSharingEnabled } from "./connectionSharingFlags";

/**
 * Ambiguity-aware run/edit eligibility service (Slice 4.CONN-SHARE / CS-3a).
 *
 * Narrow read layer over the pure `computeRunEditEligibility`: it fetches the
 * per-provider distinct shared-connector COUNT and hands it to the pure core. It
 * returns ONLY the safe `RunEditEligibilityResult` (allowed + reason + provider
 * slug/status views) — the connector user ids read from the repository are
 * consumed as `.size` and NEVER returned to a caller.
 *
 * BEHAVIOR-INERT: no live run/edit path calls this in CS-3a. While
 * `ENABLE_CONNECTION_SHARING` is OFF this does ZERO DB I/O and returns the exact
 * WF-RUNPERM decision (the pure core delegates to `viewerMayRunEdit`). CS-3b
 * wires this into the gate behind the flag.
 */

export interface WorkflowSharingEligibilityInput {
  accountId: string;
  definition: WorkflowDefinition;
  createdByUserId: string | null;
  callerUserId: string;
}

export async function computeWorkflowSharingEligibility(
  input: WorkflowSharingEligibilityInput,
): Promise<RunEditEligibilityResult> {
  const flagEnabled = isConnectionSharingEnabled();

  // Flag OFF → no DB read; pure WF-RUNPERM via the core helper.
  if (!flagEnabled) {
    return computeRunEditEligibility({
      definition: input.definition,
      createdByUserId: input.createdByUserId,
      callerUserId: input.callerUserId,
      sharedConnectorCountByProvider: new Map(),
      flagEnabled: false,
    });
  }

  // Only read shared-connector counts when they can change the outcome: the
  // workflow has private providers AND the caller is NOT the creator. (The pure
  // core short-circuits creator / no-private too, but skipping the DB read here
  // keeps the common cases free.)
  const isCreator =
    input.createdByUserId !== null && input.createdByUserId === input.callerUserId;
  const privateProviders = distinctPrivateProviders(input.definition);

  let counts: ReadonlyMap<string, number> = new Map();
  if (!isCreator && privateProviders.length > 0) {
    const entries = await Promise.all(
      privateProviders.map(async (provider) => {
        const ids = await listSharedConnectorUserIdsServiceRole(input.accountId, provider);
        return [provider, ids.size] as const;
      }),
    );
    counts = new Map(entries);
  }

  return computeRunEditEligibility({
    definition: input.definition,
    createdByUserId: input.createdByUserId,
    callerUserId: input.callerUserId,
    sharedConnectorCountByProvider: counts,
    flagEnabled: true,
  });
}
