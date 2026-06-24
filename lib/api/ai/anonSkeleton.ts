import type { WorkflowPlan } from "@/contracts/guidanceSession";
import type { DraftPreview } from "@/contracts/workflowPlanPreview";

/**
 * Typed client for the free, no-auth deterministic skeleton endpoint
 * (REACT-LIVE-SKELETON-2). Used by the anonymous `/start` rail to get a
 * catalog-backed skeleton WITHOUT signing in or calling paid AI.
 *
 * Never throws — any failure resolves to `null` so the rail degrades to its
 * sign-up CTA. The endpoint is deterministic + public; this helper sends only
 * the bounded prompt and reads only the advisory plan / preview / warnings.
 */

export interface AnonSkeletonResult {
  readonly plan: WorkflowPlan | null;
  readonly preview: DraftPreview | null;
  readonly warnings?: readonly string[];
}

export async function requestAnonSkeleton(input: { goalText: string }): Promise<AnonSkeletonResult | null> {
  try {
    const res = await fetch("/api/ai/anon-skeleton", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ goalText: input.goalText }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      ok?: boolean;
      plan?: WorkflowPlan | null;
      preview?: DraftPreview | null;
      warnings?: readonly string[];
    };
    if (!body || body.ok !== true) return null;
    return {
      plan: body.plan ?? null,
      preview: body.preview ?? null,
      ...(Array.isArray(body.warnings) && body.warnings.length ? { warnings: body.warnings } : {}),
    };
  } catch {
    return null;
  }
}
