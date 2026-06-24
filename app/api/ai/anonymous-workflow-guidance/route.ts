import { NextResponse } from "next/server";
import { z } from "zod";
import { runAnonymousWorkflowGuidance } from "@/services/ai-guidance/anonymousGuidance";
import { planToDraftPreview } from "@/services/ai-guidance/preview/planToDraftPreview";
import {
  inferDeterministicPreviewPlan,
  detectCatalogGap,
} from "@/services/ai-guidance/fallback/inferDeterministicPreview";
import {
  ANON_AI_LIMIT,
  ANON_AI_COOKIE_NAME,
  anonAiCookieOptions,
  ipSoftCapReached,
  isAnonAiPlanningAvailable,
  readAnonAiCount,
  recordIpHit,
  serializeAnonAiCookieValue,
} from "@/lib/anonAiLimit";
import {
  MAX_GUIDANCE_CONVERSATION_TURNS,
  MAX_GUIDANCE_CONVERSATION_TURN_TEXT,
} from "@/contracts/aiGuidance";

/**
 * POST /api/ai/anonymous-workflow-guidance (REACT-LIVE-SKELETON-3) — limited anonymous AI planning.
 *
 * Lets a LOGGED-OUT visitor on `/start` use a small, capped amount of model-backed planning to get a
 * validated workflow skeleton/preview BEFORE signing up. It is the planning-only counterpart to the
 * authenticated `/api/accounts/[id]/ai/workflow-guidance` route — SEPARATE from it, so the account
 * route's auth/credit/governance gates are never weakened.
 *
 * Anonymous = planning ONLY. This route:
 *   - requires NO auth / account / user / workflow (it accepts none);
 *   - sends NO account/workflow/credential/private context to the model (bounded goal + recent turns
 *     only); the gateway token never leaves the server;
 *   - calls NO provider API, makes NO DB read/write, uses NO service-role;
 *   - never creates / saves / connects / runs / activates anything — returns advisory text + a
 *     non-applied `previewDraft` derived from a VALIDATED plan (fail closed when none);
 *   - keeps the deterministic catalog fallback as a BACKUP when the model returns no valid plan.
 *
 * Abuse controls (best-effort, no DB — see lib/anonAiLimit): a signed, HttpOnly, day-bucketed cookie
 * caps attempts per browser (`ANON_AI_LIMIT`); a per-instance IP/day soft cap backstops cookie-clear
 * loops. When the cap is hit the route returns a typed `limitReached` response with NO model call.
 * Input is size-bounded; recent turns are bounded + sanitized upstream and re-bounded here.
 */

const MAX_GOAL_LENGTH = 2_000;

const TurnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string().trim().min(1).max(MAX_GUIDANCE_CONVERSATION_TURN_TEXT),
});

const BodySchema = z
  .object({
    goalText: z.string().trim().min(1, "A goal description is required.").max(MAX_GOAL_LENGTH),
    recentTurns: z.array(TurnSchema).max(MAX_GUIDANCE_CONVERSATION_TURNS).optional(),
  })
  .strict();

function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

const LIMIT_MESSAGE =
  "You've used the free workflow previews. Create a free account to keep building with React Agent — your draft is kept.";

const UNAVAILABLE_MESSAGE =
  "Free anonymous previews aren't available right now. Create a free account to start building with React Agent.";

export async function POST(request: Request): Promise<Response> {
  const now = Date.now();

  // Fail closed when the per-browser limit cookie cannot be SIGNED. In production a missing signing
  // key would mean an UNSIGNED (forgeable) cap — a visitor could pin their count at 0 and get unlimited
  // free model-backed planning. Rather than run uncapped, return a typed unavailable response (rendered
  // as the sign-up CTA): NO model call, NO cookie set, NO attempt consumed. Dev/test without a key still
  // runs (unsigned cookie, documented non-prod behavior — see lib/anonAiLimit).
  if (!isAnonAiPlanningAvailable()) {
    return NextResponse.json({
      ok: true,
      unavailable: true,
      limitReached: true,
      remainingAnonymousAttempts: 0,
      guidanceText: UNAVAILABLE_MESSAGE,
      workflowPlan: null,
      previewDraft: null,
    });
  }

  const ip = clientIp(request);
  const used = readAnonAiCount(request.headers.get("cookie"), now);

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ ok: false, code: "BAD_REQUEST", message: "Request body must be valid JSON." }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, code: "BAD_REQUEST", message: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  }
  const { goalText, recentTurns } = parsed.data;

  // Limit gate — typed response, NO model call, NO attempt consumed.
  if (used >= ANON_AI_LIMIT || ipSoftCapReached(ip, now)) {
    return NextResponse.json({
      ok: true,
      limitReached: true,
      remainingAnonymousAttempts: 0,
      guidanceText: LIMIT_MESSAGE,
      workflowPlan: null,
      previewDraft: null,
    });
  }

  const boundedTurns = recentTurns?.slice(-MAX_GUIDANCE_CONVERSATION_TURNS);
  const guidance = await runAnonymousWorkflowGuidance({
    goalText,
    ...(boundedTurns && boundedTurns.length ? { recentTurns: boundedTurns } : {}),
  });

  if (!guidance.ok) {
    // Gateway disabled / transport failure → unavailable. Do NOT consume an attempt for infra errors.
    return NextResponse.json(
      { ok: false, code: "GUIDANCE_UNAVAILABLE", message: "Workflow planning isn't available right now. Please try again later." },
      { status: 503 },
    );
  }

  // A real model attempt was consumed — advance both counters.
  const newCount = used + 1;
  recordIpHit(ip, now);

  // Model plan wins; deterministic catalog fallback is the BACKUP (REACT-LIVE-SKELETON-1/2). Both are
  // validated; preview is derived only from a validated plan. Fail closed → null.
  const plan = guidance.workflowPlan ?? inferDeterministicPreviewPlan(goalText);
  const previewDraft = plan ? planToDraftPreview(plan) : null;
  const catalogGap = plan ? null : detectCatalogGap(goalText);
  const warnings = [...(guidance.warnings ?? []), ...(catalogGap ? [catalogGap.message] : [])];
  const remaining = Math.max(0, ANON_AI_LIMIT - newCount);

  const res = NextResponse.json({
    ok: true,
    guidanceText: guidance.guidanceText,
    workflowPlan: plan,
    previewDraft,
    ...(warnings.length ? { warnings } : {}),
    remainingAnonymousAttempts: remaining,
    limitReached: remaining <= 0,
  });
  res.cookies.set(
    ANON_AI_COOKIE_NAME,
    serializeAnonAiCookieValue(newCount, now),
    anonAiCookieOptions(process.env.NODE_ENV === "production"),
  );
  return res;
}
