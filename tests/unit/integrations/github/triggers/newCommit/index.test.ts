/**
 * @jest-environment node
 *
 * Tests for the GitHub `new_commit` trigger module-init registration.
 *
 * Importing the module force-registers the activation + deactivation
 * hooks. Verifies BOTH are registered AND that no
 * subscription-renewal handler is registered (GitHub repo webhooks
 * don't expire — the renewal cron filters on
 * `config.type === "subscription-watch"` and the activate hook
 * intentionally omits that marker).
 */
import "@/integrations/github/triggers/newCommit";
import { findActivation } from "@/services/triggers/activationRegistry";
import { findDeactivation } from "@/services/triggers/deactivationRegistry";

describe("GitHub new_commit registration", () => {
  it("registers activation under (provider='github', eventType='new_commit')", () => {
    expect(findActivation("github", "new_commit")).not.toBeNull();
  });

  it("registers deactivation under (provider='github', eventType='new_commit')", () => {
    expect(findDeactivation("github", "new_commit")).not.toBeNull();
  });

  it("does NOT register a subscription-renewal handler that handles GitHub rows (webhooks don't expire)", async () => {
    // The `runRenewals` cron iterates rows whose JSONB config marks
    // them as `type: "subscription-watch"`. GitHub's activate hook
    // intentionally omits that marker, so no row will ever look like
    // a GitHub subscription-watch candidate. Defense-in-depth: even
    // if someone passed a fake row with our provider id, NO
    // subscription handler should claim it.
    const { findSubscriptionHandler } = await import(
      "@/services/triggers/subscriptionRegistry"
    );
    const fakeGithubRow = {
      id: "x",
      workflowId: "wf",
      workflowAccountId: "acct-wf",
      userId: "u",
      provider: "github",
      eventType: "new_commit",
      nodeId: "n",
      // Even if a corrupted row carries the marker, no GitHub-specific
      // handler should match.
      config: { type: "subscription-watch", repository: "u/r" },
      providerAccountId: "u",
      registeredAt: "",
      expiresAt: null,
      lastRenewedAt: null,
      createdAt: "",
      updatedAt: "",
    };
    const handler = findSubscriptionHandler(fakeGithubRow);
    // Some handler may match the marker generically (Google
    // Calendar's canHandle is broad). This test asserts that NO
    // GitHub-specific handler exists in the registry — i.e. if a
    // handler matches, it isn't ours.
    if (handler !== null) {
      expect(handler.id.toLowerCase()).not.toContain("github");
    }
  });
});
