/**
 * Team-invitation transactional email (TEAM-INVITATION-EMAIL-1).
 *
 * Renders both HTML and plain-text bodies. Written for a recipient who may
 * have never heard of ChainReact: it names the team, who invited them, the
 * role in plain language, the expiry, the need to sign in / create an account
 * with THIS address, and a "you can ignore this" security note.
 *
 * Injection safety: every dynamic value (team name, inviter identity — both
 * user-controlled) is HTML-escaped in the HTML body and control-stripped in
 * the subject, so an account named "<script>…" or an inviter display name
 * containing markup renders as inert text. The accept URL is built by the
 * caller from the canonical configured app origin (never request-derived) and
 * is attribute-escaped where interpolated.
 *
 * Scope: no member lists, workflow data, billing data, or any account content
 * beyond the team's display name.
 */

export interface TeamInvitationEmailInput {
  teamName: string;
  /** Safe display identity of the inviter (display name or their email); null → generic copy. */
  inviterName: string | null;
  role: "admin" | "member";
  /** Full canonical accept URL (origin + /invitations/accept?token=…). */
  acceptUrl: string;
  /**
   * Short OPAQUE per-invitation reference (derived from the invitation id —
   * NEVER the token or its hash). Rendered in the subject and body so a
   * recipient — and Gmail's conversation threading — can tell invitation
   * emails apart when several were sent for the same team
   * (TEAM-INVITATION-HUMAN-JOURNEY-4: identical subjects were threaded and a
   * recipient followed an older, already-used invitation's link).
   */
  invitationRef: string;
  /** When this invitation was created (ISO). Shown as a sent timestamp. */
  sentAtIso: string;
}

export interface RenderedTransactionalEmail {
  subject: string;
  html: string;
  text: string;
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

const ROLE_LINE: Record<TeamInvitationEmailInput["role"], string> = {
  admin:
    "You've been invited as an Admin — you'll be able to manage workflows and invite or manage team members.",
  member:
    "You've been invited as a Member — you'll be able to collaborate on the team's workflows.",
};

/** Human-readable UTC stamp, e.g. "Jul 26, 2026, 14:05 UTC". Falls back to the raw value. */
function toSentStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return toSubjectSafe(iso);
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}

export function renderTeamInvitationEmail(
  input: TeamInvitationEmailInput,
): RenderedTransactionalEmail {
  const teamPlain = toSubjectSafe(input.teamName);
  const refPlain = toSubjectSafe(input.invitationRef);
  // The ref in the SUBJECT makes every invitation email unique, so mail
  // clients (Gmail especially) don't collapse successive invitations into one
  // thread where an older, already-used link is easy to click by mistake.
  const subject = `You've been invited to join ${teamPlain} on ChainReact (invite ${refPlain})`;
  const sentStamp = toSentStamp(input.sentAtIso);

  const inviterPlain = input.inviterName ? toSubjectSafe(input.inviterName) : null;
  const introPlain = inviterPlain
    ? `${inviterPlain} invited you to join ${teamPlain} on ChainReact.`
    : `You've been invited to join ${teamPlain} on ChainReact.`;

  const roleLine = ROLE_LINE[input.role];
  // TEAM-INVITATION-LIFECYCLE-2: invitations do not expire — no expiry wording.
  const validityLine =
    "This invitation stays active until it's accepted or canceled by the team.";
  // TEAM-INVITATION-HUMAN-JOURNEY-4: identify THIS message so the newest
  // invitation is unmistakable even when older invitation emails exist.
  const referenceLine = `Invitation reference ${refPlain} · sent ${sentStamp}.`;
  const newestLine =
    "If you received more than one invitation email for this team, use the most recent one — earlier links may already be used or canceled.";
  const identityLine =
    "To accept, sign in — or create a free ChainReact account — using the email address this invitation was sent to.";
  const securityLine =
    "If you weren't expecting this invitation, you can safely ignore this email — nothing happens unless the link is used.";

  const text = [
    introPlain,
    "",
    roleLine,
    "",
    "Accept the invitation:",
    input.acceptUrl,
    "",
    identityLine,
    validityLine,
    referenceLine,
    newestLine,
    "",
    securityLine,
    "",
    "— ChainReact · Workflow automation",
  ].join("\n");

  const teamHtml = escapeHtml(teamPlain);
  const introHtml = inviterPlain
    ? `<strong>${escapeHtml(inviterPlain)}</strong> invited you to join <strong>${teamHtml}</strong> on ChainReact.`
    : `You've been invited to join <strong>${teamHtml}</strong> on ChainReact.`;
  const urlAttr = escapeHtml(input.acceptUrl);

  const html = `
<div style="margin:0;padding:24px;background-color:#f6f7f9;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2430;">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e4e7ec;border-radius:12px;padding:32px;">
    <p style="margin:0 0 4px;font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#6366f1;">ChainReact</p>
    <h1 style="margin:0 0 16px;font-size:20px;line-height:1.35;">You're invited to a team</h1>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">${introHtml}</p>
    <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#4b5563;">${escapeHtml(roleLine)}</p>
    <p style="margin:0 0 24px;">
      <a href="${urlAttr}" style="display:inline-block;background:#6366f1;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 24px;border-radius:8px;">Accept invitation</a>
    </p>
    <p style="margin:0 0 6px;font-size:12px;color:#6b7280;">Or paste this link into your browser:</p>
    <p style="margin:0 0 20px;font-size:12px;word-break:break-all;"><a href="${urlAttr}" style="color:#6366f1;">${urlAttr}</a></p>
    <p style="margin:0 0 6px;font-size:13px;line-height:1.6;color:#4b5563;">${escapeHtml(identityLine)}</p>
    <p style="margin:0 0 6px;font-size:13px;line-height:1.6;color:#4b5563;">${escapeHtml(validityLine)}</p>
    <p style="margin:0 0 6px;font-size:12px;line-height:1.6;color:#6b7280;">${escapeHtml(referenceLine)}</p>
    <p style="margin:0 0 20px;font-size:12px;line-height:1.6;color:#6b7280;">${escapeHtml(newestLine)}</p>
    <hr style="border:none;border-top:1px solid #e4e7ec;margin:0 0 16px;" />
    <p style="margin:0;font-size:12px;line-height:1.6;color:#9ca3af;">${escapeHtml(securityLine)}</p>
  </div>
  <p style="max-width:520px;margin:16px auto 0;font-size:11px;color:#9ca3af;text-align:center;">ChainReact · Workflow automation</p>
</div>`.trim();

  return { subject, html, text };
}
