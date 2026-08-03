/** @jest-environment node */
/**
 * Tests for core/workflows/nodeDisplayName (Slice 4.BUILDER-NODE-IDENTITY-1).
 *
 * Pure resolver: the user's custom name wins, then metadata, then a friendly
 * title-cased type key, then a kind fallback. A raw node id is never returned.
 */
import {
  formatTypeKey,
  getNodeDisplayName,
} from "@/core/workflows/nodeDisplayName";

describe("formatTypeKey", () => {
  it("title-cases an underscore type key", () => {
    expect(formatTypeKey("send_channel_message")).toBe("Send Channel Message");
  });

  it("splits on dots / dashes / colons", () => {
    expect(formatTypeKey("manual.run")).toBe("Manual Run");
    expect(formatTypeKey("event_received")).toBe("Event Received");
    expect(formatTypeKey("new-email")).toBe("New Email");
  });

  it("returns empty string for an empty key", () => {
    expect(formatTypeKey("")).toBe("");
  });
});

describe("getNodeDisplayName — resolution order", () => {
  const action = { kind: "action" as const, provider: "slack", type: "send_channel_message" };

  it("1) returns the user's custom displayName when set (trimmed)", () => {
    expect(
      getNodeDisplayName({ ...action, displayName: "  Notify Support Team  " }, { displayName: "Send Channel Message" }),
    ).toBe("Notify Support Team");
  });

  it("2) falls back to the metadata display name when no custom name", () => {
    expect(getNodeDisplayName(action, { displayName: "Send Channel Message" })).toBe(
      "Send Channel Message",
    );
  });

  it("3) falls back to a formatted type key when no custom name and no meta", () => {
    expect(getNodeDisplayName(action)).toBe("Send Channel Message");
    expect(getNodeDisplayName(action, null)).toBe("Send Channel Message");
    expect(getNodeDisplayName(action, { displayName: null })).toBe("Send Channel Message");
  });

  it("4) falls back to the kind label for an unconfigured node (empty type)", () => {
    expect(getNodeDisplayName({ kind: "trigger", provider: "slack", type: "" })).toBe("Trigger");
    expect(getNodeDisplayName({ kind: "action", provider: "slack", type: "" })).toBe("Action");
  });

  it("treats a blank/whitespace custom name as absent (falls through to meta)", () => {
    expect(getNodeDisplayName({ ...action, displayName: "   " }, { displayName: "Send Channel Message" })).toBe(
      "Send Channel Message",
    );
  });

  it("never returns a raw node id as the label", () => {
    // The helper has no access to the id by design — it only sees identity +
    // optional custom/meta names — so a raw id can never leak into the label.
    const label = getNodeDisplayName({ kind: "action", provider: "gmail", type: "new_email" });
    expect(label).toBe("New Email");
  });
});
