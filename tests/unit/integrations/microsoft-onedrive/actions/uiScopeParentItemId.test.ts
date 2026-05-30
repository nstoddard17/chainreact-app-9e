/**
 * @jest-environment node
 *
 * Slice 4.ONEDRIVE-META-3 — UI-scope `parentItemId` schema additions.
 *
 * The 4 item-targeted OneDrive action schemas gained an optional,
 * handler-ignored `parentItemId` so the persisted Builder config (which
 * carries the source-folder picker value used to cascade the `itemId`
 * picker) validates. These tests pin:
 *   - each schema accepts + preserves an optional parentItemId;
 *   - `.strict()` still rejects genuinely-unknown fields;
 *   - move_item's "at least one of targetParentItemId / newName" rule does
 *     NOT count parentItemId;
 *   - the handler IGNORES parentItemId at runtime (never forwarded to the
 *     provider API) — runtime behavior unchanged.
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

import { GetFileConfigSchema } from "@/integrations/microsoft-onedrive/actions/getFile.schema";
import { DeleteItemConfigSchema } from "@/integrations/microsoft-onedrive/actions/deleteItem.schema";
import { MoveItemConfigSchema } from "@/integrations/microsoft-onedrive/actions/moveItem.schema";
import { CopyItemConfigSchema } from "@/integrations/microsoft-onedrive/actions/copyItem.schema";

const mockRefreshAndRetry = jest.fn();
const mockGet = jest.fn();
jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));
jest.mock("@/integrations/microsoft-onedrive/api/driveItemsGet", () => ({
  driveItemsGet: (...args: unknown[]) => mockGet(...args),
}));

import { getFile } from "@/integrations/microsoft-onedrive/actions/getFile";

const ITEM_TARGETED = [
  {
    name: "get_file",
    schema: GetFileConfigSchema,
    base: { itemId: "i1" } as Record<string, unknown>,
  },
  {
    name: "delete_item",
    schema: DeleteItemConfigSchema,
    base: { itemId: "i1" } as Record<string, unknown>,
  },
  {
    name: "move_item",
    schema: MoveItemConfigSchema,
    base: { itemId: "i1", newName: "renamed" } as Record<string, unknown>,
  },
  {
    name: "copy_item",
    schema: CopyItemConfigSchema,
    base: { itemId: "i1", targetParentItemId: "t1" } as Record<string, unknown>,
  },
] as const;

describe("UI-scope parentItemId — the 4 item-targeted schemas", () => {
  for (const c of ITEM_TARGETED) {
    it(`${c.name} accepts an optional parentItemId and preserves it`, () => {
      const r = c.schema.safeParse({ ...c.base, parentItemId: "p1" });
      expect(r.success).toBe(true);
      if (r.success) {
        expect((r.data as { parentItemId?: string }).parentItemId).toBe("p1");
      }
    });

    it(`${c.name} still parses WITHOUT parentItemId (it is optional)`, () => {
      expect(c.schema.safeParse(c.base).success).toBe(true);
    });

    it(`${c.name} still rejects genuinely-unknown fields (strict)`, () => {
      expect(
        c.schema.safeParse({ ...c.base, parentItemId: "p1", totallyUnknown: "x" })
          .success,
      ).toBe(false);
    });
  }
});

describe("UI-scope parentItemId — move_item refine unaffected", () => {
  it("parentItemId does NOT satisfy the 'at least one of targetParentItemId / newName' rule", () => {
    expect(
      MoveItemConfigSchema.safeParse({ itemId: "i1", parentItemId: "p1" }).success,
    ).toBe(false);
  });

  it("parentItemId alongside a real mutable (newName) passes", () => {
    expect(
      MoveItemConfigSchema.safeParse({
        itemId: "i1",
        parentItemId: "p1",
        newName: "x",
      }).success,
    ).toBe(true);
  });
});

describe("UI-scope parentItemId — handler ignores it at runtime", () => {
  beforeEach(() => {
    mockRefreshAndRetry.mockReset();
    mockGet.mockReset();
    mockRefreshAndRetry.mockImplementation(
      async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
    );
  });

  it("get_file never forwards parentItemId to driveItemsGet", async () => {
    mockGet.mockResolvedValueOnce({ id: "i1", name: "f.txt", file: { mimeType: "text/plain" } });

    const triggerEvent: TriggerEvent = {
      provider: "manual",
      eventType: "manual",
      eventId: "evt-1",
      occurredAt: "2026-05-25T00:00:00Z",
      providerAccountId: "manual",
      payload: {},
    };

    const result = await getFile({
      workflowId: "wf",
      runId: "r",
      nodeId: "n",
      userId: "u",
      accountId: "acct-u",
      // parentItemId is the UI-scope field — present in the persisted config.
      config: { parentItemId: "p-ui-only", itemId: "i1" },
      triggerEvent,
    });

    expect(mockGet).toHaveBeenCalledTimes(1);
    const apiArg = mockGet.mock.calls[0]![0] as Record<string, unknown>;
    expect(apiArg.parentItemId).toBeUndefined();
    expect(apiArg.itemId).toBe("i1");
    expect((result.output as Record<string, unknown>).itemId).toBe("i1");
  });
});
