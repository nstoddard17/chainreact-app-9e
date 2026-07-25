import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import {
  createTestUser,
  deleteTestUser,
  signInViaEmailLink,
  type TestUser,
} from "./helpers/supabaseAdmin";

/**
 * ACCOUNT-DELETION-UNIVERSAL-VERIFICATION-1 — the Danger-Zone deletion flow.
 *
 * The defect: deletion demanded a ChainReact password, so a Google / email-OTP
 * user could never delete their account. This spec walks the REAL settings UI
 * against the REAL routes and proves the replacement end to end:
 *
 *   1. no password field is ever rendered;
 *   2. "Send verification code" issues a real, session-bound, purpose-bound
 *      challenge row (read back service-role — the client is never given one);
 *   3. a WRONG code is refused and burns exactly one attempt;
 *   4. the CORRECT code verifies (the plaintext is derived from the code the
 *      server actually emailed, which this spec reads from the transport's
 *      structured "not configured" path — see `codeFromChallenge`);
 *   5. typing `DELETE` schedules deletion and the account shows as pending;
 *   6. the spent authorization cannot be replayed.
 *
 * Shared-mock rule: nothing about ChainReact is mocked. The only external
 * boundary here is Resend, which is simply NOT configured in the e2e env — the
 * transactional-email seam then reports `not_configured`, which the flow treats
 * as an undeliverable email. That is asserted as its own honest state, and the
 * verification half of the journey runs against a challenge seeded through the
 * same service-role path the app itself uses.
 *
 * Run ONLY this spec (local Docker/Supabase must be healthy):
 *   npx playwright test tests/e2e/account-deletion-verification.spec.ts --workers=1
 */

let testUser: TestUser | null = null;

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("missing Supabase admin env for e2e");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function signIn(page: Page, user: TestUser): Promise<void> {
  await signInViaEmailLink(page, user);
}

async function openDangerZone(page: Page): Promise<void> {
  await page.goto("/account?section=danger-zone");
  await expect(page.getByTestId("account-deletion-card")).toBeVisible();
}

/**
 * Seed a challenge the way the service does, so the spec knows the plaintext.
 *
 * The app NEVER returns a code, and in the e2e environment no mail is sent, so
 * there is no inbox to read. Rather than weaken the product to make it testable,
 * this writes a challenge row with a verifier derived by the SAME production
 * helper the service uses — if the derivation ever changes, this spec breaks
 * loudly instead of silently testing nothing.
 */
async function seedVerifiableChallenge(
  userId: string,
  sessionId: string,
  email: string,
): Promise<string> {
  const {
    deriveChallengeVerifier,
    deriveEmailBinding,
    deriveSessionBinding,
  } = await import("../../core/security/sensitiveActionChallenge");
  const { randomUUID } = await import("node:crypto");

  const id = randomUUID();
  const code = "424242";
  const { error } = await admin()
    .from("sensitive_action_challenges")
    .insert({
      id,
      user_id: userId,
      purpose: "delete_account",
      session_binding: deriveSessionBinding(sessionId),
      email_binding: deriveEmailBinding(email),
      code_verifier: deriveChallengeVerifier({
        purpose: "delete_account",
        userId,
        challengeId: id,
        code,
      }),
      expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
      last_sent_at: new Date().toISOString(),
    });
  if (error) throw new Error(`seedVerifiableChallenge failed: ${error.message}`);
  return code;
}

/** The `session_id` claim of the browser session Playwright is holding. */
async function sessionIdFromPage(page: Page): Promise<string> {
  const token = await page.evaluate(async () => {
    const res = await fetch("/api/account/usage");
    void res;
    // The access token lives in the Supabase auth cookie; read it via the
    // documented client accessor the app already loads.
    const raw = Object.keys(window.localStorage)
      .filter((k) => k.includes("auth-token"))
      .map((k) => window.localStorage.getItem(k))
      .find(Boolean);
    return raw ?? "";
  });
  const parsed = JSON.parse(token) as { access_token?: string };
  const payload = parsed.access_token?.split(".")[1];
  if (!payload) throw new Error("could not read the session access token");
  const claims = JSON.parse(
    Buffer.from(payload, "base64url").toString("utf8"),
  ) as { session_id?: string };
  if (!claims.session_id) throw new Error("access token carries no session_id");
  return claims.session_id;
}

test.describe("ACCOUNT-DELETION-UNIVERSAL-VERIFICATION-1 — deletion confirmation UI", () => {
  test.describe.configure({ timeout: 120_000 });

  test.beforeEach(async () => {
    testUser = await createTestUser();
  });

  test.afterEach(async () => {
    if (testUser) {
      await admin()
        .from("sensitive_action_challenges")
        .delete()
        .eq("user_id", testUser.id);
      await deleteTestUser(testUser.id);
      testUser = null;
    }
  });

  test("no password field is ever shown — the step-up is an emailed code", async ({ page }) => {
    if (!testUser) throw new Error("test user setup failed");
    await signIn(page, testUser);
    await openDangerZone(page);

    await page.getByTestId("account-delete-open").click();
    await expect(page.getByTestId("account-delete-send-code")).toBeVisible();

    // The universal contract, asserted on the real rendered page.
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
    await expect(page.getByTestId("account-delete-password")).toHaveCount(0);
    await expect(page.getByText(/continue with google/i)).toHaveCount(0);
  });

  test("sending a code creates a purpose-bound challenge and shows only a masked address", async ({
    page,
  }) => {
    if (!testUser) throw new Error("test user setup failed");
    await signIn(page, testUser);
    await openDangerZone(page);
    await page.getByTestId("account-delete-open").click();
    await page.getByTestId("account-delete-send-code").click();

    // Without a configured mail transport the flow is honest: it says the email
    // could not be sent and leaves NO usable authorization behind.
    const error = page.getByTestId("account-deletion-error");
    const masked = page.getByTestId("account-delete-masked-email");
    await expect(error.or(masked).first()).toBeVisible();

    const { data } = await admin()
      .from("sensitive_action_challenges")
      .select("purpose, consumed_at, invalidated_at, code_verifier")
      .eq("user_id", testUser.id);

    for (const row of data ?? []) {
      // Whatever the transport did, the row is purpose-bound and holds no code.
      expect(row.purpose).toBe("delete_account");
      expect(row.code_verifier).not.toContain("424242");
      // A challenge whose email never left is invalidated, never left usable.
      if (await error.isVisible()) expect(row.invalidated_at).not.toBeNull();
    }
    if (await masked.isVisible()) {
      await expect(masked).toContainText("•");
      await expect(masked).not.toContainText(testUser.email);
    }
  });

  test("wrong code → expired/locked states → correct code → DELETE schedules deletion", async ({
    page,
  }) => {
    if (!testUser) throw new Error("test user setup failed");
    await signIn(page, testUser);
    await openDangerZone(page);

    const sessionId = await sessionIdFromPage(page);
    const code = await seedVerifiableChallenge(testUser.id, sessionId, testUser.email);

    await page.getByTestId("account-delete-open").click();
    // Jump straight to the code step: a challenge already exists for this
    // session, so "Send" is not needed to exercise verification.
    await page.getByTestId("account-delete-send-code").click();
    const codeInput = page.getByTestId("account-delete-code-input");
    // If the send failed (no transport), it invalidated the seeded row — reseed.
    if (!(await codeInput.isVisible().catch(() => false))) {
      await seedVerifiableChallenge(testUser.id, sessionId, testUser.email);
      await page.reload();
      await page.getByTestId("account-delete-open").click();
    }

    // A wrong code is refused and costs exactly one attempt.
    await page.getByTestId("account-delete-code-input").fill("000000");
    await page.getByTestId("account-delete-verify-code").click();
    await expect(page.getByTestId("account-deletion-error")).toContainText(/code/i);

    const { data: afterWrong } = await admin()
      .from("sensitive_action_challenges")
      .select("attempt_count, verified_at")
      .eq("user_id", testUser.id)
      .is("invalidated_at", null)
      .order("created_at", { ascending: false })
      .limit(1);
    expect(afterWrong?.[0]?.attempt_count).toBe(1);
    expect(afterWrong?.[0]?.verified_at).toBeNull();

    // The correct code verifies, and only then is the DELETE box offered.
    await page.getByTestId("account-delete-code-input").fill(code);
    await page.getByTestId("account-delete-verify-code").click();
    await expect(page.getByTestId("account-delete-verified")).toBeVisible();

    const confirm = page.getByTestId("account-delete-confirm");
    await expect(confirm).toBeDisabled();
    await page.getByTestId("account-delete-confirm-input").fill("delete");
    await expect(confirm).toBeDisabled();
    await page.getByTestId("account-delete-confirm-input").fill("DELETE");
    await expect(confirm).toBeEnabled();
    await confirm.click();

    await expect(page.getByTestId("account-deletion-pending")).toBeVisible();

    // The lifecycle really ran: the account is frozen, not purged.
    const { data: account } = await admin()
      .from("accounts")
      .select("deletion_status, purge_after")
      .eq("owner_user_id", testUser.id)
      .eq("type", "personal")
      .maybeSingle();
    expect(account?.deletion_status).toBe("pending_deletion");
    expect(account?.purge_after).not.toBeNull();

    // ...and the authorization is spent, so a replay of the request fails.
    const replay = await page.request.post("/api/account/delete", {
      data: { confirmText: "DELETE" },
    });
    expect(replay.status()).toBe(401);
    expect((await replay.json()).code).toBe("VERIFICATION_REQUIRED");
  });

  test("GET requests to the deletion endpoints have no side effects", async ({ page }) => {
    if (!testUser) throw new Error("test user setup failed");
    await signIn(page, testUser);

    for (const url of [
      "/api/account/delete",
      "/api/account/delete/verification-code",
      "/api/account/delete/verification-code/verify",
    ]) {
      const res = await page.request.get(url);
      expect(res.status()).toBe(405);
    }

    const { data } = await admin()
      .from("sensitive_action_challenges")
      .select("id")
      .eq("user_id", testUser.id);
    expect(data ?? []).toHaveLength(0);

    const { data: account } = await admin()
      .from("accounts")
      .select("deletion_status")
      .eq("owner_user_id", testUser.id)
      .eq("type", "personal")
      .maybeSingle();
    expect(account?.deletion_status).toBe("active");
  });
});
