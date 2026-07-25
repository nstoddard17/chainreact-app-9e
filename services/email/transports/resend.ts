import type {
  EmailDeliveryResult,
  TransactionalEmailMessage,
} from "@/services/email/transport";

/**
 * Resend HTTP transport for ChainReact system email (TEAM-INVITATION-EMAIL-1).
 *
 * Env contract (server-side only, read per call so tests can vary them):
 *   - RESEND_API_KEY            — Resend secret key.
 *   - TRANSACTIONAL_EMAIL_FROM  — verified sender, e.g. "ChainReact <invites@chainreact.app>".
 *
 * Failure semantics: NEVER throws. A missing config returns `not_configured`;
 * everything else maps to the typed result. One bounded retry for clearly
 * transient failures only (network error, timeout, provider 5xx). Permanent
 * 4xx responses are NOT retried — the caller's durable record (e.g. the
 * invitation row) is the source of truth and the UI falls back to the copyable
 * link.
 *
 * No-leak: results and errors carry FIXED reason codes only. The API key, the
 * Authorization header, the recipient, the message body, and the provider
 * response text never appear in a return value, thrown error, or log.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const REQUEST_TIMEOUT_MS = 10_000;

export function isResendConfigured(): boolean {
  return Boolean(
    process.env.RESEND_API_KEY && process.env.TRANSACTIONAL_EMAIL_FROM,
  );
}

type AttemptOutcome =
  | { kind: "sent" }
  | { kind: "permanent"; reason: string }
  | { kind: "transient"; reason: string };

async function attemptSend(
  message: TransactionalEmailMessage,
  apiKey: string,
  from: string,
): Promise<AttemptOutcome> {
  let response: Response;
  try {
    response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    // AbortSignal.timeout rejects with a TimeoutError DOMException; anything
    // else is a network-level failure. Both are transient. The caught error is
    // deliberately discarded — its message could reference the request.
    const isTimeout = err instanceof Error && err.name === "TimeoutError";
    return { kind: "transient", reason: isTimeout ? "timeout" : "network_error" };
  }

  if (response.ok) return { kind: "sent" };
  if (response.status >= 500) {
    return { kind: "transient", reason: `provider_${response.status}` };
  }
  return { kind: "permanent", reason: `provider_${response.status}` };
}

export async function sendViaResend(
  message: TransactionalEmailMessage,
): Promise<EmailDeliveryResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.TRANSACTIONAL_EMAIL_FROM;
  if (!apiKey || !from) return { status: "not_configured" };

  const first = await attemptSend(message, apiKey, from);
  if (first.kind === "sent") return { status: "sent" };
  if (first.kind === "permanent") return { status: "failed", reason: first.reason };

  // Single bounded retry for the transient class only.
  const second = await attemptSend(message, apiKey, from);
  if (second.kind === "sent") return { status: "sent" };
  return { status: "failed", reason: second.reason };
}
