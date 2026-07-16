/**
 * @jest-environment node
 */
import { createHash } from "node:crypto";
import type { TriggerResourceRecord } from "@/repositories/triggerResources";
import type { IntegrationRecord } from "@/repositories/integrations";
import type { WorkflowNode } from "@/contracts/workflowDefinition";

const mockRefreshAndRetry = jest.fn();
const mockGroupUsersList = jest.fn();
const mockEnqueue = jest.fn();
const mockUpdateConfig = jest.fn();
const mockGetActive = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/microsoft-powerbi/api/groups/groupUsersList", () => ({
  groupUsersList: (...args: unknown[]) => mockGroupUsersList(...args),
}));

jest.mock("@/services/execution/enqueue", () => ({
  enqueueRun: (...args: unknown[]) => mockEnqueue(...args),
}));

jest.mock("@/repositories/triggerResources", () => ({
  updateConfig: (...args: unknown[]) => mockUpdateConfig(...args),
}));

jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...args: unknown[]) => mockGetActive(...args),
}));

import { activate } from "@/integrations/microsoft-powerbi/triggers/workspaceAccessChanged/activate";
import {
  pollWorkspaceAccessChanged,
  toAccessEntries,
} from "@/integrations/microsoft-powerbi/triggers/_shared/pollWorkspace";

const BASE_CONFIG = { workspaceId: "ws-1" };

function hashPrincipal(principal: string): string {
  return createHash("sha256").update(principal).digest("hex").slice(0, 16);
}

function user(
  emailAddress: string | null,
  groupUserAccessRight: string | null,
  identifier: string | null = null,
) {
  return {
    identifier,
    emailAddress,
    displayName: "Someone",
    groupUserAccessRight,
    principalType: emailAddress ? "User" : "Group",
  };
}

function integration(): IntegrationRecord {
  return {
    id: "int-1",
    accountId: "acct-1",
    connectedByUserId: "u-1",
    provider: "microsoft-powerbi",
    providerAccountId: "alice@contoso.com",
    displayName: "Alice",
    accessTokenEncrypted: "enc",
    refreshTokenEncrypted: "enc",
    accessTokenExpiresAt: null,
    scopes: ["Workspace.ReadWrite.All"],
    accountMetadata: {},
    disconnectedAt: null,
    createdAt: "2026-07-15T00:00:00Z",
    updatedAt: "2026-07-15T00:00:00Z",
  };
}

function activateCtx(overrides?: Record<string, unknown>): {
  integration: IntegrationRecord;
  node: WorkflowNode;
  workflowId: string;
} {
  const node: WorkflowNode = {
    id: "n-1",
    type: "microsoft-powerbi:workspace_access_changed",
    provider: "microsoft-powerbi",
    kind: "trigger",
    config: { ...BASE_CONFIG, ...overrides },
    position: { x: 0, y: 0 },
  };
  return { integration: integration(), node, workflowId: "wf-1" };
}

function trigger(snapshot?: {
  entries: Array<{ principal: string; right: string }>;
  updatedAt: string;
}): TriggerResourceRecord {
  return {
    id: "tr-1",
    workflowId: "wf-1",
    workflowAccountId: "acct-1",
    userId: "u-1",
    provider: "microsoft-powerbi",
    eventType: "workspace_access_changed",
    nodeId: "n-1",
    config: {
      ...BASE_CONFIG,
      pollingEnabled: true,
      ...(snapshot ? { snapshot } : {}),
    },
    providerAccountId: null,
    registeredAt: "2026-07-15T00:00:00Z",
    expiresAt: null,
    lastRenewedAt: null,
    createdAt: "2026-07-15T00:00:00Z",
    updatedAt: "2026-07-15T00:00:00Z",
  };
}

const SNAPSHOT = {
  entries: [
    { principal: "alice@contoso.com", right: "Admin" },
    { principal: "bob@contoso.com", right: "Viewer" },
  ],
  updatedAt: "2026-07-15T00:00:00Z",
};

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockGroupUsersList.mockReset();
  mockEnqueue.mockReset();
  mockUpdateConfig.mockReset();
  mockGetActive.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
  mockEnqueue.mockResolvedValue({ runId: "r-1", enqueuedAt: "2026-07-15T12:00:00Z" });
  mockUpdateConfig.mockResolvedValue(undefined);
  mockGetActive.mockResolvedValue(integration());
});

describe("toAccessEntries", () => {
  it("prefers the email, falls back to the Entra object id", () => {
    expect(
      toAccessEntries([
        user("alice@contoso.com", "Admin"),
        user(null, "Member", "obj-123"),
      ]),
    ).toEqual([
      { principal: "alice@contoso.com", right: "Admin" },
      { principal: "obj-123", right: "Member" },
    ]);
  });

  it("drops rows with no stable identity rather than inventing one", () => {
    expect(toAccessEntries([user(null, "Admin", null)])).toEqual([]);
  });

  it("defaults a missing role to None", () => {
    expect(toAccessEntries([user("alice@contoso.com", null)])).toEqual([
      { principal: "alice@contoso.com", right: "None" },
    ]);
  });
});

describe("workspace_access_changed activation", () => {
  it("seeds the snapshot with the current principal→role map", async () => {
    mockGroupUsersList.mockResolvedValueOnce([
      user("alice@contoso.com", "Admin"),
      user("bob@contoso.com", "Viewer"),
    ]);

    const result = await activate(activateCtx());

    expect(mockGroupUsersList).toHaveBeenCalledTimes(1);
    expect(result.pollingEnabled).toBe(true);
    expect((result.snapshot as { entries: unknown }).entries).toEqual(SNAPSHOT.entries);
  });

  it("first poll after activation emits ZERO events for pre-existing members", async () => {
    mockGroupUsersList.mockResolvedValueOnce([
      user("alice@contoso.com", "Admin"),
      user("bob@contoso.com", "Viewer"),
    ]);
    const seeded = await activate(activateCtx());

    mockGroupUsersList.mockResolvedValueOnce([
      user("alice@contoso.com", "Admin"),
      user("bob@contoso.com", "Viewer"),
    ]);
    await pollWorkspaceAccessChanged({
      trigger: {
        ...trigger(),
        config: { ...BASE_CONFIG, pollingEnabled: true, snapshot: seeded.snapshot },
      },
      providerAccountId: "alice@contoso.com",
      now: Date.now(),
    });

    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it("throws when the seed call fails (→ TRIGGER_REGISTRATION_FAILED)", async () => {
    mockGroupUsersList.mockRejectedValueOnce(new Error("Power BI 503"));

    await expect(activate(activateCtx())).rejects.toThrow(/503/);
  });

  it("rejects a missing workspaceId in node.config", async () => {
    await expect(activate(activateCtx({ workspaceId: "" }))).rejects.toThrow();
  });
});

describe("workspace_access_changed poll", () => {
  it("emits `added` with the exact payload + short-form eventType", async () => {
    mockGroupUsersList.mockResolvedValueOnce([
      user("alice@contoso.com", "Admin"),
      user("bob@contoso.com", "Viewer"),
      user("carol@contoso.com", "Member"),
    ]);

    await pollWorkspaceAccessChanged({
      trigger: trigger(SNAPSHOT),
      providerAccountId: "alice@contoso.com",
      now: Date.now(),
    });

    expect(mockEnqueue).toHaveBeenCalledTimes(1);
    const call = mockEnqueue.mock.calls[0]![0] as {
      event: { eventType: string; payload: Record<string, unknown> };
    };
    expect(call.event.eventType).toBe("workspace_access_changed");
    expect(call.event.payload).toEqual({
      workspaceId: "ws-1",
      principal: "carol@contoso.com",
      changeType: "added",
      accessRight: "Member",
      previousAccessRight: null,
    });
  });

  it("emits `changed` with both the new and previous role", async () => {
    mockGroupUsersList.mockResolvedValueOnce([
      user("alice@contoso.com", "Admin"),
      user("bob@contoso.com", "Contributor"),
    ]);

    await pollWorkspaceAccessChanged({
      trigger: trigger(SNAPSHOT),
      providerAccountId: "alice@contoso.com",
      now: Date.now(),
    });

    expect(mockEnqueue).toHaveBeenCalledTimes(1);
    expect(
      (mockEnqueue.mock.calls[0]![0] as { event: { payload: Record<string, unknown> } }).event
        .payload,
    ).toEqual({
      workspaceId: "ws-1",
      principal: "bob@contoso.com",
      changeType: "changed",
      accessRight: "Contributor",
      previousAccessRight: "Viewer",
    });
  });

  it("emits `removed` with a null accessRight", async () => {
    mockGroupUsersList.mockResolvedValueOnce([user("alice@contoso.com", "Admin")]);

    await pollWorkspaceAccessChanged({
      trigger: trigger(SNAPSHOT),
      providerAccountId: "alice@contoso.com",
      now: Date.now(),
    });

    expect(mockEnqueue).toHaveBeenCalledTimes(1);
    expect(
      (mockEnqueue.mock.calls[0]![0] as { event: { payload: Record<string, unknown> } }).event
        .payload,
    ).toEqual({
      workspaceId: "ws-1",
      principal: "bob@contoso.com",
      changeType: "removed",
      accessRight: null,
      previousAccessRight: "Viewer",
    });
  });

  it("does NOT emit when membership is unchanged", async () => {
    mockGroupUsersList.mockResolvedValueOnce([
      user("alice@contoso.com", "Admin"),
      user("bob@contoso.com", "Viewer"),
    ]);

    await pollWorkspaceAccessChanged({
      trigger: trigger(SNAPSHOT),
      providerAccountId: "alice@contoso.com",
      now: Date.now(),
    });

    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it("persists the snapshot + polling.lastPolledAt", async () => {
    mockGroupUsersList.mockResolvedValueOnce([user("alice@contoso.com", "Admin")]);

    await pollWorkspaceAccessChanged({
      trigger: trigger(SNAPSHOT),
      providerAccountId: "alice@contoso.com",
      now: Date.parse("2026-07-15T12:00:00Z"),
    });

    const [id, config] = mockUpdateConfig.mock.calls[0] as [string, Record<string, unknown>];
    expect(id).toBe("tr-1");
    expect((config.snapshot as { entries: unknown }).entries).toEqual([
      { principal: "alice@contoso.com", right: "Admin" },
    ]);
    expect(config.polling).toEqual({ lastPolledAt: "2026-07-15T12:00:00.000Z" });
  });

  it("warns + skips without re-seeding when the snapshot is missing", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});

    await pollWorkspaceAccessChanged({
      trigger: trigger(),
      providerAccountId: "alice@contoso.com",
      now: Date.now(),
    });

    expect(mockGroupUsersList).not.toHaveBeenCalled();
    expect(mockUpdateConfig).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("microsoft-powerbi.poll.no_snapshot"),
    );
    warn.mockRestore();
  });

  it("produces a timestamp-free eventId that is stable across two identical ticks", async () => {
    mockGroupUsersList.mockResolvedValue([
      user("alice@contoso.com", "Admin"),
      user("bob@contoso.com", "Viewer"),
      user("carol@contoso.com", "Member"),
    ]);

    await pollWorkspaceAccessChanged({
      trigger: trigger(SNAPSHOT),
      providerAccountId: "alice@contoso.com",
      now: Date.parse("2026-07-15T12:00:00Z"),
    });
    await pollWorkspaceAccessChanged({
      trigger: trigger(SNAPSHOT),
      providerAccountId: "alice@contoso.com",
      now: Date.parse("2026-07-15T13:30:00Z"),
    });

    const first = (mockEnqueue.mock.calls[0]![0] as { event: { eventId: string } }).event.eventId;
    const second = (mockEnqueue.mock.calls[1]![0] as { event: { eventId: string } }).event.eventId;
    expect(first).toBe(
      `microsoft-powerbi:wf-1:n-1:workspace_access_changed:${hashPrincipal("carol@contoso.com")}:added:Member`,
    );
    expect(second).toBe(first);
    expect(first).not.toMatch(/2026-07-15T/);
  });

  it("keeps the raw email OUT of the dedup event id (hashed principal)", async () => {
    mockGroupUsersList.mockResolvedValueOnce([
      user("alice@contoso.com", "Admin"),
      user("bob@contoso.com", "Viewer"),
      user("carol@contoso.com", "Member"),
    ]);

    await pollWorkspaceAccessChanged({
      trigger: trigger(SNAPSHOT),
      providerAccountId: "alice@contoso.com",
      now: Date.now(),
    });

    const eventId = (mockEnqueue.mock.calls[0]![0] as { event: { eventId: string } }).event
      .eventId;
    // The eventId is persisted to webhook_event_dedup — raw PII must not land there.
    expect(eventId).not.toContain("carol@contoso.com");
    expect(eventId).not.toContain("@");
  });

  it("leaks no token or extra principal metadata into the payload", async () => {
    mockGroupUsersList.mockResolvedValueOnce([
      user("alice@contoso.com", "Admin"),
      user("bob@contoso.com", "Viewer"),
      user("carol@contoso.com", "Member"),
    ]);

    await pollWorkspaceAccessChanged({
      trigger: trigger(SNAPSHOT),
      providerAccountId: "alice@contoso.com",
      now: Date.now(),
    });

    const payload = JSON.stringify(
      (mockEnqueue.mock.calls[0]![0] as { event: { payload: unknown } }).event.payload,
    );
    expect(payload).not.toContain("tok");
    expect(payload).not.toContain("Bearer");
    expect(payload).not.toContain("api.powerbi.com");
    // groupUsersList carries displayName / principalType; the payload is a
    // fixed key set and must not spread them through.
    expect(payload).not.toContain("Someone");
    expect(payload).not.toContain("principalType");
  });
});
