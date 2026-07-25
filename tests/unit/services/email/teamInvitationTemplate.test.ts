/**
 * @jest-environment node
 *
 * Team-invitation email template (TEAM-INVITATION-EMAIL-1). Proves both bodies
 * render the business content (team, role, URL, expiry, sign-in guidance,
 * security note), that hostile team/inviter values cannot inject HTML, and
 * that nothing beyond the intended fields appears.
 */
import { renderTeamInvitationEmail } from "@/services/email/templates/teamInvitation";

const BASE = {
  teamName: "Acme Rockets",
  inviterName: "Pat Owner",
  role: "member" as const,
  acceptUrl: "https://chainreact.app/invitations/accept?token=tok-123",
};

describe("renderTeamInvitationEmail", () => {
  it("renders subject, HTML, and plain text with team, role, and URL", () => {
    const r = renderTeamInvitationEmail(BASE);
    expect(r.subject).toBe("You've been invited to join Acme Rockets on ChainReact");

    for (const body of [r.html, r.text]) {
      expect(body).toContain("Acme Rockets");
      expect(body).toContain("Pat Owner");
      expect(body).toContain("Member");
      expect(body).toContain(BASE.acceptUrl);
      // The recipient may have no account yet — the path is spelled out.
      expect(body).toMatch(/create a free ChainReact account/i);
      expect(body).toMatch(/email address this invitation was sent to/i);
      // Security note for an unexpected recipient (apostrophe is HTML-escaped
      // in the HTML body).
      expect(body).toMatch(/weren(?:'|&#39;)t expecting this invitation/i);
    }
  });

  it("contains NO expiry wording — invitations are non-expiring (TEAM-INVITATION-LIFECYCLE-2)", () => {
    const r = renderTeamInvitationEmail(BASE);
    const all = r.subject + r.html + r.text;
    expect(all.toLowerCase()).not.toContain("expire");
    expect(all).not.toMatch(/seven days|7 days|7-day/i);
    // Instead it states the invitation stays active.
    expect(r.text).toMatch(/stays active until it(?:'|&#39;)s accepted or canceled/i);
  });

  it("describes the admin role in plain language", () => {
    const r = renderTeamInvitationEmail({ ...BASE, role: "admin" });
    expect(r.text).toMatch(/Admin/);
    expect(r.text).toMatch(/manage/i);
  });

  it("falls back to generic copy when no inviter identity is available", () => {
    const r = renderTeamInvitationEmail({ ...BASE, inviterName: null });
    expect(r.text).toContain("You've been invited to join Acme Rockets");
    expect(r.html).not.toContain("null");
  });

  it("escapes hostile team and inviter values in the HTML body", () => {
    const r = renderTeamInvitationEmail({
      ...BASE,
      teamName: `<script>alert("x")</script>`,
      inviterName: `<img src=x onerror=alert(1)>`,
    });
    expect(r.html).not.toContain("<script>");
    expect(r.html).not.toContain("<img src=x");
    expect(r.html).toContain("&lt;script&gt;");
    // Subject headers can't carry newlines from a hostile account name.
    const evil = renderTeamInvitationEmail({
      ...BASE,
      teamName: "Acme\r\nBcc: victim@example.com",
    });
    expect(evil.subject).not.toMatch(/[\r\n]/);
  });

  it("contains no unrelated account data and no secret-shaped content", () => {
    const r = renderTeamInvitationEmail(BASE);
    const all = r.subject + r.html + r.text;
    // Only the token embedded in the accept URL — no other credential material.
    expect(all).not.toMatch(/api[_-]?key/i);
    expect(all).not.toMatch(/RESEND/);
    expect(all).not.toMatch(/billing|payment|workflow data|member list/i);
  });
});
