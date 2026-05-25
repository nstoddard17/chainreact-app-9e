/**
 * @jest-environment node
 *
 * Tests for the GitHub `new_commit` deactivation hook.
 */
const mockDelete = jest.fn();
const mockDecrypt = jest.fn();

jest.mock("@/integrations/_shared/github/api/webhooks", () => ({
  repoHooksDelete: (...args: unknown[]) => mockDelete(...args),
}));

jest.mock("@/core/encryption/tokens", () => ({
  decryptToken: (v: string) => mockDecrypt(v),
}));

import { NotFoundError } from "@/integrations/_shared/github/errors";
import { deactivate } from "@/integrations/github/triggers/newCommit/deactivate";

beforeEach(() => {
  mockDelete.mockReset();
  mockDecrypt.mockReset();
  mockDecrypt.mockImplementation((v: string) => `decrypted-${v}`);
});

const baseIntegration = {
  id: "int-1",
  userId: "user-1",
  provider: "github",
  providerAccountId: "octocat",
  displayName: "octocat",
  accessTokenEncrypted: "ENC-USER",
  refreshTokenEncrypted: null,
  accessTokenExpiresAt: null,
  scopes: ["repo"],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "",
  updatedAt: "",
};

function trigger(overrides: Record<string, unknown> = {}) {
  return {
    id: "trig-1",
    workflowId: "wf-1",
    userId: "user-1",
    provider: "github",
    eventType: "new_commit",
    nodeId: "node-trigger-1",
    accountId: "octocat",
    config: {
      owner: "octocat",
      repo: "hello",
      hookId: 12345,
      ...overrides,
    },
    registeredAt: "",
    expiresAt: null,
    lastRenewedAt: null,
    createdAt: "",
    updatedAt: "",
  };
}

describe("github new_commit deactivate — happy path", () => {
  it("DELETEs the repo webhook by hookId from config", async () => {
    mockDelete.mockResolvedValueOnce(undefined);
    await deactivate({ trigger: trigger(), integration: baseIntegration });
    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(mockDelete.mock.calls[0]![0]!).toEqual({
      accessToken: "decrypted-ENC-USER",
      owner: "octocat",
      repo: "hello",
      hookId: 12345,
    });
  });
});

describe("github new_commit deactivate — best-effort failure modes", () => {
  it("swallows NotFoundError (webhook already deleted server-side)", async () => {
    mockDelete.mockRejectedValueOnce(
      new NotFoundError("webhook 12345 on octocat/hello"),
    );
    await expect(
      deactivate({ trigger: trigger(), integration: baseIntegration }),
    ).resolves.toBeUndefined();
  });

  it("swallows Unauthorized401Error (user revoked OAuth App)", async () => {
    class Unauthorized401Error extends Error {
      constructor(msg = "401") {
        super(msg);
        this.name = "Unauthorized401Error";
      }
    }
    mockDelete.mockRejectedValueOnce(new Unauthorized401Error());
    await expect(
      deactivate({ trigger: trigger(), integration: baseIntegration }),
    ).resolves.toBeUndefined();
  });

  it("propagates other errors (5xx etc.) so the orchestrator can log", async () => {
    mockDelete.mockRejectedValueOnce(new Error("boom: 503"));
    await expect(
      deactivate({ trigger: trigger(), integration: baseIntegration }),
    ).rejects.toThrow(/boom: 503/);
  });
});

describe("github new_commit deactivate — defensive skips", () => {
  it("skips silently when config.hookId is missing (early test fixture / partial-rollback)", async () => {
    const t = trigger();
    // Strip hookId.
    (t.config as Record<string, unknown>).hookId = undefined;
    await deactivate({ trigger: t, integration: baseIntegration });
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("skips silently when config.owner is missing", async () => {
    const t = trigger();
    (t.config as Record<string, unknown>).owner = undefined;
    await deactivate({ trigger: t, integration: baseIntegration });
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("skips silently when config.repo is missing", async () => {
    const t = trigger();
    (t.config as Record<string, unknown>).repo = undefined;
    await deactivate({ trigger: t, integration: baseIntegration });
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("skips silently when hookId is not a number (corrupted config)", async () => {
    const t = trigger();
    (t.config as Record<string, unknown>).hookId = "not-a-number";
    await deactivate({ trigger: t, integration: baseIntegration });
    expect(mockDelete).not.toHaveBeenCalled();
  });
});
