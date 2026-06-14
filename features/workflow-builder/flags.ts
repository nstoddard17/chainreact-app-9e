/**
 * Client-readable feature flags for the workflow builder (Slice 4.AI-CONFIG-ASSIST-3).
 *
 * First client-side flag in the builder. Read from a `NEXT_PUBLIC_` env var so it
 * is available in the browser bundle at build time. Default OFF — the gated
 * behavior is inert in production until Marcus flips it on. Keep this minimal:
 * one accessor per flag, no flag-framework.
 */

/** Env var gating the experimental chat-fill affordance. Default OFF. */
export const CHAT_FILL_FLAG = "NEXT_PUBLIC_ENABLE_AI_CHAT_FILL";

/**
 * Whether the AI panel may offer to place a chat-typed value into the
 * currently-highlighted pending config field (AI-CONFIG-ASSIST). Default OFF —
 * when unset/false the composer behaves exactly as before (no interception).
 */
export function isChatFillEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ENABLE_AI_CHAT_FILL === "true";
}
