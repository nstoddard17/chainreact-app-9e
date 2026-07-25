import { test, expect } from "@playwright/test";
import {
  adminClient,
  createTestUser,
  deleteTestUser,
  signInViaEmailLink,
  type TestUser,
} from "./helpers/supabaseAdmin";

/**
 * TEAM-INVITATION-EMAIL-1 / TEAM-INVITATION-LIFECYCLE-2 — the complete
 * BRAND-NEW-USER invitation journey, against LOCAL Supabase (never prod).
 *
 * The onboarding-checklist spec already proves signed-in acceptance for
 * existing users; this spec proves the path an invitee takes when they have
 * never had a ChainReact account, PLUS the lifecycle-2 rules:
 *
 *   owner invites chainreactapp@gmail.com as MEMBER (real route + DB row)
 *   → signed-out visit to the emailed accept URL
 *   → bounced through /auth/sign-in with the EXACT invitation URL as returnTo
 *   → the sign-in page's "Sign up free" link carries that returnTo onward
 *   → (account created for the invited address — admin-created because this
 *      Supabase project enforces CAPTCHA on interactive signup; the OTP signup
 *      flow's returnTo plumbing is pinned by unit tests)
 *   → session established via the app's own /auth/callback, next = accept URL
 *   → the accept page renders WITHOUT consuming the single-use token
 *   → the OWNER changes the pending invitation's role member → ADMIN in place
 *     (PATCH; same token — the invitee's ORIGINAL link must keep working)
 *   → the invitee explicitly clicks Accept on that ORIGINAL link
 *   → membership exists with role ADMIN (the role stored at accept time),
 *     the invitation is accepted (never revoked), the joined team is active.
 *
 * Also pinned: a scanner/preview-style signed-out GET never consumes the
 * invitation, and the typed `emailDelivery.status` rides the create response
 * (local env has no email credentials → "not_configured"; provider delivery
 * itself is proven at the unit layer against a mocked Resend HTTP boundary).
 *
 * Everything else is real: auth, routes, invitation service, token hashing,
 * membership writes, account activation. Run serially (shared dev server).
 */

const INVITED_EMAIL = "chainreactapp@gmail.com";

test.describe("TEAM-INVITATION lifecycle — new-user journey with pre-accept role change", () => {
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
      .select("id, status, role, expires_at, accepted_by_user_id")
      .eq("account_id", teamId)
      .maybeSingle();
    if (error) throw new Error(`invitation lookup failed: ${error.message}`);
    return data as {
      id: string;
      status: string;
      role: string;
      expires_at: string | null;
      accepted_by_user_id: string | null;
    } | null;
  }

  test("invite as member → auth round trip → owner changes role to admin → ORIGINAL link accepts as admin", async ({
    page,
    browser,
  }) => {
    owner = await createTestUser();

    // ── Owner: real team + real invitation to the brand-new address ──
    await signInViaEmailLink(page, owner);
    const createdTeam = await page.request.post("/api/accounts", {
      data: { name: "E2E Lifecycle Team", type: "team" },
    });
    expect(createdTeam.status(), await createdTeam.text()).toBe(201);
    teamId = ((await createdTeam.json()) as { account: { id: string } }).account.id;

    const invited = await page.request.post(`/api/accounts/${teamId}/invitations`, {
      data: { email: INVITED_EMAIL, role: "member" },
    });
    expect(invited.status(), await invited.text()).toBe(201);
    const body = (await invited.json()) as {
      ok: boolean;
      invitation: { id: string };
      acceptToken: string;
      acceptPath: string;
      emailDelivery: { status: string };
    };
    expect(body.ok).toBe(true);
    expect(body.acceptPath).toBe(
      `/invitations/accept?token=${encodeURIComponent(body.acceptToken)}`,
    );
    expect(["sent", "failed", "not_configured"]).toContain(body.emailDelivery.status);

    // Non-expiring: the fresh row carries NO expiry.
    const fresh = await invitationRow();
    expect(fresh?.status).toBe("pending");
    expect(fresh?.role).toBe("member");
    expect(fresh?.expires_at).toBeNull();

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
        email: INVITED_EMAIL,
        password: `e2e-${crypto.randomUUID()}-pw!`,
        email_confirm: true,
      });
      if (error || !data.user) throw new Error(`invitee createUser failed: ${error?.message}`);
      invitee = { id: data.user.id, email: INVITED_EMAIL, password: "unused" };

      await signInViaEmailLink(inviteePage, invitee, { next: body.acceptPath });
      await inviteePage.waitForURL(/\/invitations\/accept\?/);

      // Rendering the accept page is a safe GET — still pending.
      await expect(
        inviteePage.getByTestId("accept-invitation-submit"),
      ).toBeVisible();
      await expect(
        inviteePage.getByTestId("accept-invitation-identity"),
      ).toContainText(INVITED_EMAIL);
      expect((await invitationRow())?.status).toBe("pending");

      // ── LIFECYCLE-2: the OWNER changes the pending role member → admin ──
      // In place: same invitation id, same token — the invitee's already-open
      // ORIGINAL link must remain valid. No new email, no new link.
      const patched = await page.request.patch(
        `/api/accounts/${teamId}/invitations/${body.invitation.id}`,
        { data: { role: "admin" } },
      );
      expect(patched.status(), await patched.text()).toBe(200);
      const patchedBody = (await patched.json()) as {
        invitation: { role: string };
        acceptToken?: string;
      };
      expect(patchedBody.invitation.role).toBe("admin");
      expect(patchedBody.acceptToken).toBeUndefined(); // no new token on a role change
      const afterPatch = await invitationRow();
      expect(afterPatch?.status).toBe("pending"); // NOT revoked
      expect(afterPatch?.role).toBe("admin");

      // ── The invitee accepts on the ORIGINAL link/page ──
      await Promise.all([
        inviteePage.waitForURL(/\/workflows/),
        inviteePage.getByTestId("accept-invitation-submit").click(),
      ]);

      // Accepted (never revoked) with the role stored at accept time: ADMIN.
      const settled = await invitationRow();
      expect(settled?.status).toBe("accepted");
      expect(settled?.accepted_by_user_id).toBe(invitee.id);

      const { data: membership } = await adminClient()
        .from("account_memberships")
        .select("role")
        .eq("account_id", teamId!)
        .eq("user_id", invitee.id)
        .maybeSingle();
      expect(membership?.role).toBe("admin");

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
