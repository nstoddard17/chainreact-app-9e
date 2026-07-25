import { test, expect } from "@playwright/test";
import {
  adminClient,
  createTestUser,
  deleteTestUser,
  signInViaEmailLink,
  type TestUser,
} from "./helpers/supabaseAdmin";

/**
 * TEAM-INVITATION-EMAIL-1 — the complete BRAND-NEW-USER invitation journey.
 *
 * The onboarding-checklist spec already proves signed-in acceptance for
 * existing users; this spec proves the path an invitee takes when they have
 * never had a ChainReact account:
 *
 *   invitation created (owner, real route + service + DB row)
 *   → signed-out visit to the emailed accept URL
 *   → bounced through /auth/sign-in with the EXACT invitation URL as returnTo
 *   → the sign-in page's "Sign up free" link carries that returnTo onward
 *   → (account created for the invited address — admin-created because this
 *      Supabase project enforces CAPTCHA on interactive signup locally; the
 *      OTP signup flow's returnTo plumbing is pinned by unit tests)
 *   → session established via the app's own /auth/callback, next = accept URL
 *   → the accept page renders WITHOUT consuming the single-use token
 *   → the human explicitly clicks Accept (the only mutating step)
 *   → membership row exists, invitation is accepted, the joined team is the
 *     invitee's active account, and they land on /workflows.
 *
 * Also pinned: a scanner/preview-style signed-out GET of the accept URL does
 * NOT consume the invitation, and the create response carries the typed
 * `emailDelivery.status` (in this env "not_configured" — no RESEND_API_KEY —
 * which is exactly the state the copy-link fallback exists for; provider
 * delivery itself is proven at the unit layer against a mocked Resend HTTP
 * boundary).
 *
 * Everything else is real: auth, routes, invitation service, token hashing,
 * membership writes, account activation. Run serially (shared dev server).
 */

test.describe("TEAM-INVITATION-EMAIL-1 — new-user invitation journey", () => {
  test.describe.configure({ timeout: 120_000 });

  let owner: TestUser | null = null;
  let invitee: TestUser | null = null;
  let teamId: string | null = null;

  test.afterEach(async () => {
    // Invitee first: their membership in the owner's team must go before the
    // team account (owned by `owner`) is cascaded away.
    if (invitee) {
      await deleteTestUser(invitee.id);
      invitee = null;
    }
    if (owner) {
      await deleteTestUser(owner.id);
      owner = null;
    }
    teamId = null;
  });

  async function invitationRow() {
    if (!teamId) throw new Error("no team yet");
    const { data, error } = await adminClient()
      .from("account_invitations")
      .select("id, status, role, accepted_by_user_id")
      .eq("account_id", teamId)
      .maybeSingle();
    if (error) throw new Error(`invitation lookup failed: ${error.message}`);
    return data as {
      id: string;
      status: string;
      role: string;
      accepted_by_user_id: string | null;
    } | null;
  }

  test("signed-out invite link → auth round trip preserves the URL → explicit accept joins + activates the team", async ({
    page,
    browser,
  }) => {
    owner = await createTestUser();
    const invitedEmail = `e2e-invitee-${crypto.randomUUID()}@chainreact.test`;

    // ── Owner: real team + real invitation to a brand-new address ──
    await signInViaEmailLink(page, owner);
    const createdTeam = await page.request.post("/api/accounts", {
      data: { name: "E2E Invite Email Team", type: "team" },
    });
    expect(createdTeam.status(), await createdTeam.text()).toBe(201);
    teamId = ((await createdTeam.json()) as { account: { id: string } }).account.id;

    const invited = await page.request.post(`/api/accounts/${teamId}/invitations`, {
      data: { email: invitedEmail, role: "member" },
    });
    expect(invited.status(), await invited.text()).toBe(201);
    const body = (await invited.json()) as {
      ok: boolean;
      acceptToken: string;
      acceptPath: string;
      emailDelivery: { status: string };
    };
    expect(body.ok).toBe(true);
    expect(body.acceptPath).toBe(
      `/invitations/accept?token=${encodeURIComponent(body.acceptToken)}`,
    );
    // Typed delivery state — this env has no email credentials, and that must
    // NOT have blocked the invitation or the one-time link.
    expect(["sent", "failed", "not_configured"]).toContain(body.emailDelivery.status);
    expect((await invitationRow())?.status).toBe("pending");

    // ── Invitee (no account yet), fresh signed-out browser context ──
    const inviteeCtx = await browser.newContext();
    const inviteePage = await inviteeCtx.newPage();
    try {
      // A scanner/link-preview-style GET must not consume the invitation.
      const scannerGet = await inviteePage.request.get(body.acceptPath);
      expect(scannerGet.status()).toBeLessThan(500);
      expect((await invitationRow())?.status).toBe("pending");

      // The human opens the emailed link: bounced to sign-in carrying the
      // exact invitation URL, and the sign-up handoff preserves it.
      await inviteePage.goto(body.acceptPath);
      await inviteePage.waitForURL(/\/auth\/sign-in\?/);
      const signInUrl = new URL(inviteePage.url());
      expect(signInUrl.searchParams.get("returnTo")).toBe(body.acceptPath);
      await expect(
        inviteePage.getByRole("link", { name: /sign up free/i }),
      ).toHaveAttribute(
        "href",
        `/auth/sign-up?returnTo=${encodeURIComponent(body.acceptPath)}`,
      );
      expect((await invitationRow())?.status).toBe("pending");

      // Account for the invited address (see header comment re: CAPTCHA), then
      // a real session via the app's own callback, returning to the invite URL.
      const { data, error } = await adminClient().auth.admin.createUser({
        email: invitedEmail,
        password: `e2e-${crypto.randomUUID()}-pw!`,
        email_confirm: true,
      });
      if (error || !data.user) throw new Error(`invitee createUser failed: ${error?.message}`);
      invitee = { id: data.user.id, email: invitedEmail, password: "unused" };

      await signInViaEmailLink(inviteePage, invitee, { next: body.acceptPath });
      await inviteePage.waitForURL(/\/invitations\/accept\?/);

      // Rendering the accept page is a safe GET — still pending, explicit
      // button present, signed-in identity shown.
      await expect(
        inviteePage.getByTestId("accept-invitation-submit"),
      ).toBeVisible();
      await expect(
        inviteePage.getByTestId("accept-invitation-identity"),
      ).toContainText(invitedEmail);
      expect((await invitationRow())?.status).toBe("pending");

      // The ONLY mutating step: the human clicks Accept.
      await Promise.all([
        inviteePage.waitForURL(/\/workflows/),
        inviteePage.getByTestId("accept-invitation-submit").click(),
      ]);

      // Membership + invitation + activation are all settled in the DB.
      const invite = await invitationRow();
      expect(invite?.status).toBe("accepted");
      expect(invite?.accepted_by_user_id).toBe(invitee.id);

      const { data: membership } = await adminClient()
        .from("account_memberships")
        .select("role")
        .eq("account_id", teamId!)
        .eq("user_id", invitee.id)
        .maybeSingle();
      expect(membership?.role).toBe("member");

      const { data: profile } = await adminClient()
        .from("user_profiles")
        .select("active_account_id")
        .eq("id", invitee.id)
        .maybeSingle();
      expect(profile?.active_account_id).toBe(teamId);
    } finally {
      await inviteeCtx.close();
    }
  });
});
