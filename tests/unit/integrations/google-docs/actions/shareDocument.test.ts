/**
 * @jest-environment node
 *
 * Slice 3.GDOCS-2 — google-docs:share_document action handler.
 *
 * Q11 — sendNotification REQUIRED EXPLICIT.
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockPermissionsCreate = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/google-drive/api/permissionsCreate", () => ({
  permissionsCreate: (...args: unknown[]) => mockPermissionsCreate(...args),
}));

import { shareDocument } from "@/integrations/google-docs/actions/shareDocument";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockPermissionsCreate.mockReset();
  mockRefreshAndRetry.mockImplementation(async ({ apiCall }) =>
    apiCall("ya29.access"),
  );
});

function docsTrigger(): TriggerEvent {
  return {
    provider: "google-docs",
    eventType: "document_updated",
    eventId: "evt-1",
    occurredAt: "2026-05-23T12:00:00Z",
    accountId: "alice@example.com",
    payload: {},
  };
}

describe("share_document — Q11 sendNotification gate", () => {
  it("rejects when sendNotification is missing", async () => {
    await expect(
      shareDocument({
        workflowId: "w",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: {
          documentId: "doc-1",
          shareWith: ["a@e.com"],
        },
        triggerEvent: docsTrigger(),
      }),
    ).rejects.toThrow(/Send Notification/i);
    expect(mockPermissionsCreate).not.toHaveBeenCalled();
  });

  it("accepts sendNotification: false as a valid explicit choice", async () => {
    mockPermissionsCreate.mockResolvedValueOnce({ id: "perm-1" });
    await shareDocument({
      workflowId: "w",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        documentId: "doc-1",
        shareWith: ["a@e.com"],
        sendNotification: false,
      },
      triggerEvent: docsTrigger(),
    });
    const args = mockPermissionsCreate.mock.calls[0]![0]! as {
      sendNotificationEmail: boolean;
    };
    expect(args.sendNotificationEmail).toBe(false);
  });
});

describe("share_document — per-user sharing", () => {
  it("calls permissions.create once per email", async () => {
    mockPermissionsCreate
      .mockResolvedValueOnce({ id: "perm-1" })
      .mockResolvedValueOnce({ id: "perm-2" });
    const result = await shareDocument({
      workflowId: "w",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        documentId: "doc-1",
        shareWith: ["a@e.com", "b@e.com"],
        permission: "writer",
        sendNotification: true,
      },
      triggerEvent: docsTrigger(),
    });
    expect(mockPermissionsCreate).toHaveBeenCalledTimes(2);
    expect(result.output.sharedWith).toEqual(["a@e.com", "b@e.com"]);
    expect(result.output.permissionIds).toEqual(["perm-1", "perm-2"]);
    expect(result.output.isPublic).toBe(false);
  });

  it("passes permission enum value verbatim to Drive (canonical names)", async () => {
    mockPermissionsCreate.mockResolvedValueOnce({ id: "perm-1" });
    await shareDocument({
      workflowId: "w",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        documentId: "doc-1",
        shareWith: ["a@e.com"],
        permission: "commenter",
        sendNotification: true,
      },
      triggerEvent: docsTrigger(),
    });
    const args = mockPermissionsCreate.mock.calls[0]![0]! as {
      body: { role: string };
    };
    expect(args.body.role).toBe("commenter");
  });

  it("forwards `message` as emailMessage when sendNotification=true and message provided", async () => {
    mockPermissionsCreate.mockResolvedValueOnce({ id: "perm-1" });
    await shareDocument({
      workflowId: "w",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        documentId: "doc-1",
        shareWith: ["a@e.com"],
        sendNotification: true,
        message: "Please review",
      },
      triggerEvent: docsTrigger(),
    });
    const args = mockPermissionsCreate.mock.calls[0]![0]! as {
      body: { emailMessage?: string };
    };
    expect(args.body.emailMessage).toBe("Please review");
  });

  it("captures per-email failures in `errors` without aborting the rest", async () => {
    mockPermissionsCreate
      .mockRejectedValueOnce(new Error("Invalid email format"))
      .mockResolvedValueOnce({ id: "perm-good" });
    const result = await shareDocument({
      workflowId: "w",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        documentId: "doc-1",
        shareWith: ["bad-email", "good@e.com"],
        sendNotification: false,
      },
      triggerEvent: docsTrigger(),
    });
    const errors = result.output.errors as Array<{ email?: string; message: string }>;
    expect(errors).toHaveLength(1);
    expect(errors[0]!.email).toBe("bad-email");
    expect(result.output.sharedWith).toEqual(["good@e.com"]);
  });
});

describe("share_document — public sharing (makePublic)", () => {
  it("creates an anyone-type permission when makePublic: true", async () => {
    mockPermissionsCreate
      .mockResolvedValueOnce({ id: "perm-user" }) // per-user
      .mockResolvedValueOnce({ id: "perm-pub" }); // public
    const result = await shareDocument({
      workflowId: "w",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        documentId: "doc-1",
        shareWith: ["a@e.com"],
        sendNotification: false,
        makePublic: true,
        publicPermission: "reader",
        allowDiscovery: true,
      },
      triggerEvent: docsTrigger(),
    });
    expect(mockPermissionsCreate).toHaveBeenCalledTimes(2);
    const publicArgs = mockPermissionsCreate.mock.calls[1]![0]! as {
      body: { type: string; role: string; allowFileDiscovery?: boolean };
      sendNotificationEmail: boolean;
    };
    expect(publicArgs.body.type).toBe("anyone");
    expect(publicArgs.body.role).toBe("reader");
    expect(publicArgs.body.allowFileDiscovery).toBe(true);
    expect(publicArgs.sendNotificationEmail).toBe(false);
    expect(result.output.isPublic).toBe(true);
  });

  it("can share publicly with zero shareWith entries", async () => {
    mockPermissionsCreate.mockResolvedValueOnce({ id: "perm-pub" });
    const result = await shareDocument({
      workflowId: "w",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        documentId: "doc-1",
        sendNotification: false,
        makePublic: true,
      },
      triggerEvent: docsTrigger(),
    });
    expect(mockPermissionsCreate).toHaveBeenCalledTimes(1);
    expect(result.output.isPublic).toBe(true);
    expect(result.output.sharedWith).toEqual([]);
  });
});

describe("share_document — transferOwnership", () => {
  it("sets transferOwnership + moveToNewOwnersRoot on the wrapper call", async () => {
    mockPermissionsCreate.mockResolvedValueOnce({ id: "perm-1" });
    await shareDocument({
      workflowId: "w",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        documentId: "doc-1",
        shareWith: ["newowner@e.com"],
        permission: "owner",
        sendNotification: true,
        transferOwnership: true,
      },
      triggerEvent: docsTrigger(),
    });
    const args = mockPermissionsCreate.mock.calls[0]![0]! as {
      transferOwnership?: boolean;
      moveToNewOwnersRoot?: boolean;
    };
    expect(args.transferOwnership).toBe(true);
    expect(args.moveToNewOwnersRoot).toBe(true);
  });

  it("schema rejects transferOwnership: true without permission='owner'", async () => {
    await expect(
      shareDocument({
        workflowId: "w",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: {
          documentId: "doc-1",
          shareWith: ["a@e.com"],
          permission: "writer",
          sendNotification: true,
          transferOwnership: true,
        },
        triggerEvent: docsTrigger(),
      }),
    ).rejects.toThrow(/permission='owner'/);
    expect(mockPermissionsCreate).not.toHaveBeenCalled();
  });

  it("schema rejects transferOwnership with multiple shareWith recipients", async () => {
    await expect(
      shareDocument({
        workflowId: "w",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: {
          documentId: "doc-1",
          shareWith: ["a@e.com", "b@e.com"],
          permission: "owner",
          sendNotification: true,
          transferOwnership: true,
        },
        triggerEvent: docsTrigger(),
      }),
    ).rejects.toThrow(/exactly one shareWith/);
    expect(mockPermissionsCreate).not.toHaveBeenCalled();
  });
});

describe("share_document — output shape", () => {
  it("returns documentId / documentUrl / sharedWith / isPublic / permissionIds / errors", async () => {
    mockPermissionsCreate.mockResolvedValueOnce({ id: "perm-1" });
    const result = await shareDocument({
      workflowId: "w",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        documentId: "doc-1",
        shareWith: ["a@e.com"],
        sendNotification: false,
      },
      triggerEvent: docsTrigger(),
    });
    expect(result.output.documentId).toBe("doc-1");
    expect(result.output.documentUrl).toBe(
      "https://docs.google.com/document/d/doc-1/edit",
    );
    expect(result.output.sharedWith).toEqual(["a@e.com"]);
    expect(result.output.isPublic).toBe(false);
    expect(result.output.permissionIds).toEqual(["perm-1"]);
    expect(result.output.errors).toEqual([]);
  });
});
