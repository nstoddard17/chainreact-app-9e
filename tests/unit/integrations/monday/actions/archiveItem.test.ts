/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockItemsArchive = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/_shared/monday/api/itemsArchive", () => ({
  itemsArchive: (...args: unknown[]) => mockItemsArchive(...args),
}));

import { archiveItem } from "@/integrations/monday/actions/archiveItem";
import { ArchiveItemConfigSchema } from "@/integrations/monday/actions/archiveItem.schema";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockItemsArchive.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

function trigger(): TriggerEvent {
  return {
    provider: "monday",
    eventType: "manual",
    eventId: "evt-1",
    occurredAt: "2026-05-24T00:00:00Z",
    accountId: "alice@example.com",
    payload: {},
  };
}

describe("archive_item schema", () => {
  it("requires itemId; boardId optional", () => {
    expect(() => ArchiveItemConfigSchema.parse({ itemId: "i" })).not.toThrow();
    expect(() =>
      ArchiveItemConfigSchema.parse({ itemId: "i", boardId: "b" }),
    ).not.toThrow();
    expect(() => ArchiveItemConfigSchema.parse({ boardId: "b" })).toThrow();
  });

  it("rejects unknown fields", () => {
    expect(() =>
      ArchiveItemConfigSchema.parse({ itemId: "i", bogus: 1 }),
    ).toThrow();
  });
});

describe("archive_item handler — structural-only output (recoverable)", () => {
  it("output is structural only: success / archivedItemId / archivedAt", async () => {
    mockItemsArchive.mockResolvedValueOnce({ id: "i-1" });
    const result = await archiveItem({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { itemId: "i-1" },
      triggerEvent: trigger(),
    });
    expect(Object.keys(result.output).sort()).toEqual([
      "archivedAt",
      "archivedItemId",
      "success",
    ]);
    expect(result.output.success).toBe(true);
    expect(result.output.archivedItemId).toBe("i-1");
  });

  it("does not echo item name even if wrapper returns extra fields", async () => {
    mockItemsArchive.mockResolvedValueOnce({
      id: "i-1",
      name: "Secret name",
    });
    const result = await archiveItem({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { itemId: "i-1" },
      triggerEvent: trigger(),
    });
    expect(JSON.stringify(result.output)).not.toContain("Secret name");
  });

  it("passes only itemId to the wrapper", async () => {
    mockItemsArchive.mockResolvedValueOnce({ id: "i-1" });
    await archiveItem({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { itemId: "i-1", boardId: "b" },
      triggerEvent: trigger(),
    });
    expect(mockItemsArchive.mock.calls[0]![0].itemId).toBe("i-1");
    expect(mockItemsArchive.mock.calls[0]![0]).not.toHaveProperty("boardId");
  });

  it("uses refreshAndRetry provider='monday'", async () => {
    mockItemsArchive.mockResolvedValueOnce({ id: "i" });
    await archiveItem({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { itemId: "i" },
      triggerEvent: trigger(),
    });
    expect(mockRefreshAndRetry.mock.calls[0]![0].provider).toBe("monday");
    expect(mockRefreshAndRetry.mock.calls[0]![0].accountId).toBe(
      "alice@example.com",
    );
  });
});
