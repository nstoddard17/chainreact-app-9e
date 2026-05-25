/**
 * @jest-environment node
 *
 * Tests for the Gmail remove_label config schema. Same shape as
 * addLabel — assert same accept/reject contract.
 */
import { RemoveLabelConfigSchema } from "@/integrations/gmail/actions/removeLabel.schema";

describe("RemoveLabelConfigSchema", () => {
  it("accepts a minimal valid config", () => {
    const r = RemoveLabelConfigSchema.safeParse({
      messageId: "msg-1",
      labelIds: ["INBOX"],
    });
    expect(r.success).toBe(true);
  });

  it("accepts multiple labelIds", () => {
    const r = RemoveLabelConfigSchema.safeParse({
      messageId: "msg-1",
      labelIds: ["INBOX", "UNREAD"],
    });
    expect(r.success).toBe(true);
  });

  it("rejects when messageId is missing or empty", () => {
    expect(
      RemoveLabelConfigSchema.safeParse({ labelIds: ["L"] }).success,
    ).toBe(false);
    expect(
      RemoveLabelConfigSchema.safeParse({ messageId: "", labelIds: ["L"] })
        .success,
    ).toBe(false);
  });

  it("rejects when labelIds is missing or empty array", () => {
    expect(
      RemoveLabelConfigSchema.safeParse({ messageId: "msg-1" }).success,
    ).toBe(false);
    expect(
      RemoveLabelConfigSchema.safeParse({ messageId: "msg-1", labelIds: [] })
        .success,
    ).toBe(false);
  });

  it("rejects when labelIds contains an empty string", () => {
    const r = RemoveLabelConfigSchema.safeParse({
      messageId: "msg-1",
      labelIds: ["INBOX", ""],
    });
    expect(r.success).toBe(false);
  });

  it("rejects messageId as an array (V1 batch shape dropped)", () => {
    const r = RemoveLabelConfigSchema.safeParse({
      messageId: ["m1", "m2"],
      labelIds: ["L"],
    });
    expect(r.success).toBe(false);
  });

  // V1 conflations + unknown fields

  it("rejects applyToThread", () => {
    expect(
      RemoveLabelConfigSchema.safeParse({
        messageId: "msg-1",
        labelIds: ["L"],
        applyToThread: true,
      }).success,
    ).toBe(false);
  });

  it("rejects searchQuery", () => {
    expect(
      RemoveLabelConfigSchema.safeParse({
        messageId: "msg-1",
        labelIds: ["L"],
        searchQuery: "is:unread",
      }).success,
    ).toBe(false);
  });

  it("rejects `addLabels` (use add_label instead)", () => {
    expect(
      RemoveLabelConfigSchema.safeParse({
        messageId: "msg-1",
        labelIds: ["L"],
        addLabels: ["X"],
      }).success,
    ).toBe(false);
  });

  it("rejects unknown fields (strict mode)", () => {
    expect(
      RemoveLabelConfigSchema.safeParse({
        messageId: "msg-1",
        labelIds: ["L"],
        xCustom: "value",
      }).success,
    ).toBe(false);
  });
});
