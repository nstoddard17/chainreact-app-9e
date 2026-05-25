/**
 * @jest-environment node
 *
 * Tests for the Gmail delete_email config schema. Pins decision 2:
 * `deleteMode` is REQUIRED with no silent default.
 */
import { DeleteEmailConfigSchema } from "@/integrations/gmail/actions/deleteEmail.schema";

describe("DeleteEmailConfigSchema", () => {
  it("accepts deleteMode: 'trash'", () => {
    expect(
      DeleteEmailConfigSchema.safeParse({
        messageId: "msg-1",
        deleteMode: "trash",
      }).success,
    ).toBe(true);
  });

  it("accepts deleteMode: 'permanent'", () => {
    expect(
      DeleteEmailConfigSchema.safeParse({
        messageId: "msg-1",
        deleteMode: "permanent",
      }).success,
    ).toBe(true);
  });

  it("REJECTS when deleteMode is missing (decision 2 — no silent default)", () => {
    const r = DeleteEmailConfigSchema.safeParse({ messageId: "msg-1" });
    expect(r.success).toBe(false);
  });

  it("rejects deleteMode: invalid enum value", () => {
    const r = DeleteEmailConfigSchema.safeParse({
      messageId: "msg-1",
      deleteMode: "soft",
    });
    expect(r.success).toBe(false);
  });

  it("rejects deleteMode as boolean (V1 `permanentDelete: boolean` shape dropped)", () => {
    const r = DeleteEmailConfigSchema.safeParse({
      messageId: "msg-1",
      deleteMode: true,
    });
    expect(r.success).toBe(false);
  });

  it("rejects V1 `permanentDelete` field at top level", () => {
    const r = DeleteEmailConfigSchema.safeParse({
      messageId: "msg-1",
      permanentDelete: true,
    });
    expect(r.success).toBe(false);
  });

  it("rejects when messageId is missing", () => {
    expect(
      DeleteEmailConfigSchema.safeParse({ deleteMode: "trash" }).success,
    ).toBe(false);
  });

  it("rejects when messageId is empty string", () => {
    expect(
      DeleteEmailConfigSchema.safeParse({
        messageId: "",
        deleteMode: "trash",
      }).success,
    ).toBe(false);
  });

  it("rejects messageId as an array (V1 batch shape dropped)", () => {
    const r = DeleteEmailConfigSchema.safeParse({
      messageId: ["m1", "m2"],
      deleteMode: "trash",
    });
    expect(r.success).toBe(false);
  });

  it("rejects searchQuery (V1 bulk-delete-by-search dropped)", () => {
    const r = DeleteEmailConfigSchema.safeParse({
      messageId: "msg-1",
      deleteMode: "trash",
      searchQuery: "is:spam",
    });
    expect(r.success).toBe(false);
  });

  it("rejects unknown fields (strict mode)", () => {
    expect(
      DeleteEmailConfigSchema.safeParse({
        messageId: "msg-1",
        deleteMode: "trash",
        confirm: true,
      }).success,
    ).toBe(false);
  });
});
