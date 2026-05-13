/**
 * @jest-environment node
 *
 * Tests for the Gmail add_label config schema. Validates the strict
 * shape — every V1 conflation (createIfNotExists, applyToThread,
 * searchQuery, name-based labels) is rejected at parse time.
 */
import { AddLabelConfigSchema } from "@/integrations/gmail/actions/addLabel.schema";

describe("AddLabelConfigSchema", () => {
  it("accepts a minimal valid config (messageId + non-empty labelIds)", () => {
    const r = AddLabelConfigSchema.safeParse({
      messageId: "msg-1",
      labelIds: ["Label_5"],
    });
    expect(r.success).toBe(true);
  });

  it("accepts multiple labelIds", () => {
    const r = AddLabelConfigSchema.safeParse({
      messageId: "msg-1",
      labelIds: ["Label_5", "INBOX", "IMPORTANT"],
    });
    expect(r.success).toBe(true);
  });

  it("rejects when messageId is missing", () => {
    const r = AddLabelConfigSchema.safeParse({ labelIds: ["L"] });
    expect(r.success).toBe(false);
  });

  it("rejects when messageId is empty string", () => {
    const r = AddLabelConfigSchema.safeParse({
      messageId: "",
      labelIds: ["L"],
    });
    expect(r.success).toBe(false);
  });

  it("rejects when labelIds is missing", () => {
    const r = AddLabelConfigSchema.safeParse({ messageId: "msg-1" });
    expect(r.success).toBe(false);
  });

  it("rejects when labelIds is an empty array (must include at least one)", () => {
    const r = AddLabelConfigSchema.safeParse({
      messageId: "msg-1",
      labelIds: [],
    });
    expect(r.success).toBe(false);
  });

  it("rejects when labelIds contains an empty-string id", () => {
    const r = AddLabelConfigSchema.safeParse({
      messageId: "msg-1",
      labelIds: ["INBOX", ""],
    });
    expect(r.success).toBe(false);
  });

  it("rejects messageId as an array (V1 batch shape dropped in V2)", () => {
    const r = AddLabelConfigSchema.safeParse({
      messageId: ["msg-1", "msg-2"],
      labelIds: ["L"],
    });
    expect(r.success).toBe(false);
  });

  // V1 conflations — all rejected by .strict()

  it("rejects createIfNotExists (V1 auto-create dropped — use create_label)", () => {
    const r = AddLabelConfigSchema.safeParse({
      messageId: "msg-1",
      labelIds: ["L"],
      createIfNotExists: true,
    });
    expect(r.success).toBe(false);
  });

  it("rejects autoCreate (alternative naming for V1's createIfNotExists)", () => {
    const r = AddLabelConfigSchema.safeParse({
      messageId: "msg-1",
      labelIds: ["L"],
      autoCreate: true,
    });
    expect(r.success).toBe(false);
  });

  it("rejects applyToThread (silent thread-level labeling dropped)", () => {
    const r = AddLabelConfigSchema.safeParse({
      messageId: "msg-1",
      labelIds: ["L"],
      applyToThread: true,
    });
    expect(r.success).toBe(false);
  });

  it("rejects searchQuery (V1's bulk-label-by-search compound action dropped)", () => {
    const r = AddLabelConfigSchema.safeParse({
      messageId: "msg-1",
      labelIds: ["L"],
      searchQuery: "is:unread",
    });
    expect(r.success).toBe(false);
  });

  it("rejects `labels` (V1 name list — V2 uses labelIds only)", () => {
    const r = AddLabelConfigSchema.safeParse({
      messageId: "msg-1",
      labels: ["MyLabel"],
    });
    expect(r.success).toBe(false);
  });

  it("rejects `addLabels` (V1 conflation — V2 uses labelIds only)", () => {
    const r = AddLabelConfigSchema.safeParse({
      messageId: "msg-1",
      addLabels: ["MyLabel"],
    });
    expect(r.success).toBe(false);
  });

  it("rejects `removeLabels` (use remove_label action for inverse)", () => {
    const r = AddLabelConfigSchema.safeParse({
      messageId: "msg-1",
      labelIds: ["L"],
      removeLabels: ["X"],
    });
    expect(r.success).toBe(false);
  });

  it("rejects unknown fields generally (strict mode)", () => {
    const r = AddLabelConfigSchema.safeParse({
      messageId: "msg-1",
      labelIds: ["L"],
      xCustomField: "value",
    });
    expect(r.success).toBe(false);
  });
});
