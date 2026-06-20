/**
 * Sanitized global-learning contracts (HOSTED-HERMES-GUIDANCE-BRAIN-2).
 *
 * THE PRIVATE → GLOBAL BOUNDARY. A `SanitizedSkillEvent` is the ONLY shape allowed to leave an
 * account's private guidance session and enter global learning. It is generalized + de-identified
 * BY CONSTRUCTION:
 *   - NO accountId / userId / workflowId / sessionId,
 *   - NO raw conversation text, goal text, or any user-authored prose,
 *   - NO config values, secrets, tokens, provider credentials, or PII,
 *   - ONLY capability SHAPE (provider/type/role sequences) + safe outcome + safe counts.
 *
 * `GuidancePattern` is an aggregate over many skill events — also fully generalized, global,
 * never carrying private data. These types make the unsafe fields unrepresentable; the
 * `skillEventBoundary` service is the enforcement point and the tests pin it.
 */

export const SKILL_EVENT_SCHEMA_VERSION = 1 as const;

export type SkillEventKind =
  | "guidance_session_started"
  | "workflow_plan_proposed"
  | "workflow_plan_accepted"
  | "workflow_plan_rejected";

export type SkillEventOutcome = "proposed" | "accepted" | "rejected" | "abandoned";

/** A single generalized capability step — provider/type/role only (no ids, no config). */
export interface GeneralizedSkillStep {
  readonly role: "trigger" | "action" | "logic";
  readonly provider: string;
  readonly type: string;
}

/**
 * The de-identified learning signal. Crosses from a private account session into global
 * aggregation. Has NO field for any private identifier or raw text.
 */
export interface SanitizedSkillEvent {
  readonly schemaVersion: number;
  readonly eventKind: SkillEventKind;
  readonly outcome: SkillEventOutcome;
  /** Generalized step sequence (capability shape only). */
  readonly steps: readonly GeneralizedSkillStep[];
  readonly stepCount: number;
  /** Distinct provider ids involved (capability ids, not user data). */
  readonly providers: readonly string[];
  /** Whether every step validated against the ChainReact capability registry. */
  readonly allStepsValidated: boolean;
}

/**
 * A generalized, reusable pattern aggregated from many `SanitizedSkillEvent`s. Global, never
 * private. Support is a COUNT — never the contributing accounts/users.
 */
export interface GuidancePattern {
  readonly id: string;
  readonly patternKind: "provider_sequence";
  /** The provider/type/role sequence this pattern represents. */
  readonly steps: readonly GeneralizedSkillStep[];
  /** How many sanitized events support this pattern (count only). */
  readonly supportCount: number;
}
