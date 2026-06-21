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

  it("excludes secret/connection, async-resolver, cascading, multi-value, dynamic-select, and unsupported types", () => {
    const map = buildPreviewSetupFields(
      [
        action("acme:do", [
          field({ name: "token", label: "Token", type: "text", required: true, sensitivity: "secret" }),
          field({ name: "conn", label: "Conn", type: "text", required: true, sensitivity: "connection" }),
          field({ name: "channel", label: "Channel", type: "select", required: true, optionsSource: "slack:channels" }),
          field({ name: "table", label: "Table", type: "select", required: true, dependsOn: "baseId", options: [{ value: "x", label: "X" }] }),
          field({ name: "tags", label: "Tags", type: "select", required: false, multiple: true, options: [{ value: "x", label: "X" }] }),
          field({ name: "dynsel", label: "Dyn", type: "select", required: true }), // no static options
          field({ name: "kv", label: "KV", type: "keyvalue", required: false }),
          field({ name: "file", label: "File", type: "file", required: false }),
        ]),
      ],
      [],
    );
    expect(map["acme:do"]).toBeUndefined(); // nothing supported → type omitted entirely
  });

  it("INCLUDES a recipient-class field when it renders as a supported LOCAL control (HERMES-AGENT-GUIDED-PREVIEW-SETUP-RAIL-UX)", () => {
    const map = buildPreviewSetupFields(
      [
        action("acme:send", [
          field({ name: "to", label: "To", type: "text", required: true, sensitivity: "recipient" }),
          field({ name: "secretTo", label: "SecretTo", type: "text", required: true, sensitivity: "secret" }),
          // recipient + async resolver stays deferred (optionsSource excluded), e.g. Slack channel.
          field({ name: "channel", label: "Channel", type: "select", required: true, sensitivity: "recipient", optionsSource: "slack:channels" }),
        ]),
      ],
      [],
    );
    const fields = map["acme:send"]!;
    expect(fields.map((f) => f.name)).toEqual(["to"]); // recipient text in; secret + recipient-async out
    expect(fields[0]!.type).toBe("text");
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

  it("returns {} for missing raw or fields", () => {
    expect(sanitizeSeedConfig(undefined, fields)).toEqual({});
    expect(sanitizeSeedConfig({ message: "hi" }, undefined)).toEqual({});
  });
});
