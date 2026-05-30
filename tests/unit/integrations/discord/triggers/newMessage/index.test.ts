/**
 * @jest-environment node
 *
 * Slice 3.DISCORD-7 — Discord new_message module-init registration.
 */
import "@/integrations/discord/triggers/newMessage";
import { findActivation } from "@/services/triggers/activationRegistry";
import { findPollingHandler } from "@/services/triggers/pollingRegistry";

describe("discord new_message module-init registration", () => {
  it("registers activation under (provider='discord', eventType='new_message')", () => {
    expect(findActivation("discord", "new_message")).not.toBeNull();
  });

  it("registers the polling handler so the cron picks up Discord new_message rows", () => {
    const fakeRow = {
      id: "tr-x",
      workflowId: "wf-x",
      workflowAccountId: "acct-x",
      userId: "u-x",
      provider: "discord",
      eventType: "new_message",
      nodeId: "n-x",
      providerAccountId: null,
      config: {},
      registeredAt: "",
      expiresAt: null,
      lastRenewedAt: null,
      createdAt: "",
      updatedAt: "",
    };
    const handler = findPollingHandler(fakeRow);
    expect(handler).not.toBeNull();
    expect(handler!.id).toBe("discord/new_message");
  });

  it("does NOT register a deactivation hook (polling has no provider-side resource)", async () => {
    // The deactivation registry is the same one used by webhook
    // triggers. Polling-only triggers must NOT register here —
    // disabling the workflow simply stops the cron from picking it up.
    const { findDeactivation } = await import(
      "@/services/triggers/deactivationRegistry"
    );
    expect(findDeactivation("discord", "new_message")).toBeNull();
  });
});
