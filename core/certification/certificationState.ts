/**
 * Provider certification state model (CS-4 MCP-DRIFT).
 *
 * A small, PROVIDER-AGNOSTIC vocabulary for "how much do we trust this
 * integration right now, and may a workflow execute it?" Introduced for the MCP
 * catalog (where vendor-owned servers can change under us), but deliberately
 * free of any MCP concept so native providers can adopt the SAME states later
 * (unified provider certification) without a rename.
 *
 * This module is PURE (no I/O, no MCP, no provider imports) — it lives in
 * `core/` legally and is consumed by the drift classifier, the runtime
 * execution gate, and the internal review report alike, so the meaning of each
 * state never forks between surfaces.
 *
 * The states are a HEALTH axis, not a lifecycle timeline — a provider moves
 * between them as evidence changes:
 *   - experimental          — shipped but hidden from the catalog; not yet
 *                             live-certified (Linear today). Runs.
 *   - healthy               — certified and matching the live server. Runs.
 *   - needs_review          — a non-breaking change was observed; safe to keep
 *                             running while a human re-certifies. Runs.
 *   - certification_pending — queued for (re)certification; still functioning
 *                             against the pinned schema. Runs.
 *   - deprecated            — being phased out but still works. Runs (warn).
 *   - blocked               — unsafe to execute (breaking drift, removed/renamed
 *                             tool, ambiguous schema change). Does NOT run.
 *
 * ONLY `blocked` withholds execution. Everything else runs; the difference is
 * how loudly we flag it for review. The runtime gate reads `executionAllowed`
 * from here so "which states run" has exactly one definition.
 */

export type CertificationState =
  | "experimental"
  | "healthy"
  | "needs_review"
  | "certification_pending"
  | "deprecated"
  | "blocked";

export interface CertificationStateInfo {
  readonly state: CertificationState;
  /** Plain-language label — no protocol jargon, safe to show a user. */
  readonly label: string;
  /** One-line plain-language meaning. */
  readonly description: string;
  /** May a workflow execute an action in this state? Only `blocked` is false. */
  readonly executionAllowed: boolean;
  /** Whether this state should be surfaced for human review / re-certification. */
  readonly needsReview: boolean;
  readonly severity: "info" | "warning" | "error";
}

export const CERTIFICATION_STATES: Readonly<Record<CertificationState, CertificationStateInfo>> = {
  experimental: {
    state: "experimental",
    label: "Experimental",
    description: "Available but not yet fully certified.",
    executionAllowed: true,
    needsReview: false,
    severity: "info",
  },
  healthy: {
    state: "healthy",
    label: "Healthy",
    description: "Certified and matching the connected app.",
    executionAllowed: true,
    needsReview: false,
    severity: "info",
  },
  needs_review: {
    state: "needs_review",
    label: "Being reviewed",
    description: "The connected app changed in a non-breaking way; ChainReact is reviewing it.",
    executionAllowed: true,
    needsReview: true,
    severity: "warning",
  },
  certification_pending: {
    state: "certification_pending",
    label: "Certification pending",
    description: "Queued for certification; still running against the reviewed version.",
    executionAllowed: true,
    needsReview: true,
    severity: "info",
  },
  deprecated: {
    state: "deprecated",
    label: "Deprecated",
    description: "Being phased out but still working.",
    executionAllowed: true,
    needsReview: true,
    severity: "warning",
  },
  blocked: {
    state: "blocked",
    label: "Paused for safety",
    description: "The connected app changed in a way ChainReact hasn't reviewed; execution is paused so no data is sent against an unknown version.",
    executionAllowed: false,
    needsReview: true,
    severity: "error",
  },
};

export const ALL_CERTIFICATION_STATES = Object.keys(
  CERTIFICATION_STATES,
) as ReadonlyArray<CertificationState>;

export function certificationStateInfo(state: CertificationState): CertificationStateInfo {
  return CERTIFICATION_STATES[state];
}

/** Single source of truth for "may a workflow execute an action in this state?". */
export function isExecutionAllowed(state: CertificationState): boolean {
  return CERTIFICATION_STATES[state].executionAllowed;
}
