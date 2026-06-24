import { NextResponse } from "next/server";
import { z } from "zod";
import {
  inferDeterministicPreviewPlan,
  detectCatalogGap,
} from "@/services/ai-guidance/fallback/inferDeterministicPreview";
import { planToDraftPreview } from "@/services/ai-guidance/preview/planToDraftPreview";

/**
 * POST /api/ai/anon-skeleton (REACT-LIVE-SKELETON-2) — free, no-auth deterministic skeleton preview.
 *
 * Lets a LOGGED-OUT visitor on `/start` get a workflow skeleton on the canvas for an OBVIOUS,
 * catalog-backed shape (e.g. manual run → Slack channel message, manual run → Mailchimp add tag)
 * WITHOUT signing in. It reuses the exact same deterministic, catalog-validated inferer the
 * authenticated guidance route uses — so the client never has to bundle the (large) discovery
 * registry.
 *
 * Strictly bounded + safe by construction:
 *   - NO auth / account / session — public on purpose (it returns only public capability shape).
 *   - NO AI / Hermes / OpenAI / model / network to any vendor — pure, deterministic, model-free.
 *   - NO provider API calls, NO database reads/writes, NO service-role, NO secrets.
 *   - Returns ONLY a validated `plan` (provider:type + required field KEY names) + a non-applied
 *     `DraftPreview`, or a safe catalog-gap `warning`. It NEVER dumps the catalog: only the matched
 *     deterministic shape ships. Fails closed to `{ plan: null, preview: null }` for anything the
 *     inferer can't safely confirm.
 *   - Body is size-bounded; a best-effort per-instance rate limit is a speed bump (the work is trivial
 *     pure CPU; durable cross-instance limiting is a follow-up if ever needed).
 */

const MAX_GOAL_LENGTH = 2_000;

const BodySchema = z
  .object({
    goalText: z.string().trim().min(1, "A goal description is required.").max(MAX_GOAL_LENGTH),
  })
  .strict();

// Best-effort, per-instance fixed-window rate limit. Not a security boundary — the endpoint is pure
// CPU over the static catalog and exposes only public capability shape; this just caps obvious abuse.
const RATE_LIMIT = 60;
const WINDOW_MS = 60_000;
const MAX_TRACKED_IPS = 5_000;
const hits = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string, now: number): boolean {
  if (hits.size > MAX_TRACKED_IPS) hits.clear(); // crude unbounded-growth guard
  const entry = hits.get(ip);
  if (!entry || now > entry.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT;
}

function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

export async function POST(request: Request): Promise<Response> {
  if (isRateLimited(clientIp(request), Date.now())) {
    return NextResponse.json(
      { ok: false, code: "RATE_LIMITED", message: "Too many requests — please slow down." },
      { status: 429 },
    );
  }

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
  const { goalText } = parsed.data;

  // Deterministic, catalog-validated. No model, no network, no DB, no provider call.
  const plan = inferDeterministicPreviewPlan(goalText);
  const preview = plan ? planToDraftPreview(plan) : null;
  const catalogGap = plan ? null : detectCatalogGap(goalText);

  return NextResponse.json({
    ok: true,
    plan,
    preview,
    ...(catalogGap ? { warnings: [catalogGap.message] } : {}),
  });
}
