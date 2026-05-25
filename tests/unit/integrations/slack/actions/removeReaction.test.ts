/**
 * @jest-environment node
 *
 * Tests for integrations/slack/actions/removeReaction.
 */
const mockGetActiveForExecution = jest.fn();
jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...args: unknown[]) => mockGetActiveForExecution(...args),
}));

const mockReactionsRemove = jest.fn();
jest.mock("@/integrations/slack/api/reactionsRemove", () => ({
  reactionsRemove: (...args: unknown[]) => mockReactionsRemove(...args),
}));

const mockDecryptToken = jest.fn();
jest.mock("@/core/encryption/tokens", () => ({
  decryptToken: (...args: unknown[]) => mockDecryptToken(...args),
}));

import { removeReaction } from "@/integrations/slack/actions/removeReaction";
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
  scopes: ["reactions:write"],
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
    nodeId: "n-unreact",
    config,
    triggerEvent: slackEvent,
  };
}

beforeEach(() => {
  mockGetActiveForExecution.mockReset();
  mockReactionsRemove.mockReset();
  mockDecryptToken.mockReset();
});

describe("removeReaction — happy path", () => {
  it("calls reactions.remove with normalized name and echoes config in output", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockDecryptToken.mockReturnValueOnce("xoxb");
    mockReactionsRemove.mockResolvedValueOnce(undefined);

    const result = await removeReaction(
      makeInput({ channel: "C1", ts: "1.0", reaction: ":thumbsup:" }),
    );

    expect(mockReactionsRemove).toHaveBeenCalledWith({
      botToken: "xoxb",
      channel: "C1",
      timestamp: "1.0",
      name: "thumbsup",
    });
    expect(result.output).toEqual({
      channel: "C1",
      ts: "1.0",
      reaction: "thumbsup",
    });
  });
});

describe("removeReaction — validation + errors", () => {
  it("rejects missing channel / ts / reaction", async () => {
    await expect(
      removeReaction(makeInput({ ts: "1.0", reaction: "thumbsup" })),
    ).rejects.toThrow();
    await expect(
      removeReaction(makeInput({ channel: "C1", reaction: "thumbsup" })),
    ).rejects.toThrow();
    await expect(
      removeReaction(makeInput({ channel: "C1", ts: "1.0", reaction: "" })),
    ).rejects.toThrow();
  });

  it("rejects reaction that becomes empty after normalization", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockDecryptToken.mockReturnValueOnce("xoxb");
    await expect(
      removeReaction(makeInput({ channel: "C1", ts: "1.0", reaction: "::" })),
    ).rejects.toThrow(/must contain an emoji name/);
    expect(mockReactionsRemove).not.toHaveBeenCalled();
  });

  it("propagates SlackApiError on no_reaction (bot hadn't reacted)", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockDecryptToken.mockReturnValueOnce("xoxb");
    mockReactionsRemove.mockRejectedValueOnce(new Error("Slack API failed: no_reaction"));
    await expect(
      removeReaction(makeInput({ channel: "C1", ts: "1.0", reaction: "thumbsup" })),
    ).rejects.toThrow(/no_reaction/);
  });

  it("throws workspace-specific 'connect Slack' when no integration", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(null);
    await expect(
      removeReaction(makeInput({ channel: "C1", ts: "1.0", reaction: "thumbsup" })),
    ).rejects.toThrow(/No active Slack integration found for workspace T0001/);
  });
});
