/**
 * @jest-environment node
 *
 * Tests for integrations/slack/actions/addReaction.
 */
const mockGetActiveForExecution = jest.fn();
jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...args: unknown[]) => mockGetActiveForExecution(...args),
}));

const mockReactionsAdd = jest.fn();
jest.mock("@/integrations/slack/api/reactionsAdd", () => ({
  reactionsAdd: (...args: unknown[]) => mockReactionsAdd(...args),
}));

const mockDecryptToken = jest.fn();
jest.mock("@/core/encryption/tokens", () => ({
  decryptToken: (...args: unknown[]) => mockDecryptToken(...args),
}));

import { addReaction } from "@/integrations/slack/actions/addReaction";
import type { ActionHandlerInput } from "@/services/execution/handlers/types";
import type { TriggerEvent } from "@/contracts/triggerEvent";

const slackEvent: TriggerEvent = {
  provider: "slack",
  eventType: "slack.message.channel",
  eventId: "Ev1",
  occurredAt: "2026-05-07T00:00:00Z",
  providerAccountId: "T0001",
  payload: {},
};

const baseIntegration = {
  id: "int-1",
  accountId: "acct-user-1",
  connectedByUserId: "user-1",
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
    accountId: "acct-user-1",
    runId: "run-1",
    nodeId: "n-react",
    config,
    triggerEvent: slackEvent,
  };
}

beforeEach(() => {
  mockGetActiveForExecution.mockReset();
  mockReactionsAdd.mockReset();
  mockDecryptToken.mockReset();
});

describe("addReaction — happy path", () => {
  it("decrypts token, calls reactions.add with normalized name, echoes config in output", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockDecryptToken.mockReturnValueOnce("xoxb-real");
    mockReactionsAdd.mockResolvedValueOnce(undefined);

    const result = await addReaction(
      makeInput({ channel: "C1", ts: "1.0", reaction: ":thumbsup:" }),
    );

    expect(mockReactionsAdd).toHaveBeenCalledWith({
      botToken: "xoxb-real",
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

  it("accepts the bare emoji name (no colons) unchanged", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockDecryptToken.mockReturnValueOnce("xoxb");
    mockReactionsAdd.mockResolvedValueOnce(undefined);

    await addReaction(makeInput({ channel: "C1", ts: "1.0", reaction: "tada" }));

    expect(mockReactionsAdd).toHaveBeenCalledWith(
      expect.objectContaining({ name: "tada" }),
    );
  });

  it("preserves the skin-tone modifier when stripping outer colons", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockDecryptToken.mockReturnValueOnce("xoxb");
    mockReactionsAdd.mockResolvedValueOnce(undefined);

    await addReaction(
      makeInput({ channel: "C1", ts: "1.0", reaction: ":thumbsup::skin-tone-2:" }),
    );

    expect(mockReactionsAdd).toHaveBeenCalledWith(
      expect.objectContaining({ name: "thumbsup::skin-tone-2" }),
    );
  });
});

describe("addReaction — validation + errors", () => {
  it("rejects missing channel", async () => {
    await expect(
      addReaction(makeInput({ ts: "1.0", reaction: "thumbsup" })),
    ).rejects.toThrow();
  });

  it("rejects missing ts", async () => {
    await expect(
      addReaction(makeInput({ channel: "C1", reaction: "thumbsup" })),
    ).rejects.toThrow();
  });

  it("rejects empty reaction", async () => {
    await expect(
      addReaction(makeInput({ channel: "C1", ts: "1.0", reaction: "" })),
    ).rejects.toThrow();
  });

  it("rejects reaction that becomes empty after normalization (e.g. '::')", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockDecryptToken.mockReturnValueOnce("xoxb");
    await expect(
      addReaction(makeInput({ channel: "C1", ts: "1.0", reaction: "::" })),
    ).rejects.toThrow(/must contain an emoji name/);
    expect(mockReactionsAdd).not.toHaveBeenCalled();
  });

  it("propagates SlackApiError on already_reacted", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockDecryptToken.mockReturnValueOnce("xoxb");
    mockReactionsAdd.mockRejectedValueOnce(new Error("Slack API failed: already_reacted"));
    await expect(
      addReaction(makeInput({ channel: "C1", ts: "1.0", reaction: "thumbsup" })),
    ).rejects.toThrow(/already_reacted/);
  });

  it("propagates SlackApiError on not_in_channel (V1 auto-joined here; V2 surfaces directly)", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockDecryptToken.mockReturnValueOnce("xoxb");
    mockReactionsAdd.mockRejectedValueOnce(new Error("Slack API failed: not_in_channel"));
    await expect(
      addReaction(makeInput({ channel: "C1", ts: "1.0", reaction: "thumbsup" })),
    ).rejects.toThrow(/not_in_channel/);
  });

  it("throws workspace-specific 'connect Slack' when no integration", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(null);
    await expect(
      addReaction(makeInput({ channel: "C1", ts: "1.0", reaction: "thumbsup" })),
    ).rejects.toThrow(/No active Slack integration found for workspace T0001/);
  });
});
