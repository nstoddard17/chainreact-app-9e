/**
 * @jest-environment node
 *
 * Tests for integrations/slack/actions/pinMessage.
 */
const mockGetActiveForExecution = jest.fn();
jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...args: unknown[]) => mockGetActiveForExecution(...args),
}));

const mockPinsAdd = jest.fn();
jest.mock("@/integrations/slack/api/pinsAdd", () => ({
  pinsAdd: (...args: unknown[]) => mockPinsAdd(...args),
}));

const mockDecryptToken = jest.fn();
jest.mock("@/core/encryption/tokens", () => ({
  decryptToken: (...args: unknown[]) => mockDecryptToken(...args),
}));

import { pinMessage } from "@/integrations/slack/actions/pinMessage";
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
    nodeId: "n-pin",
    config,
    triggerEvent: slackEvent,
  };
}

beforeEach(() => {
  mockGetActiveForExecution.mockReset();
  mockPinsAdd.mockReset();
  mockDecryptToken.mockReset();
});

describe("pinMessage — happy path", () => {
  it("decrypts the bot token, calls pins.add, and returns the channel + ts confirmation", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockDecryptToken.mockReturnValueOnce("xoxb-real");
    mockPinsAdd.mockResolvedValueOnce(undefined);

    const result = await pinMessage(makeInput({ channel: "C1", ts: "1.0" }));

    expect(mockPinsAdd).toHaveBeenCalledWith({
      botToken: "xoxb-real",
      channel: "C1",
      timestamp: "1.0",
    });
    expect(result.output).toEqual({ channel: "C1", ts: "1.0" });
  });
});

describe("pinMessage — validation + errors", () => {
  it("rejects missing channel", async () => {
    await expect(pinMessage(makeInput({ ts: "1.0" }))).rejects.toThrow();
  });

  it("rejects missing ts", async () => {
    await expect(pinMessage(makeInput({ channel: "C1" }))).rejects.toThrow();
  });

  it("propagates SlackApiError on already_pinned", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockDecryptToken.mockReturnValueOnce("xoxb");
    mockPinsAdd.mockRejectedValueOnce(new Error("Slack API failed: already_pinned"));
    await expect(
      pinMessage(makeInput({ channel: "C1", ts: "1.0" })),
    ).rejects.toThrow(/already_pinned/);
  });

  it("propagates SlackApiError on permission_denied", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockDecryptToken.mockReturnValueOnce("xoxb");
    mockPinsAdd.mockRejectedValueOnce(new Error("Slack API failed: permission_denied"));
    await expect(
      pinMessage(makeInput({ channel: "C1", ts: "1.0" })),
    ).rejects.toThrow(/permission_denied/);
  });
});
