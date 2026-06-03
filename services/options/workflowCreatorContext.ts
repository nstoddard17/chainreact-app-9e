import { getById } from "@/repositories/workflows";
import type { WorkflowCreatorContext } from "./types";

/**
 * Resolve the workflow-creator provenance for an options request, when the
 * caller supplied a `workflowId` (Slice 4.ACCOUNT-MODEL-22D-1).
 *
 * PLUMBING ONLY — the gating prerequisite for 22D-2. This returns the
 * workflow's `created_by_user_id` so a LATER slice can apply the
 * creator-pinned credential policy for personal providers (the same identity
 * 22B pins execution to). NOTHING in 22D-1 consumes the result for credential
 * resolution: both the options route and the AI options tool still resolve the
 * caller's personal-account integration exactly as before. A non-null return
 * here changes no request outcome in this slice.
 *
 * Resolution is best-effort and never throws:
 *   - Blank / whitespace-only `workflowId` → `null` (no DB round-trip).
 *   - `getById` is RLS-scoped to the caller's account, so a `workflowId` the
 *     caller cannot see resolves to `null` — existence is never leaked, and a
 *     co-member's workflow is invisible.
 *   - Any lookup failure → `null` (degrades to "no creator context", i.e.
 *     today's behavior), so a flaky workflows read can never break an options
 *     request that previously worked.
 */
export async function resolveWorkflowCreatorContext(
  workflowId: string,
): Promise<WorkflowCreatorContext | null> {
  const trimmed = workflowId.trim();
  if (trimmed.length === 0) return null;
  try {
    const record = await getById(trimmed);
    if (!record) return null;
    return {
      workflowId: record.id,
      createdByUserId: record.createdByUserId,
      accountId: record.accountId,
    };
  } catch {
    return null;
  }
}
