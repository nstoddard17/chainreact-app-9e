import type {
  EmailDeliveryResult,
  TransactionalEmailMessage,
} from "@/services/email/transport";
import { isResendConfigured, sendViaResend } from "@/services/email/transports/resend";

/**
 * System-email entry point (TEAM-INVITATION-EMAIL-1). Feature services call
 * THIS, never a transport directly, so swapping/adding providers stays a
 * one-file change.
 *
 * NEVER throws — email is external delivery, and a provider outage must not
 * corrupt the caller's durable record (e.g. a persisted invitation). Failures
 * come back as the typed result AND emit one structured warning with SAFE
 * metadata only: the caller passes opaque ids (invitationId/accountId), never
 * the recipient address, subject, body, tokens, or URLs.
 */

export interface TransactionalEmailMeta {
  /** Template identifier, e.g. "team_invitation". */
  template: string;
  /** Safe opaque ids for observability. NO PII, tokens, or URLs. */
  [key: string]: string;
}

export async function sendTransactionalEmail(
  message: TransactionalEmailMessage,
  meta: TransactionalEmailMeta,
): Promise<EmailDeliveryResult> {
  if (!isResendConfigured()) {
    // Expected in local/test environments; a misconfigured production is
    // surfaced by the same structured line (and by the UI's "not sent" state).
    console.warn(
      JSON.stringify({
        event: "email.transactional.not_configured",
        provider: "resend",
        ...meta,
      }),
    );
    return { status: "not_configured" };
  }

  let result: EmailDeliveryResult;
  try {
    result = await sendViaResend(message);
  } catch {
    // sendViaResend never throws by contract; this is a belt-and-suspenders
    // catch so a transport bug still cannot break the caller. The error is
    // discarded — it could reference request internals.
    result = { status: "failed", reason: "transport_error" };
  }

  if (result.status !== "sent") {
    console.warn(
      JSON.stringify({
        event: "email.transactional.delivery_failed",
        provider: "resend",
        status: result.status,
        reason: result.status === "failed" ? result.reason : undefined,
        ...meta,
      }),
    );
  }
  return result;
}
