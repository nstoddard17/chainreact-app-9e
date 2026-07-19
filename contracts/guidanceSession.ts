/**
 * Hosted-Hermes workflow-guidance SESSION contracts (HOSTED-HERMES-GUIDANCE-BRAIN-2).
 *
 * The conversational, account-scoped guidance model: a `GuidanceSession` of `GuidanceTurn`s
 * that helps a user who doesn't know how to build a workflow think through what they want to
 * automate, producing a safe `WorkflowPlan`.
 *
 * PRIVACY LAYERS (read alongside contracts/guidanceSkillEvents.ts):
 *   - `GuidanceSession` / `GuidanceTurn` / `WorkflowGuidanceIntent` are PRIVATE + account-scoped.
 *     They may carry the user's own words. They are NEVER promoted raw into global learning —
 *     only a sanitized, generalized `SanitizedSkillEvent` derived from them may go global.
 *   - `WorkflowPlan` is advisory output: `notApplied: true` always. It NEVER carries secrets,
 *     credentials, or connection identity. A step MAY carry `config` values, but ONLY ones the
 *     user explicitly supplied (REACT-CONFIG-COVERAGE-1) — sanitized against registry FieldMeta
 *     (secret/connection fields stripped) before the plan is trusted. Every trigger/action step's
 *     `provider`/`type` is validated against the ChainReact capability registry (Hermes may
 *     hallucinate capabilities; ChainReact is the source of truth). NOTHING here mutates a
 *     workflow. The skill-event boundary still promotes ONLY role/provider/type — step config
 *     never reaches global learning.
 */

export const WORKFLOW_PLAN_SCHEMA_VERSION = 1 as const;

export type GuidanceSessionStatus = "open" | "planned" | "closed";

export type GuidanceTurnRole = "user" | "assistant";

/** One conversational turn. `text` is PRIVATE (user words / Hermes reply) — never global. */
export interface GuidanceTurn {
  readonly id: string;
  readonly role: GuidanceTurnRole;
  readonly text: string;
  readonly createdAt: string;
}

/**
 * A private, account-scoped guidance conversation. NOT persisted by this slice (no migration);
 * if durable storage lands later it MUST be an account-scoped, RLS-gated table.
 */
export interface GuidanceSession {
  readonly id: string;
  /** Owning account — the V2 ownership spine. Guidance context stays account-scoped. */
  readonly accountId: string;
  /** The acting user (provenance). */
  readonly userId: string;
  /** Optional workflow the session is about. */
  readonly workflowId?: string;
  readonly status: GuidanceSessionStatus;
  readonly turns: readonly GuidanceTurn[];
  readonly createdAt: string;
}

/**
 * The user's parsed automation intent. Derived from the conversation; account-scoped (may name
 * the user's own apps/goal in their words). Feeds the safe-DTO prompt builder — NOT global.
 */
export interface WorkflowGuidanceIntent {
  /** Short, user-authored description of what they want to automate. */
  readonly goal: string;
  /** Optional provider ids the user mentioned interest in (validated downstream). */
  readonly providersOfInterest?: readonly string[];
  /** Open clarifying questions the assistant still needs answered. */
  readonly openQuestions?: readonly string[];
}

export type WorkflowPlanStepRole = "trigger" | "action" | "logic";

/**
 * One step of an advisory plan. `provider`/`type` are CLAIMS that must be validated against the
 * ChainReact capability registry. `requiredInputs` are field KEY names/labels only — never
 * values. No secrets, no resolved variables.
 *
 * `config` (REACT-CONFIG-COVERAGE-1) carries ONLY values the USER explicitly supplied in their own
 * request (or `{{...}}` upstream references / `[[EMAIL_n]]`-style placeholder tokens ChainReact
 * rebinds server-side). It is UNTRUSTED until `sanitizePlanStepConfigs` filters it against the
 * node's real registry `FieldMeta` (declared, non-secret, non-connection fields; type-checked) —
 * only the sanitized plan is surfaced or seeded. Credentials/tokens are unrepresentable: a
 * secret/connection-sensitivity key is stripped before the plan is trusted.
 */
export interface WorkflowPlanStep {
  /** In-plan handle, e.g. "s0". */
  readonly ref: string;
  readonly role: WorkflowPlanStepRole;
  /** Provider id claim (e.g. "stripe"). Validated against the registry for trigger/action. */
  readonly provider: string;
  /** Provider-scoped type claim (e.g. "payment_failed"). Validated for trigger/action. */
  readonly type: string;
  /** Plain-English purpose of the step (no config values). */
  readonly purpose: string;
  /** Field KEY names/labels the user would still need to provide — never values. */
  readonly requiredInputs?: readonly string[];
  /**
   * USER-SUPPLIED config values for this step's declared fields (required OR optional). Sanitized
   * against registry metadata before the plan is trusted; seeded into the draft node only on the
   * user's explicit Apply. Absent when the user supplied no field values.
   */
  readonly config?: Readonly<Record<string, unknown>>;
}

/**
 * The safe, advisory plan. Validated, capability-checked, never applied. The deterministic
 * ChainReact builder/validator/apply pipeline remains the only thing that can create or change
 * a real workflow — acting on a plan is a separate, approval-gated step (CS-7 `repair_apply`).
 */
export interface WorkflowPlan {
  readonly schemaVersion: number;
  readonly title: string;
  readonly summary: string;
  readonly steps: readonly WorkflowPlanStep[];
  /** Questions to ask the user before the plan is complete. */
  readonly clarifyingQuestions?: readonly string[];
  /** ALWAYS true — a plan describes; it never applied/created/changed anything. */
  readonly notApplied: true;
}
