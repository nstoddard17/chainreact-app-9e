import * as eventsRepo from "@/repositories/onboarding/onboardingEvents";
import type { OnboardingEventType } from "@/repositories/onboarding/onboardingEvents";

export type { OnboardingEventType };

/**
 * Fail-open onboarding analytics recorder (5.ONBOARD-1 Batch 4) — the
 * `ai_cost_events` pattern: every call swallows its own errors after a safe
 * message-only log line, so analytics can NEVER interrupt onboarding,
 * activation, navigation, or video playback.
 *
 * Sanitization is enforced HERE, not trusted from callers: metadata is
 * rebuilt from an explicit allow-list of scalar keys, step/provider are
 * pattern-checked, and everything else is dropped. No workflow definitions,
 * node config, provider payloads, tokens, scopes, emails, message bodies,
 * file contents, or user-entered prompts can pass through this seam.
 */

const ALLOWED_METADATA_KEYS = new Set([
  "account_type",
  "user_role",
  "creation_path",
  "minutes_from_first_shown",
  "silent",
]);

const STEP_KEYS = new Set(["create", "connect", "configure", "test", "activate"]);
const SAFE_KEY_PATTERN = /^[a-z0-9_-]{1,64}$/;

function sanitizeMetadata(
  metadata: Readonly<Record<string, unknown>> | undefined,
): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  if (!metadata) return out;
  for (const [key, value] of Object.entries(metadata)) {
    if (!ALLOWED_METADATA_KEYS.has(key)) continue;
    if (typeof value === "number" && Number.isFinite(value)) {
      out[key] = Math.round(value);
    } else if (typeof value === "boolean") {
      out[key] = value;
    } else if (typeof value === "string" && SAFE_KEY_PATTERN.test(value)) {
      out[key] = value;
    }
  }
  return out;
}

export async function recordOnboardingEvent(input: {
  userId: string;
  accountId: string;
  eventType: OnboardingEventType;
  stepKey?: string;
  workflowId?: string;
  provider?: string;
  metadata?: Readonly<Record<string, unknown>>;
}): Promise<void> {
  try {
    await eventsRepo.insertServiceRole({
      userId: input.userId,
      accountId: input.accountId,
      eventType: input.eventType,
      ...(input.stepKey && STEP_KEYS.has(input.stepKey)
        ? { stepKey: input.stepKey }
        : {}),
      ...(input.workflowId ? { workflowId: input.workflowId } : {}),
      ...(input.provider && SAFE_KEY_PATTERN.test(input.provider)
        ? { provider: input.provider }
        : {}),
      metadata: sanitizeMetadata(input.metadata),
    });
  } catch (err) {
    console.error(
      "[onboarding] event recording failed (flow unaffected):",
      err instanceof Error ? err.message : "unknown error",
    );
  }
}
