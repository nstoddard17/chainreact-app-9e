import type { RenderedTransactionalEmail } from "@/services/email/templates/teamInvitation";

/**
 * Account-deletion verification-code email
 * (ACCOUNT-DELETION-UNIVERSAL-VERIFICATION-1).
 *
 * Sent to the VERIFIED address on the authenticated user's auth identity when
 * they ask to delete their ChainReact account. It is the universal step-up for
 * every auth provider — password, Google, email OTP, future SSO — so the copy
 * never mentions passwords or a specific sign-in method.
 *
 * DELIBERATELY LINKLESS. There is no "confirm deletion" button and no URL that
 * carries the code: the code is typed back into the session that requested it,
 * which is what makes the challenge session-bound. A one-click link in an email
 * would turn a forwarded/leaked message into an account-deletion authorization.
 *
 * Injection safety: the only dynamic values are a six-digit code and an integer
 * minute count, both of which are re-validated here (a non-conforming value
 * throws rather than rendering) and HTML-escaped anyway. The subject is
 * control-character stripped so no header can be injected through it.
 *
 * The subject is intentionally unlike sign-in and invitation subjects — a user
 * scanning their inbox must be able to tell an ACCOUNT DELETION request apart
 * from an ordinary login code at a glance.
 */

export interface AccountDeletionVerificationEmailInput {
  /** The six-digit code. Digits only. */
  code: string;
  /** Whole minutes until the code expires. */
  expiresInMinutes: number;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Subjects are single-line: strip CR/LF and other control chars. */
function toSubjectSafe(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\x00-\x1f\x7f]+/g, " ").trim();
}

export function renderAccountDeletionVerificationEmail(
  input: AccountDeletionVerificationEmailInput,
): RenderedTransactionalEmail {
  // Fail loudly rather than emailing a malformed/attacker-shaped "code". The
  // caller always passes a generated code, so this can only fire on a bug.
  if (!/^\d{4,10}$/.test(input.code)) {
    throw new Error("renderAccountDeletionVerificationEmail: invalid code shape.");
  }
  if (!Number.isInteger(input.expiresInMinutes) || input.expiresInMinutes <= 0) {
    throw new Error("renderAccountDeletionVerificationEmail: invalid expiry.");
  }

  const code = escapeHtml(input.code);
  const minutes = String(input.expiresInMinutes);
  const subject = toSubjectSafe(
    `Confirm deleting your ChainReact account — code ${input.code}`,
  );

  const introLine =
    "Someone requested permanent deletion of this ChainReact account. Enter this code in ChainReact to continue:";
  const expiryLine = `This code expires in ${minutes} minutes and can only be used once.`;
  const shareLine =
    "Never share this code. ChainReact will never ask you for it by email, chat, or phone.";
  const unexpectedLine =
    "If you didn't request this, do NOT enter the code. Your account is not being deleted. Sign in to ChainReact, review your account security, and contact support@chainreact.app if anything looks wrong.";
  const noteLine =
    "Deleting an account is not the same as cancelling a plan — if you only want to stop paying, cancel your subscription under Plan & billing instead.";

  const text = [
    "Confirm deleting your ChainReact account",
    "",
    introLine,
    "",
    input.code,
    "",
    expiryLine,
    shareLine,
    "",
    unexpectedLine,
    "",
    noteLine,
    "",
    "— ChainReact · Workflow automation",
  ].join("\n");

  const html = `
<div style="margin:0;padding:24px;background-color:#f6f7f9;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2430;">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e4e7ec;border-radius:12px;padding:32px;">
    <p style="margin:0 0 4px;font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#6366f1;">ChainReact</p>
    <h1 style="margin:0 0 16px;font-size:20px;line-height:1.35;">Confirm deleting your account</h1>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.6;">${escapeHtml(introLine)}</p>
    <p style="margin:0 0 20px;font-size:32px;font-weight:700;letter-spacing:0.32em;text-align:center;padding:16px 0;background:#f3f4f6;border-radius:8px;font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;">${code}</p>
    <p style="margin:0 0 6px;font-size:13px;line-height:1.6;color:#4b5563;">${escapeHtml(expiryLine)}</p>
    <p style="margin:0 0 20px;font-size:13px;line-height:1.6;color:#4b5563;">${escapeHtml(shareLine)}</p>
    <div style="margin:0 0 20px;padding:12px 16px;border:1px solid #f0b429;background:#fffaf0;border-radius:8px;">
      <p style="margin:0;font-size:13px;line-height:1.6;color:#7a4b00;">${escapeHtml(unexpectedLine)}</p>
    </div>
    <hr style="border:none;border-top:1px solid #e4e7ec;margin:0 0 16px;" />
    <p style="margin:0;font-size:12px;line-height:1.6;color:#9ca3af;">${escapeHtml(noteLine)}</p>
  </div>
  <p style="max-width:520px;margin:16px auto 0;font-size:11px;color:#9ca3af;text-align:center;">ChainReact · Workflow automation</p>
</div>`.trim();

  return { subject, html, text };
}
