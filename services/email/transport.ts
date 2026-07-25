/**
 * ChainReact system-email transport boundary (TEAM-INVITATION-EMAIL-1).
 *
 * This is ChainReact's OWN transactional email surface (account invitations,
 * future system notices) — it is NOT the workflow-action email path. Workflow
 * authors send email through their connected Gmail/Outlook/etc. integrations;
 * system email never touches a user-connected integration and never uses
 * Supabase Auth invite APIs (ChainReact owns its invitation lifecycle).
 *
 * Provider-specific HTTP details live behind this interface
 * (transports/resend.ts today) so future system emails reuse the seam without
 * coupling feature services to a vendor.
 */

export interface TransactionalEmailMessage {
  /** Normalized recipient address. */
  to: string;
  subject: string;
  html: string;
  text: string;
}

export type EmailDeliveryStatus = "sent" | "failed" | "not_configured";

/**
 * Typed delivery outcome. `reason` is a FIXED short code (e.g. "provider_422",
 * "timeout", "network_error") — never provider response text, never headers,
 * never anything derived from the message body — so it is safe to log and to
 * bubble toward telemetry. "sent" means the provider actually accepted the
 * message; callers must never claim delivery otherwise.
 */
export type EmailDeliveryResult =
  | { status: "sent" }
  | { status: "failed"; reason: string }
  | { status: "not_configured" };
