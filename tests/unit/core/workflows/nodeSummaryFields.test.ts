/**
 * @jest-environment node
 *
 * Tests for core/workflows/nodeSummaryFields (CONFIG-UX-NODE-SUMMARY-1).
 *
 * The server-computed, display-safe `provider:type` → fields lookup that lets the
 * canvas adapter compute a node's at-a-glance summary without registry access.
 * Guards the two things that matter: the map is keyed/shaped so the client can do
 * an O(1) lookup, and the projection stays NARROW (no descriptions/placeholders/
 * defaults bloating an RSC→client payload that ships for every node type).
 */

import type { ActionMeta, FieldMeta } from "@/contracts/actionMeta";
import type { TriggerMeta } from "@/contracts/triggerMeta";
import { buildNodeSummaryFieldsByType } from "@/core/workflows/nodeSummaryFields";
import { buildNodeConfigSummary } from "@/core/workflows/nodeConfigSummary";

const channelField: FieldMeta = {
  name: "channel",
  label: "Channel",
  type: "combobox",
  required: true,
  description: "The channel to post into.",
  placeholder: "Pick a channel",
  defaultValue: "C-DEFAULT",
  optionsSource: "slack:channels",
  dependsOn: "team",
  sensitivity: "recipient",
};

const modeField: FieldMeta = {
  name: "mode",
  label: "Mode",
  type: "select",
  required: false,
  options: [
    { value: "post", label: "Post" },
    { value: "schedule", label: "Schedule" },
  ],
};

const gatedField: FieldMeta = {
  name: "postAt",
  label: "Post at",
  type: "text",
  required: false,
  visibleWhen: { field: "mode", valueIn: ["schedule"] },
};

const rowsField: FieldMeta = {
  name: "rows",
  label: "Rows",
  type: "json",
  required: false,
  renderedBy: "values",
};

const actionMeta: ActionMeta = {
  key: "slack:send_channel_message",
  provider: "slack",
  type: "send_channel_message",
  displayName: "Send Channel Message",
  description: "Post a message to a channel.",
  fields: [channelField, modeField, gatedField, rowsField],
} as unknown as ActionMeta;

const triggerMeta: TriggerMeta = {
  key: "slack:message_received",
  provider: "slack",
  type: "message_received",
  displayName: "Message Received",
  description: "Fires on a new message.",
  fields: [channelField],
} as unknown as TriggerMeta;

describe("buildNodeSummaryFieldsByType", () => {
  it("keys the map by `provider:type` (== meta.key) for BOTH actions and triggers", () => {
    const map = buildNodeSummaryFieldsByType([actionMeta], [triggerMeta]);
    expect(Object.keys(map).sort()).toEqual([
      "slack:message_received",
      "slack:send_channel_message",
    ]);
    expect(map["slack:send_channel_message"]!.displayName).toBe("Send Channel Message");
    expect(map["slack:message_received"]!.displayName).toBe("Message Received");
  });

  it("carries every field, in metadata order (the summary's segment order)", () => {
    const map = buildNodeSummaryFieldsByType([actionMeta], []);
    expect(map["slack:send_channel_message"]!.fields.map((f) => f.name)).toEqual([
      "channel",
      "mode",
      "postAt",
      "rows",
    ]);
  });

  it("keeps ONLY the display-safe keys the summary reads — no descriptions/placeholders/defaults", () => {
    const map = buildNodeSummaryFieldsByType([actionMeta], []);
    const channel = map["slack:send_channel_message"]!.fields[0]!;

    // What the summary needs.
    expect(channel).toMatchObject({
      name: "channel",
      label: "Channel",
      type: "combobox",
      optionsSource: "slack:channels",
    });

    // Payload weight / display-safety: deliberately excluded.
    expect(channel).not.toHaveProperty("description");
    expect(channel).not.toHaveProperty("placeholder");
    expect(channel).not.toHaveProperty("defaultValue");
    expect(channel).not.toHaveProperty("dependsOn");
    expect(channel).not.toHaveProperty("sensitivity");
  });

  it("preserves `options`, `visibleWhen` and `renderedBy` — each changes what the summary says", () => {
    const map = buildNodeSummaryFieldsByType([actionMeta], []);
    const [, mode, postAt, rows] = map["slack:send_channel_message"]!.fields;
    expect(mode!.options).toEqual([
      { value: "post", label: "Post" },
      { value: "schedule", label: "Schedule" },
    ]);
    expect(postAt!.visibleWhen).toEqual({ field: "mode", valueIn: ["schedule"] });
    expect(rows!.renderedBy).toBe("values");
  });

  it("omits absent optional keys rather than emitting `undefined` values", () => {
    const map = buildNodeSummaryFieldsByType([actionMeta], []);
    const mode = map["slack:send_channel_message"]!.fields[1]!;
    expect(mode).not.toHaveProperty("optionsSource");
    expect(mode).not.toHaveProperty("visibleWhen");
    expect(mode).not.toHaveProperty("renderedBy");
  });

  it("returns {} for empty registries — does not throw", () => {
    expect(buildNodeSummaryFieldsByType([], [])).toEqual({});
  });

  it("produces fields `buildNodeConfigSummary` consumes directly (no second adapter)", () => {
    const map = buildNodeSummaryFieldsByType([actionMeta], []);
    const entry = map["slack:send_channel_message"]!;
    const summary = buildNodeConfigSummary({
      displayName: entry.displayName,
      fields: entry.fields,
      config: { channel: "C123", mode: "post" },
      labelFor: (source, value) =>
        source === "slack:channels" && value === "C123" ? "#support-alerts" : undefined,
    });
    expect(summary.headline).toBe("Send Channel Message · #support-alerts");
  });
});
