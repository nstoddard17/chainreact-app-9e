import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserWithAccount } from "@/app/api/workflows/_shared";
import { recordOnboardingEvent } from "@/services/onboarding/onboardingEvents";

/**
 * POST /api/onboarding/events — the two CLIENT-originated analytics events
 * (5.ONBOARD-1 Batch 4): step-CTA clicks and video opens. Everything else is
 * recorded server-side at its authoritative call site. Strict allow-listed
 * body; the recorder re-sanitizes as defense-in-depth; always fail-open (a
 * recording problem returns ok — analytics never surfaces as a user error).
 *
 * These are attention metrics, not completion: nothing here can mark a step
 * complete or touch user_onboarding_states.
 */
const EventBodySchema = z.discriminatedUnion("event", [
  z
    .object({
      event: z.literal("cta_clicked"),
      stepKey: z.enum(["create", "connect", "configure", "test", "activate"]),
      creationPath: z.enum(["agent", "template", "manual"]).optional(),
    })
    .strict(),
  z.object({ event: z.literal("video_opened") }).strict(),
]);

export async function POST(request: Request): Promise<Response> {
  const auth = await requireUserWithAccount();
  if (!auth.ok) return auth.response;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }
  const parsed = EventBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request body." },
      { status: 400 },
    );
  }

  const body = parsed.data;
  await recordOnboardingEvent({
    userId: auth.userId,
    accountId: auth.accountId,
    ...(body.event === "cta_clicked"
      ? {
          eventType: "onboarding_cta_clicked" as const,
          stepKey: body.stepKey,
          ...(body.creationPath
            ? { metadata: { creation_path: body.creationPath } }
            : {}),
        }
      : { eventType: "onboarding_video_opened" as const }),
  });
  return NextResponse.json({ ok: true });
}
