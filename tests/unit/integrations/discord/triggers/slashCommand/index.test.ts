/**
 * @jest-environment node
 *
 * Slice 3.DISCORD-6 — `discord:slash_command` module-init registration.
 *
 * Pinned contracts (mirrors github/newCommit/index.test.ts shape):
 *   - Importing the module side-effect-registers BOTH activation and
 *     deactivation hooks under the (provider="discord",
 *     eventType="slash_command") key.
 *   - No subscription-renewal handler is registered for Discord rows —
 *     Discord slash commands don't expire, and the renewal cron filters
 *     on `config.type === "subscription-watch"` (intentionally absent
 *     from this activate's config payload).
 */
import "@/integrations/discord/triggers/slashCommand";
import { findActivation } from "@/services/triggers/activationRegistry";
import { findDeactivation } from "@/services/triggers/deactivationRegistry";

describe("discord slash_command module-init registration", () => {
  it("registers activation under (provider='discord', eventType='slash_command')", () => {
    expect(findActivation("discord", "slash_command")).not.toBeNull();
  });

  it("registers deactivation under (provider='discord', eventType='slash_command')", () => {
    expect(findDeactivation("discord", "slash_command")).not.toBeNull();
  });

  it("does NOT register a subscription-renewal handler for Discord rows (commands don't expire)", async () => {
    const { findSubscriptionHandler } = await import(
      "@/services/triggers/subscriptionRegistry"
    );
    const fakeDiscordRow = {
      id: "x",
      workflowId: "wf",
      workflowAccountId: "acct-wf",
      userId: "u",
      provider: "discord",
      eventType: "slash_command",
      nodeId: "n",
      // Even if a corrupted row carries the marker, NO Discord-specific
      // subscription handler should match — the activate hook
      // intentionally omits it so the renewal cron can't pick this trigger
      // up.
      config: {
        type: "subscription-watch",
        applicationId: "a",
        guildId: "g",
        commandId: "c",
      },
      providerAccountId: "u",
      registeredAt: "",
      expiresAt: null,
      lastRenewedAt: null,
      createdAt: "",
      updatedAt: "",
    };
    const handler = findSubscriptionHandler(fakeDiscordRow);
    if (handler !== null) {
      expect(handler.id.toLowerCase()).not.toContain("discord");
    }
  });
});
