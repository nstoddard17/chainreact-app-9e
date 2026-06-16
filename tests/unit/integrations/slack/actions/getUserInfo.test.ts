/**
 * @jest-environment node
 *
 * Tests for integrations/slack/actions/users/getUserInfo
 * (Slack 2.3 Commit 4).
 */
const mockGetActiveForExecution = jest.fn();
jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...args: unknown[]) =>
    mockGetActiveForExecution(...args),
}));

const mockUsersInfo = jest.fn();
jest.mock("@/integrations/slack/api/usersInfo", () => ({
  usersInfo: (...args: unknown[]) => mockUsersInfo(...args),
}));

const mockDecryptToken = jest.fn();
jest.mock("@/core/encryption/tokens", () => ({
  decryptToken: (...args: unknown[]) => mockDecryptToken(...args),
}));

import { SLACK_TOKEN_PLACEHOLDER } from "@/tests/helpers/syntheticSecrets";
import { getUserInfo } from "@/integrations/slack/actions/users/getUserInfo";
import type { ActionHandlerInput } from "@/services/execution/handlers/types";
import type { TriggerEvent } from "@/contracts/triggerEvent";

const slackEvent: TriggerEvent = {
  provider: "slack",
  eventType: "slack.message.channel",
  eventId: "Ev1",
  occurredAt: "2026-05-11T00:00:00Z",
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
  scopes: ["users:read"],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "2026-05-11T00:00:00Z",
  updatedAt: "2026-05-11T00:00:00Z",
};

function makeInput(config: Record<string, unknown>): ActionHandlerInput {
  return {
    workflowId: "wf-1",
    userId: "user-1",
    accountId: "acct-user-1",
    runId: "run-1",
    nodeId: "n5",
    config,
    triggerEvent: slackEvent,
  };
}

beforeEach(() => {
  mockGetActiveForExecution.mockReset();
  mockUsersInfo.mockReset();
  mockDecryptToken.mockReset();
});

describe("getUserInfo — happy path", () => {
  it("decrypts the bot token, calls users.info, projects flat fields + preserves raw user object", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockDecryptToken.mockReturnValueOnce(SLACK_TOKEN_PLACEHOLDER);
    mockUsersInfo.mockResolvedValueOnce({
      user: {
        id: "U1",
        name: "alice",
        real_name: "Alice Anderson",
        is_admin: false,
        is_owner: false,
        is_bot: false,
        tz: "America/Los_Angeles",
        profile: {
          display_name: "Alice",
          image_192: "https://example.com/avatar.png",
          title: "Engineer",
        },
        extra_field_slack_might_add: "preserved",
      },
    });

    const result = await getUserInfo(makeInput({ user: "U1" }));

    expect(mockUsersInfo).toHaveBeenCalledWith({
      botToken: SLACK_TOKEN_PLACEHOLDER,
      user: "U1",
    });
    expect(result.output).toEqual({
      user: expect.objectContaining({
        id: "U1",
        extra_field_slack_might_add: "preserved",
      }),
      id: "U1",
      name: "alice",
      real_name: "Alice Anderson",
      display_name: "Alice",
      is_admin: false,
      is_owner: false,
      is_bot: false,
      tz: "America/Los_Angeles",
      image_192: "https://example.com/avatar.png",
    });
  });

  it("does NOT include `email` in the flat output (users:read.email not requested)", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockDecryptToken.mockReturnValueOnce("xoxb");
    // Slack would only populate profile.email when users:read.email is
    // granted. Even when present, the handler does NOT promote it to a
    // top-level field — Slack 2.3 plan §6 decision 3.
    mockUsersInfo.mockResolvedValueOnce({
      user: {
        id: "U1",
        name: "alice",
        profile: { email: "alice@example.com" },
      },
    });

    const result = await getUserInfo(makeInput({ user: "U1" }));
    expect(Object.keys(result.output)).not.toContain("email");
    // The raw object is preserved verbatim — workflow authors that
    // already added users:read.email can still index into it.
    expect(result.output.user).toMatchObject({
      profile: { email: "alice@example.com" },
    });
  });

  it("safely handles a user object without a profile sub-object", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockDecryptToken.mockReturnValueOnce("xoxb");
    mockUsersInfo.mockResolvedValueOnce({
      user: { id: "U1", name: "ghost" },
    });

    const result = await getUserInfo(makeInput({ user: "U1" }));
    expect(result.output.display_name).toBeUndefined();
    expect(result.output.image_192).toBeUndefined();
  });
});

describe("getUserInfo — strict schema (fail-closed)", () => {
  it("rejects a missing user id", async () => {
    await expect(getUserInfo(makeInput({}))).rejects.toThrow();
  });

  it("rejects a non-U-prefixed id", async () => {
    await expect(
      getUserInfo(makeInput({ user: "C1ABC" })),
    ).rejects.toThrow();
  });

  it("rejects a lowercase id", async () => {
    await expect(
      getUserInfo(makeInput({ user: "u1abc" })),
    ).rejects.toThrow();
  });

  it("rejects unknown keys (strict schema)", async () => {
    await expect(
      getUserInfo(makeInput({ user: "U1", noSuchField: "x" })),
    ).rejects.toThrow();
  });
});

describe("getUserInfo — error propagation", () => {
  it("propagates SlackApiError when the wrapper rejects (user_not_found)", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockDecryptToken.mockReturnValueOnce("xoxb");
    mockUsersInfo.mockRejectedValueOnce(
      new Error("Slack API failed: user_not_found"),
    );
    await expect(getUserInfo(makeInput({ user: "U1" }))).rejects.toThrow(
      /user_not_found/,
    );
  });

  it("throws when no Slack integration is active for the user/workspace", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(null);
    await expect(getUserInfo(makeInput({ user: "U1" }))).rejects.toThrow(
      /No active Slack integration/,
    );
  });
});
