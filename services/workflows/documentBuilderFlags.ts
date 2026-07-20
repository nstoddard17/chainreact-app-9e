/**
 * Document Builder rollout flag (5.DUAL-BUILDER-1 / CS-1).
 *
 * Follows the established per-domain env-flag convention
 * (services/billing/billingFeatureFlags.ts): a named env var read at CALL
 * time, default OFF, no NEXT_PUBLIC_* — the server route resolves it and
 * threads a boolean prop to the client (same pattern as
 * `canUseAdvancedBranching`).
 *
 * OFF (default): the builder renders exactly as today — no Visual/Document
 * toggle, no Document surface mounted, zero DOM/behavior change.
 */

/** Env var name for the Document Builder view rollout flag. */
export const DOCUMENT_BUILDER_FLAG = "ENABLE_DOCUMENT_BUILDER";

/** True only when ENABLE_DOCUMENT_BUILDER === "true". Default false. */
export function isDocumentBuilderEnabled(): boolean {
  return process.env[DOCUMENT_BUILDER_FLAG] === "true";
}
