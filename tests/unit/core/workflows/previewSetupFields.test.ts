import {
  buildPreviewSetupFields,
  sanitizeSeedConfig,
  type PreviewSetupField,
} from "@/core/workflows/previewSetupFields";
import type { ActionMeta, FieldMeta } from "@/contracts/actionMeta";
import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * HERMES-AGENT-GUIDED-PREVIEW-SETUP-1 — the deterministic, metadata-derived setup-field selection +
 * seed sanitizer. Supported local controls only (text/textarea/number/boolean/static-select); never
 * secret/async/cascade/multi. Pure.
 */

function field(over: Partial<FieldMeta> & Pick<FieldMeta, "name" | "label" | "type" | "required">): FieldMeta {
  return { ...over } as FieldMeta;
}
function action(key: string, fields: FieldMeta[]): ActionMeta {
  return { key, displayName: key, fields } as unknown as ActionMeta;
}

describe("buildPreviewSetupFields", () => {
  it("includes supported local control types (text/textarea/number/boolean) and static select", () => {
    const map = buildPreviewSetupFields(
      [
        action("slack:send_message", [
          field({ name: "message", label: "Message", type: "textarea", required: true }),
          field({ name: "count", label: "Count", type: "number", required: false }),
          field({ name: "silent", label: "Silent", type: "boolean", required: false }),
          field({ name: "name", label: "Name", type: "text", required: true }),
          field({
            name: "mode",
            label: "Mode",
            type: "select",
            required: true,
            options: [{ value: "a", label: "A" }, { value: "b", label: "B" }],
          }),
        ]),
      ],
      [],
    );
    const names = map["slack:send_message"]!.map((f) => f.name);
    expect(names).toEqual(["message", "count", "silent", "name", "mode"]);
    const mode = map["slack:send_message"]!.find((f) => f.name === "mode")!;
    expect(mode.type).toBe("select");
    expect(mode.options).toEqual([{ value: "a", label: "A" }, { value: "b", label: "B" }]);
  });

  it("excludes secret/connection, multi-value, non-async cascading, dynamic-select-without-options, and unsupported types", () => {
    const map = buildPreviewSetupFields(
      [
        action("acme:do", [
          field({ name: "token", label: "Token", type: "text", required: true, sensitivity: "secret" }),
          field({ name: "conn", label: "Conn", type: "text", required: true, sensitivity: "connection" }),
          field({ name: "table", label: "Table", type: "select", required: true, dependsOn: "baseId", options: [{ value: "x", label: "X" }] }), // non-async dependsOn
          field({ name: "tags", label: "Tags", type: "select", required: false, multiple: true, optionsSource: "x:tags" }), // multi-select async deferred
          field({ name: "dynsel", label: "Dyn", type: "select", required: true }), // no static options, no resolver
          field({ name: "kv", label: "KV", type: "keyvalue", required: false }),
          field({ name: "file", label: "File", type: "file", required: false }),
        ]),
      ],
      [],
    );
    expect(map["acme:do"]).toBeUndefined(); // nothing supported → type omitted entirely
  });

  it("INCLUDES a recipient-class LOCAL field (HERMES-AGENT-GUIDED-PREVIEW-SETUP-RAIL-UX)", () => {
    const map = buildPreviewSetupFields(
      [
        action("acme:send", [
          field({ name: "to", label: "To", type: "text", required: true, sensitivity: "recipient" }),
          field({ name: "secretTo", label: "SecretTo", type: "text", required: true, sensitivity: "secret" }),
        ]),
      ],
      [],
    );
    const fields = map["acme:send"]!;
    expect(fields.map((f) => f.name)).toEqual(["to"]); // recipient text in; secret out
    expect(fields[0]!.type).toBe("text");
  });

  it("INCLUDES async single-select (select/combobox + optionsSource) as `select-async`, incl. recipient; excludes multi + secret (HERMES-AGENT-GUIDED-PREVIEW-SETUP-ASYNC-OPTIONS)", () => {
    const map = buildPreviewSetupFields(
      [
        action("acme:async", [
          // Slack-channel-like: combobox + optionsSource + recipient → supported async single-select.
          field({ name: "channel", label: "Channel", type: "combobox", required: true, sensitivity: "recipient", optionsSource: "slack:channels" }),
          // select + optionsSource + dependsOn → supported, carries normalized dependsOn for gating.
          field({ name: "tableId", label: "Table", type: "select", required: true, dependsOn: "baseId", optionsSource: "airtable:tables" }),
          // multi-select async → deferred (single-select only this slice).
          field({ name: "labels", label: "Labels", type: "select", required: false, multiple: true, optionsSource: "x:labels" }),
          // secret async → excluded.
          field({ name: "apiKeyPick", label: "Key", type: "select", required: false, sensitivity: "secret", optionsSource: "x:keys" }),
        ]),
      ],
      [],
    );
    const fields = map["acme:async"]!;
    expect(fields.map((f) => f.name)).toEqual(["channel", "tableId"]);
    const channel = fields.find((f) => f.name === "channel")!;
    expect(channel.type).toBe("select-async");
    expect(channel.optionsSource).toBe("slack:channels");
    expect(channel.dependsOn).toBeUndefined();
    const tableId = fields.find((f) => f.name === "tableId")!;
    expect(tableId.type).toBe("select-async");
    expect(tableId.optionsSource).toBe("airtable:tables");
    expect(tableId.dependsOn).toEqual(["baseId"]);
  });

  it("keys triggers too, and omits types with no supported fields", () => {
    const triggers = [{ key: "gmail:new_email", displayName: "New Email", fields: [field({ name: "label", label: "Label", type: "text", required: true })] }] as unknown as TriggerMeta[];
    const map = buildPreviewSetupFields([], triggers);
    expect(map["gmail:new_email"]!.map((f) => f.name)).toEqual(["label"]);
  });
});

describe("sanitizeSeedConfig", () => {
  const fields: PreviewSetupField[] = [
    { name: "message", label: "Message", type: "textarea", required: true },
    { name: "count", label: "Count", type: "number", required: false },
    { name: "silent", label: "Silent", type: "boolean", required: false },
    { name: "mode", label: "Mode", type: "select", required: true, options: [{ value: "a", label: "A" }] },
  ];

  it("keeps only supported keys, coerces by type, and drops empties", () => {
    const out = sanitizeSeedConfig(
      { message: "hi", count: "5", silent: true, mode: "a", bogus: "x" },
      fields,
    );
    expect(out).toEqual({ message: "hi", count: 5, silent: true, mode: "a" });
  });

  it("drops a select value not in the static options, a non-finite number, and empty strings", () => {
    expect(sanitizeSeedConfig({ mode: "zzz", count: "abc", message: "" }, fields)).toEqual({});
  });

  it("ignores unknown keys entirely (never seeds a key absent from the supported metadata)", () => {
    expect(sanitizeSeedConfig({ accessToken: "ya29.SECRET", message: "ok" }, fields)).toEqual({ message: "ok" });
  });

  it("keeps a non-empty async-select value (resolver options unknown at sanitize time), drops empty", () => {
    const asyncFields: PreviewSetupField[] = [
      { name: "channel", label: "Channel", type: "select-async", required: true, optionsSource: "slack:channels" },
    ];
    expect(sanitizeSeedConfig({ channel: "C12345" }, asyncFields)).toEqual({ channel: "C12345" });
    expect(sanitizeSeedConfig({ channel: "" }, asyncFields)).toEqual({});
    // Unknown/secret keys alongside an async field are still dropped.
    expect(sanitizeSeedConfig({ channel: "C9", botToken: "xoxb-SECRET" }, asyncFields)).toEqual({ channel: "C9" });
  });

  it("returns {} for missing raw or fields", () => {
    expect(sanitizeSeedConfig(undefined, fields)).toEqual({});
    expect(sanitizeSeedConfig({ message: "hi" }, undefined)).toEqual({});
  });
});
