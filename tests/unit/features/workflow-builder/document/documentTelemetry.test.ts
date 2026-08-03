/** @jest-environment node */
import { afterEach, describe, expect, it, jest } from "@jest/globals";
import {
  emitDocumentBuilderEvent,
  nodeCountBucket,
  sanitizeTelemetryProps,
  setDocumentBuilderTelemetryEnabled,
  setDocumentBuilderTelemetrySink,
  type DocumentBuilderEventName,
  type DocumentBuilderEventProps,
} from "@/features/workflow-builder/document/documentTelemetry";
import { fakeSlackBotToken } from "@/tests/helpers/syntheticSecrets";

/**
 * 5.DUAL-BUILDER-1 CS-7 — the Document Builder telemetry seam. Locks the safety
 * contract: bounded categorical/count props only (never workflow content), flag
 * gate, no-op default sink, and analytics failures never propagate.
 */

afterEach(() => {
  setDocumentBuilderTelemetrySink(null);
  setDocumentBuilderTelemetryEnabled(false);
});

describe("sanitizeTelemetryProps — bounded categorical/count only", () => {
  it("keeps allow-listed short tokens, small integers, and booleans", () => {
    expect(
      sanitizeTelemetryProps({ to: "document", tier: "b", count: 3, supported: true }),
    ).toEqual({ to: "document", tier: "b", count: 3, supported: true });
  });

  it("drops keys outside the allow-list (e.g. a node id or a title)", () => {
    expect(
      sanitizeTelemetryProps({ nodeId: "node-abc", title: "My Section", workflowName: "Sales" }),
    ).toEqual({});
  });

  it("drops string values that are NOT short categorical tokens (prompts, labels, titles)", () => {
    // Free text / route labels / section titles contain spaces or mixed case/punct.
    expect(sanitizeTelemetryProps({ reason: "Big account path" })).toEqual({});
    expect(sanitizeTelemetryProps({ kind: "Send an email to the customer!" })).toEqual({});
    expect(sanitizeTelemetryProps({ source: "a".repeat(64) })).toEqual({});
  });

  it("drops numbers that are not bounded integer buckets", () => {
    expect(sanitizeTelemetryProps({ count: -1 })).toEqual({});
    expect(sanitizeTelemetryProps({ count: 1.5 })).toEqual({});
    expect(sanitizeTelemetryProps({ count: 999_999 })).toEqual({});
  });

  it("drops object/array values entirely (never serializes payloads)", () => {
    expect(
      sanitizeTelemetryProps({ reason: { secret: "x" }, kind: ["a", "b"] }),
    ).toEqual({});
  });

  it("caps cardinality at 8 keys", () => {
    const many: Record<string, string> = {};
    for (let i = 0; i < 20; i++) many[`source`] = "x"; // same key overwrites → 1
    expect(Object.keys(sanitizeTelemetryProps(many)).length).toBeLessThanOrEqual(8);
  });
});

describe("nodeCountBucket", () => {
  it("buckets counts into coarse categories, never the raw value", () => {
    expect(nodeCountBucket(0)).toBe(0);
    expect(nodeCountBucket(3)).toBe(5);
    expect(nodeCountBucket(9)).toBe(10);
    expect(nodeCountBucket(25)).toBe(30);
    expect(nodeCountBucket(80)).toBe(100);
    expect(nodeCountBucket(500)).toBe(101);
  });
});

describe("emitDocumentBuilderEvent — flag gate + no-op sink + never throws", () => {
  it("emits nothing when the flag is OFF (even with a sink registered)", () => {
    const sink = jest.fn();
    setDocumentBuilderTelemetrySink(sink);
    setDocumentBuilderTelemetryEnabled(false);
    emitDocumentBuilderEvent("document_map_opened");
    expect(sink).not.toHaveBeenCalled();
  });

  it("emits nothing when no sink is registered (no-op default)", () => {
    setDocumentBuilderTelemetryEnabled(true);
    // No sink registered → must not throw.
    expect(() => emitDocumentBuilderEvent("document_map_opened")).not.toThrow();
  });

  it("forwards sanitized props to the sink when enabled", () => {
    const seen: Array<[DocumentBuilderEventName, DocumentBuilderEventProps]> = [];
    setDocumentBuilderTelemetrySink((name, props) => seen.push([name, props]));
    setDocumentBuilderTelemetryEnabled(true);
    emitDocumentBuilderEvent("document_insert_used", { kind: "branch", title: "Hot leads" });
    expect(seen).toEqual([["document_insert_used", { kind: "branch" }]]);
  });

  it("swallows a throwing sink so analytics failure never blocks the UI", () => {
    setDocumentBuilderTelemetrySink(() => {
      throw new Error("analytics down");
    });
    setDocumentBuilderTelemetryEnabled(true);
    expect(() => emitDocumentBuilderEvent("document_guided_stop_completed")).not.toThrow();
  });
});

// 5.DUAL-BUILDER-1 CS-7G — telemetry safety: the Agent preview events never carry any
// prompt / workflow / user content, even if a forged caller tries to attach it.
describe("CS-7G Agent-preview telemetry carries no prompt/workflow/user content", () => {
  it("preview applied/rejected emit with NO props (name only)", () => {
    const seen: Array<[DocumentBuilderEventName, DocumentBuilderEventProps]> = [];
    setDocumentBuilderTelemetrySink((name, props) => seen.push([name, props]));
    setDocumentBuilderTelemetryEnabled(true);
    emitDocumentBuilderEvent("document_agent_preview_applied");
    emitDocumentBuilderEvent("document_agent_preview_rejected");
    expect(seen).toEqual([
      ["document_agent_preview_applied", {}],
      ["document_agent_preview_rejected", {}],
    ]);
  });

  it("strips every forbidden category if a caller tries to attach it", () => {
    // The exact leak categories CS-7G forbids: prompt text, workflow/section titles, route
    // labels, node ids, account/user ids/emails, provider payloads, config values, secrets.
    const forbidden = {
      prompt: "Change the notification message and add a follow-up step",
      workflow_title: "Sales alerts",
      section_title: "Lead handling",
      route: "/workflows/abc-123",
      nodeId: "n-notif",
      accountId: "acc_123",
      userId: "user_456",
      email: "person@example.com",
      config: { channel: "C0NOTIFY", text: "secret body" },
      // V2-READY-45: runtime-assembled (no literal token shape in source). The
      // `toEqual({})` assertion below is unchanged — every prop must be stripped.
      token: fakeSlackBotToken("supersecret"),
    } as Record<string, unknown>;
    expect(sanitizeTelemetryProps(forbidden)).toEqual({});
  });
});
