/** @jest-environment node */
/**
 * CONFIG-UX-NODE-SUMMARY-1 — the at-a-glance summary is task-shaped, shows
 * recognizable resource names (not ids), distinguishes fixed / dynamic /
 * condition values, and is honest when a label isn't known yet.
 */
import {
  buildNodeConfigSummary,
  resourceRefsForSummary,
} from "@/core/workflows/nodeConfigSummary";
import type { FieldMeta } from "@/contracts/actionMeta";

const slackFields: FieldMeta[] = [
  { name: "channel", label: "Channel", type: "combobox", required: true, optionsSource: "slack:channels", allowManualEntry: true },
  { name: "message", label: "Message", type: "textarea", required: true },
  { name: "asUser", label: "Send as you", type: "boolean", required: false },
] as FieldMeta[];

const labelFor = (source: string, value: string): string | undefined => {
  const table: Record<string, string> = { "slack:channels|C123": "#support-alerts" };
  return table[`${source}|${value}`];
};

describe("buildNodeConfigSummary — resource labels + task-shaped headline", () => {
  it("shows the recognizable channel name, not the stored id, in the headline", () => {
    const summary = buildNodeConfigSummary({
      displayName: "Send Channel Message",
      fields: slackFields,
      config: { channel: "C123", message: "Deploy finished" },
      labelFor,
    });
    expect(summary.headline).toBe("Send Channel Message · #support-alerts");
    const channelSeg = summary.segments.find((s) => s.label === "Channel")!;
    expect(channelSeg.kind).toBe("resource");
    expect(channelSeg.display).toBe("#support-alerts");
    expect(channelSeg.unresolved).toBeUndefined();
  });

  it("falls back to the raw id and flags it unresolved when no label is known yet", () => {
    const summary = buildNodeConfigSummary({
      displayName: "Send Channel Message",
      fields: slackFields,
      config: { channel: "C999", message: "hi" },
      labelFor, // knows only C123
    });
    const channelSeg = summary.segments.find((s) => s.label === "Channel")!;
    expect(channelSeg.display).toBe("C999");
    expect(channelSeg.unresolved).toBe(true);
    // Headline still uses it (honest) rather than inventing a name.
    expect(summary.headline).toBe("Send Channel Message · C999");
  });

  it("marks a variable-backed resource as dynamic ('from an earlier step'), never a fake name", () => {
    const summary = buildNodeConfigSummary({
      displayName: "Send Channel Message",
      fields: slackFields,
      config: { channel: "{{step1.channelId}}", message: "hi" },
      labelFor,
    });
    const channelSeg = summary.segments.find((s) => s.label === "Channel")!;
    expect(channelSeg.kind).toBe("dynamic");
    expect(channelSeg.display).toMatch(/from an earlier step/i);
  });

  it("reads a trigger reference as 'from the trigger'", () => {
    const summary = buildNodeConfigSummary({
      displayName: "Send Channel Message",
      fields: slackFields,
      config: { message: "{{trigger.subject}}", channel: "C123" },
      labelFor,
    });
    const msg = summary.segments.find((s) => s.label === "Message")!;
    expect(msg.kind).toBe("dynamic");
    expect(msg.display).toBe("from the trigger");
  });

  it("classifies select/boolean values as conditions with their option labels", () => {
    const fields: FieldMeta[] = [
      {
        name: "importance", label: "Importance", type: "select", required: true,
        options: [
          { value: "low", label: "Low" },
          { value: "high", label: "High" },
        ],
      },
      { name: "isHtml", label: "Send as HTML", type: "boolean", required: true },
    ] as FieldMeta[];
    const summary = buildNodeConfigSummary({
      displayName: "Send Email",
      fields,
      config: { importance: "high", isHtml: true },
    });
    expect(summary.segments).toEqual([
      { name: "importance", label: "Importance", display: "High", kind: "condition" },
      { name: "isHtml", label: "Send as HTML", display: "Yes", kind: "condition" },
    ]);
  });

  it("skips empty and hidden (unmet visibleWhen) fields", () => {
    const fields: FieldMeta[] = [
      { name: "mode", label: "Mode", type: "select", required: true, options: [
        { value: "simple", label: "Simple" }, { value: "custom", label: "Custom" }] },
      { name: "customBody", label: "Custom body", type: "textarea", required: false,
        visibleWhen: { field: "mode", valueIn: ["custom"] } },
      { name: "note", label: "Note", type: "text", required: false },
    ] as FieldMeta[];
    const summary = buildNodeConfigSummary({
      displayName: "Do Thing",
      fields,
      config: { mode: "simple", customBody: "leftover from other mode", note: "" },
    });
    // customBody is hidden (mode=simple) and note is empty → only the mode.
    expect(summary.segments.map((s) => s.label)).toEqual(["Mode"]);
  });

  it("summarizes structured objects/rows by count, never dumping the shape", () => {
    const fields: FieldMeta[] = [
      { name: "lineItems", label: "Line items", type: "object-list", required: true,
        itemFields: [{ name: "priceId", label: "Price", type: "text", required: true }] },
    ] as FieldMeta[];
    const summary = buildNodeConfigSummary({
      displayName: "Create Checkout",
      fields,
      config: { lineItems: [{ priceId: "price_1" }, { priceId: "price_2" }] },
    });
    expect(summary.segments[0]).toEqual({
      name: "lineItems",
      label: "Line items",
      display: "2 set",
      kind: "fixed",
    });
  });

  it("empty config → empty summary with the plain node name", () => {
    const summary = buildNodeConfigSummary({
      displayName: "Send Channel Message",
      fields: slackFields,
      config: {},
    });
    expect(summary.empty).toBe(true);
    expect(summary.headline).toBe("Send Channel Message");
    expect(summary.segments).toEqual([]);
  });

  it("per-chip resource arrays show resolved labels", () => {
    const fields: FieldMeta[] = [
      { name: "labelIds", label: "Labels", type: "string-array", required: false, optionsSource: "gmail:labels" },
    ] as FieldMeta[];
    const summary = buildNodeConfigSummary({
      displayName: "Add Label",
      fields,
      config: { labelIds: ["L1", "L2"] },
      labelFor: (s, v) => {
        const table: Record<string, string> = {
          "gmail:labels|L1": "Receipts",
          "gmail:labels|L2": "Taxes",
        };
        return table[`${s}|${v}`];
      },
    });
    expect(summary.segments[0]!.display).toBe("Receipts, Taxes");
    expect(summary.segments[0]!.kind).toBe("resource");
  });
});

describe("resourceRefsForSummary — cache warming", () => {
  it("lists the (source, value) resource refs a label cache must know", () => {
    const refs = resourceRefsForSummary(slackFields, { channel: "C123", message: "hi" });
    expect(refs).toEqual([{ source: "slack:channels", value: "C123" }]);
  });

  it("excludes variable-backed and empty values", () => {
    const refs = resourceRefsForSummary(slackFields, { channel: "{{s.x}}", message: "hi" });
    expect(refs).toEqual([]);
  });
});
