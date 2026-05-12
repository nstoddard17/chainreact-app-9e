/**
 * @jest-environment node
 *
 * Tests for integrations/slack/actions/unpinMessage.
 */
const mockGetActiveForExecution = jest.fn();
jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...args: unknown[]) => mockGetActiveForExecution(...args),
}));

const mockPinsRemove = jest.fn();
jest.mock("@/integrations/slack/api/pinsRemove", () => ({
  pinsRemove: (...args: unknown[]) => mockPinsRemove(...args),
}));

const mockDecryptToken = jest.fn();
jest.mock("@/core/encryption/tokens", () => ({
  decryptToken: (...args: unknown[]) => mockDecryptToken(...args),
}));

import { unpinMessage } from "@/integrations/slack/actions/unpinMessage";
import type { ActionHandlerInput } from "@/services/execution/handlers/types";
import type { TriggerEvent } from "@/contracts/triggerEvent";

const slackEvent: TriggerEvent = {
  provider: "slack",
  eventType: "slack.message.channel",
  eventId: "Ev1",
  occurredAt: "2026-05-07T00:00:00Z",
  accountId: "T0001",
  payload: {},
};

const baseIntegration = {
  id: "int-1",
  userId: "user-1",
  provider: "slack",
  providerAccountId: "T0001",
  displayName: "Acme",
  accessTokenEncrypted: "ENCRYPTED_TOKEN",
  refreshTokenEncrypted: null,
  accessTokenExpiresAt: null,
  scopes: ["pins:write"],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "2026-05-07T00:00:00Z",
  updatedAt: "2026-05-07T00:00:00Z",
};

function makeInput(config: Record<string, unknown>): ActionHandlerInput {
  return {
    workflowId: "wf-1",
    userId: "user-1",
    runId: "run-1",
    nodeId: "n-unpin",
    config,
    triggerEvent: slackEvent,
  };
}

beforeEach(() => {
  mockGetActiveForExecution.mockReset();
  mockPinsRemove.mockReset();
  mockDecryptToken.mockReset();
});

describe("unpinMessage — happy path", () => {
  it("decrypts the bot token, calls pins.remove, and returns the channel + ts confirmation", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockDecryptToken.mockReturnValueOnce("xoxb");
    mockPinsRemove.mockResolvedValueOnce(undefined);

    const result = await unpinMessage(makeInput({ channel: "C1", ts: "1.0" }));

    expect(mockPinsRemove).toHaveBeenCalledWith({
      botToken: "xoxb",
      channel: "C1",
      timestamp: "1.0",
    });
    expect(result.output).toEqual({ channel: "C1", ts: "1.0" });
  });
});

describe("unpinMessage — validation + errors", () => {
  it("rejects missing channel / ts", async () => {
    await expect(unpinMessage(makeInput({ ts: "1.0" }))).rejects.toThrow();
    await expect(unpinMessage(makeInput({ channel: "C1" }))).rejects.toThrow();
  });

  it("propagates SlackApiError on not_pinned", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockDecryptToken.mockReturnValueOnce("xoxb");
    mockPinsRemove.mockRejectedValueOnce(new Error("Slack API failed: not_pinned"));
    await expect(
      unpinMessage(makeInput({ channel: "C1", ts: "1.0" })),
    ).rejects.toThrow(/not_pinned/);
  });
});
