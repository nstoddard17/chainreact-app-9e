/**
 * ANON-BUILDER-2 — contextual auth copy for the anonymous-builder gates.
 *
 * When a logged-out visitor clicks Save / Activate / Run / Connect / paid AI in
 * the local-only builder, they're sent to sign-up/sign-in with a `reason` query
 * param. The auth page shows the matching contextual line so the prompt never
 * reads as a dead redirect.
 */

import { isAnonGateReason, type AnonGateReason } from "@/lib/anonymousBuilder";

/** The gate reason union is the single source of truth in lib/anonymousBuilder. */
export type AuthReturnReason = AnonGateReason;

const REASON_ACTION: Record<AuthReturnReason, string> = {
  save: "save this workflow",
  activate: "activate this workflow",
  run: "run this workflow",
  connect: "connect apps",
  ai: "use React Agent",
};

export function isAuthReturnReason(value: unknown): value is AuthReturnReason {
  return isAnonGateReason(value);
}

/**
 * The contextual line, e.g. "Create an account to save this workflow." (sign-up)
 * or "Sign in to save this workflow." (sign-in). Returns null for an unknown /
 * absent reason so the page falls back to its default heading.
 */
export function authReasonLine(
  reason: string | undefined,
  mode: "sign-up" | "sign-in",
): string | null {
  if (!isAuthReturnReason(reason)) return null;
  const verb = mode === "sign-up" ? "Create an account to" : "Sign in to";
  return `${verb} ${REASON_ACTION[reason]}.`;
}
