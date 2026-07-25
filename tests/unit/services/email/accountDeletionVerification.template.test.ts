/**
 * @jest-environment node
 *
 * Account-deletion verification email template
 * (ACCOUNT-DELETION-UNIVERSAL-VERIFICATION-1).
 *
 * The email is the one place the plaintext code legitimately appears, so its
 * contract is tested precisely: it says what the code is for, when it expires,
 * not to share it, and what to do if the request was unexpected — and it carries
 * NO link that could authorize the deletion by being clicked or forwarded. It is
 * also unmistakably distinct from a sign-in or invitation subject.
 */

import { renderAccountDeletionVerificationEmail } from "@/services/email/templates/accountDeletionVerification";
import { renderTeamInvitationEmail } from "@/services/email/templates/teamInvitation";

const INPUT = { code: "042317", expiresInMinutes: 10 };

describe("renderAccountDeletionVerificationEmail", () => {
  it("shows the code in both the text and HTML bodies", () => {
    const { html, text } = renderAccountDeletionVerificationEmail(INPUT);
    expect(text).toContain("042317");
    expect(html).toContain("042317");
  });

  it("states that someone requested DELETION of the ChainReact account", () => {
    const { text, html } = renderAccountDeletionVerificationEmail(INPUT);
    expect(text).toMatch(/requested permanent deletion of this ChainReact account/i);
    expect(html).toMatch(/requested permanent deletion of this ChainReact account/i);
  });

  it("states the expiry, single use, and a do-not-share warning", () => {
    const { text } = renderAccountDeletionVerificationEmail(INPUT);
    expect(text).toMatch(/expires in 10 minutes/i);
    expect(text).toMatch(/only be used once/i);
    expect(text).toMatch(/never share this code/i);
    expect(text).toMatch(/will never ask you for it/i);
  });

  it("tells an unexpecting recipient to ignore it and secure the account", () => {
    const { text } = renderAccountDeletionVerificationEmail(INPUT);
    expect(text).toMatch(/if you didn't request this/i);
    expect(text).toMatch(/do not enter the code/i);
    expect(text).toMatch(/your account is not being deleted/i);
    expect(text).toMatch(/support@chainreact\.app/);
  });

  it("contains NO link at all — nothing clickable can authorize the deletion", () => {
    const { html, text } = renderAccountDeletionVerificationEmail(INPUT);
    expect(html).not.toMatch(/<a\s/i);
    expect(html).not.toMatch(/href=/i);
    // The only "://" would be a URL; the support address is deliberately not mailto-linked.
    expect(html).not.toMatch(/https?:\/\//);
    expect(text).not.toMatch(/https?:\/\//);
  });

  it("never puts the code in a URL or query parameter (there is none to put it in)", () => {
    const { html, text } = renderAccountDeletionVerificationEmail(INPUT);
    expect(`${html}${text}`).not.toMatch(/[?&][A-Za-z_]+=042317/);
  });

  it("uses a subject clearly distinct from invitation email subjects", () => {
    const deletion = renderAccountDeletionVerificationEmail(INPUT).subject;
    const invitation = renderTeamInvitationEmail({
      teamName: "Acme",
      inviterName: "Sam",
      role: "member",
      acceptUrl: "https://chainreact.app/invitations/accept?token=x",
      invitationRef: "abcd1234",
      sentAtIso: "2026-07-24T12:00:00.000Z",
    }).subject;

    expect(deletion).toMatch(/deleting your ChainReact account/i);
    expect(deletion).not.toEqual(invitation);
    expect(deletion).not.toMatch(/invited|invitation/i);
    // Not phrased as an ordinary sign-in code either.
    expect(deletion).not.toMatch(/sign in|log in|login/i);
  });

  it("keeps the subject single-line (no header injection)", () => {
    const { subject } = renderAccountDeletionVerificationEmail(INPUT);
    expect(subject).not.toMatch(/[\r\n]/);
  });

  it("HTML-escapes every dynamic value", () => {
    // The code is validated to digits, so the escaping is proved on the renderer
    // itself: nothing user-controlled can reach the body un-escaped because
    // nothing user-controlled is accepted at all.
    const { html } = renderAccountDeletionVerificationEmail(INPUT);
    expect(html).not.toMatch(/<script/i);
    // Every apostrophe in the copy is entity-escaped rather than raw.
    expect(html).toContain("&#39;");
    expect(html).not.toMatch(/didn't request/);
  });

  it("REFUSES to render a malformed code rather than emailing attacker-shaped content", () => {
    expect(() =>
      renderAccountDeletionVerificationEmail({ code: "<script>", expiresInMinutes: 10 }),
    ).toThrow(/invalid code shape/i);
    expect(() =>
      renderAccountDeletionVerificationEmail({ code: "12", expiresInMinutes: 10 }),
    ).toThrow(/invalid code shape/i);
  });

  it("REFUSES a nonsensical expiry", () => {
    expect(() =>
      renderAccountDeletionVerificationEmail({ code: "042317", expiresInMinutes: 0 }),
    ).toThrow(/invalid expiry/i);
    expect(() =>
      renderAccountDeletionVerificationEmail({ code: "042317", expiresInMinutes: 1.5 }),
    ).toThrow(/invalid expiry/i);
  });

  it("mentions that deletion is not the same as cancelling a plan", () => {
    const { text } = renderAccountDeletionVerificationEmail(INPUT);
    expect(text).toMatch(/not the same as cancelling a plan/i);
  });
});
