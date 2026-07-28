import { z } from "zod";

/**
 * 5.ONBOARD-1 — First-workflow onboarding checklist contracts.
 *
 * The checklist DTO is a SAFE projection: workflow ids/names/states, provider
 * KEYS + public display names, and booleans/timestamps only. It never carries
 * node config, tokens, scopes beyond public gap names, provider account ids,
 * or other members' identities. Substantive step completion is derived
 * server-side (services/onboarding/checklistDerivation.ts) — the client can
 * only mutate PRESENTATION state via `OnboardingPresentationActionSchema`.
 */

// Order is the user-facing checklist order. `connect` leads: connecting an app
// is account-level, needs no workflow, and is the prerequisite a user is most
// likely to hit mid-build — so the guide teaches it before creating anything.
export const ONBOARDING_STEP_KEYS = [
  "connect",
  "create",
  "configure",
  "test",
  "activate",
] as const;

export type OnboardingStepKey = (typeof ONBOARDING_STEP_KEYS)[number];

export type OnboardingStepStatus = "complete" | "current" | "pending";

/**
 * 5.ONBOARD-3: the `blocked` status, `OnboardingStepBlockedReason`, and
 * `OnboardingProviderEntry` were removed. They existed only to explain
 * provider-specific Connect failures (missing scopes, reconnect required, an
 * owner/admin-only provider). The checklist now teaches the general action
 * "connect an app" and carries no provider identity at all — those diagnostics
 * belong on the Apps page and in the workflow builder.
 */

export interface OnboardingStepDTO {
  readonly key: OnboardingStepKey;
  readonly status: OnboardingStepStatus;
  /**
   * Step-specific safe detail (test only): whether the CTA-target workflow
   * supports an in-builder test (manual trigger) and whether it is "waiting for
   * first run" post-activation. Connect carries NO detail — it is the general
   * "connect an app" action.
   */
  readonly testable?: boolean;
  readonly waitingForFirstRun?: boolean;
  readonly lastRunFailed?: boolean;
  /**
   * Which workflow this step's CTA should open (5.ONBOARD-2).
   *
   * Steps are account-level and independent, so each one targets the workflow
   * CLOSEST to satisfying it, tie-broken by most-recently-updated. Absent when
   * no workflow is a candidate — the UI then routes to workflow creation.
   * Navigation only: the id never triggers a connect/save/test/activate.
   */
  readonly ctaWorkflowId?: string;
  /** Display name of `ctaWorkflowId`, so the CTA can name where it leads. */
  readonly ctaWorkflowName?: string;
}

export interface OnboardingPresentationDTO {
  readonly dismissed: boolean;
  readonly minimized: boolean;
  readonly videoWatched: boolean;
  /** True until the completion celebration has been shown once. */
  readonly celebrationPending: boolean;
}

export interface OnboardingChecklistDTO {
  readonly completed?: boolean;
  readonly completedAt?: string | null;
  /**
   * Completion provenance for the success state.
   *
   * `id` is null when the workflow row is gone (deleted / FK nulled) but the
   * immutable `completion_workflow_name` snapshot survives — the UI still names
   * what completed onboarding, it just cannot link to it. The whole field is
   * null only when neither a live row nor a snapshot exists (e.g. rows latched
   * before the provenance correction), and the UI then uses generic copy.
   */
  readonly completionWorkflow?: {
    readonly id: string | null;
    readonly name: string;
  } | null;
  readonly presentation?: OnboardingPresentationDTO;
  readonly steps?: readonly OnboardingStepDTO[];
  readonly completedStepCount?: number;
  readonly totalStepCount?: number;
}

/**
 * Presentation mutations — the ONLY client-writable surface. `.strict()` so a
 * body attempting to smuggle `completedAt` / step state / arbitrary fields is a
 * 400, never a silent write.
 */
export const OnboardingPresentationActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("dismiss") }).strict(),
  z.object({ action: z.literal("reopen") }).strict(),
  z.object({ action: z.literal("minimize") }).strict(),
  z.object({ action: z.literal("expand") }).strict(),
  z.object({ action: z.literal("video_watched") }).strict(),
  z.object({ action: z.literal("celebrated") }).strict(),
  // NOTE (5.ONBOARD-2): `select_workflow` was removed with the "Working on"
  // picker. The checklist is account-level — steps aggregate across every
  // workflow — so there is no selected workflow to persist, and each CTA
  // derives its own target. A body still sending it is now a 400, which is
  // correct: honouring it would reintroduce per-workflow scoping.
]);

export type OnboardingPresentationAction = z.infer<
  typeof OnboardingPresentationActionSchema
>;
