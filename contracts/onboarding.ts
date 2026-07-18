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

export const ONBOARDING_STEP_KEYS = [
  "create",
  "connect",
  "configure",
  "test",
  "activate",
] as const;

export type OnboardingStepKey = (typeof ONBOARDING_STEP_KEYS)[number];

export type OnboardingStepStatus = "complete" | "current" | "pending" | "blocked";

/** Why a step is blocked (safe reason codes; UI maps to copy). */
export type OnboardingStepBlockedReason =
  | "admin_required"
  | "reconnect_required"
  | "add_steps_first";

/**
 * Per-provider connection summary for the Connect step. Mirrors the safe subset
 * of `WorkflowProviderConnectionEntry` (services/diagnostics/integrationConnection.ts)
 * that the checklist renders — never statuses' raw provider data.
 */
export interface OnboardingProviderEntry {
  readonly provider: string;
  /** Public manifest display name (null when unregistered). */
  readonly name: string | null;
  readonly ready: boolean;
  readonly reconnectNeeded: boolean;
  /** Whether THIS user may (re)connect it (role-aware). */
  readonly canConnect: boolean;
  /** True when an owner/admin must connect (account-class provider, member caller). */
  readonly adminRequired: boolean;
}

export interface OnboardingStepDTO {
  readonly key: OnboardingStepKey;
  readonly status: OnboardingStepStatus;
  readonly blockedReason?: OnboardingStepBlockedReason;
  /**
   * Step-specific safe detail:
   *  - connect: providers the selected workflow requires.
   *  - test: whether the workflow supports an in-builder test (manual trigger)
   *    and whether it is "waiting for first run" post-activation.
   */
  readonly providers?: readonly OnboardingProviderEntry[];
  readonly testable?: boolean;
  readonly waitingForFirstRun?: boolean;
  readonly lastRunFailed?: boolean;
}

export interface OnboardingSelectedWorkflowDTO {
  readonly id: string;
  readonly name: string;
  readonly state: string;
  /** True when the workflow has a native manual trigger (test path exists). */
  readonly testable: boolean;
}

export interface OnboardingWorkflowOptionDTO {
  readonly id: string;
  readonly name: string;
}

export interface OnboardingPresentationDTO {
  readonly dismissed: boolean;
  readonly minimized: boolean;
  readonly videoWatched: boolean;
  /** True until the completion celebration has been shown once. */
  readonly celebrationPending: boolean;
}

export interface OnboardingChecklistDTO {
  /** False when the feature flag is off (everything else absent). */
  readonly enabled: boolean;
  readonly completed?: boolean;
  readonly completedAt?: string | null;
  /** Completion provenance (null when the workflow was since deleted). */
  readonly completionWorkflow?: { readonly id: string; readonly name: string } | null;
  readonly presentation?: OnboardingPresentationDTO;
  readonly selectedWorkflow?: OnboardingSelectedWorkflowDTO | null;
  /** Non-deleted account workflows for the picker (ids + names only). */
  readonly workflowOptions?: readonly OnboardingWorkflowOptionDTO[];
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
  z
    .object({
      action: z.literal("select_workflow"),
      workflowId: z.string().uuid(),
    })
    .strict(),
]);

export type OnboardingPresentationAction = z.infer<
  typeof OnboardingPresentationActionSchema
>;
