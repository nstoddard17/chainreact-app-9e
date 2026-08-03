/** @jest-environment node */
/**
 * Config-diff field metadata derivation (HERMES-AGENT-CONFIG-DIFF-REVIEW).
 *
 * The review rail needs, per `provider:type`, each field's author-facing label,
 * whether it is required (minus defaulted fields), and whether it must be
 * redacted. The single source is the action/trigger metadata; a field is secret
 * when metadata declares `sensitivity: secret/connection` OR the key name looks
 * secret-shaped. These tests pin that derivation so the rail can never show a
 * value the rest of the app redacts, and so labels/required match the metadata.
 */
import {
  buildConfigDiffFieldMeta,
  type ConfigDiffFieldMetaByType,
} from "@/core/workflows/configDiffFieldMeta";
import type { ActionMeta, FieldMeta } from "@/contracts/actionMeta";
import type { TriggerMeta } from "@/contracts/triggerMeta";

function field(
  over: Partial<FieldMeta> & Pick<FieldMeta, "name" | "label" | "type" | "required">,
): FieldMeta {
  return { ...over } as FieldMeta;
}
function action(key: string, displayName: string, fields: FieldMeta[]): ActionMeta {
  return { key, displayName, fields } as unknown as ActionMeta;
}
function trigger(key: string, displayName: string, fields: FieldMeta[]): TriggerMeta {
  return { key, displayName, fields } as unknown as TriggerMeta;
}

function fieldMetaOf(map: ConfigDiffFieldMetaByType, key: string, name: string) {
  return map[key]!.fields[name]!;
}

describe("buildConfigDiffFieldMeta", () => {
  it("carries label, required, and hasDefault from the metadata", () => {
    const map = buildConfigDiffFieldMeta(
      [
        action("slack:send_message", "Slack / Send Channel Message", [
          field({ name: "channel", label: "Channel", type: "text", required: true }),
          field({ name: "asUser", label: "Send as user", type: "boolean", required: true, defaultValue: false }),
          field({ name: "thread", label: "Thread", type: "text", required: false }),
        ]),
      ],
      [],
    );
    expect(map["slack:send_message"]!.displayName).toBe("Slack / Send Channel Message");
    expect(fieldMetaOf(map, "slack:send_message", "channel")).toMatchObject({
      label: "Channel",
      required: true,
      hasDefault: false,
      secret: false,
    });
    // A required field WITH a metadata default is marked hasDefault → never a setup gap.
    expect(fieldMetaOf(map, "slack:send_message", "asUser").hasDefault).toBe(true);
  });

  it("marks a field secret when metadata declares sensitivity secret or connection", () => {
    const map = buildConfigDiffFieldMeta(
      [
        action("acme:call", "Acme", [
          field({ name: "secretField", label: "Secret", type: "text", required: true, sensitivity: "secret" }),
          field({ name: "connField", label: "Conn", type: "text", required: true, sensitivity: "connection" }),
          field({ name: "recipientField", label: "To", type: "text", required: true, sensitivity: "recipient" }),
          field({ name: "plain", label: "Plain", type: "text", required: false }),
        ]),
      ],
      [],
    );
    expect(fieldMetaOf(map, "acme:call", "secretField").secret).toBe(true);
    expect(fieldMetaOf(map, "acme:call", "connField").secret).toBe(true);
    // recipient is NOT secret — it is a safe "where to send" value.
    expect(fieldMetaOf(map, "acme:call", "recipientField").secret).toBe(false);
    expect(fieldMetaOf(map, "acme:call", "plain").secret).toBe(false);
  });

  it("carries declarative sensitivity through for the preview field-risk classifier", () => {
    const map = buildConfigDiffFieldMeta(
      [
        action("acme:call", "Acme", [
          field({ name: "recipientField", label: "To", type: "text", required: true, sensitivity: "recipient" }),
          field({ name: "connField", label: "Conn", type: "text", required: true, sensitivity: "connection" }),
          field({ name: "plain", label: "Plain", type: "text", required: false }),
        ]),
      ],
      [],
    );
    expect(fieldMetaOf(map, "acme:call", "recipientField").sensitivity).toBe("recipient");
    expect(fieldMetaOf(map, "acme:call", "connField").sensitivity).toBe("connection");
    // A field with no declared sensitivity carries none (heuristics handle it downstream).
    expect(fieldMetaOf(map, "acme:call", "plain").sensitivity).toBeUndefined();
  });

  it("marks a field secret when its KEY name looks secret-shaped even without declared sensitivity", () => {
    const map = buildConfigDiffFieldMeta(
      [
        action("acme:call", "Acme", [
          field({ name: "apiKey", label: "API Key", type: "text", required: false }),
          field({ name: "accessToken", label: "Access token", type: "text", required: false }),
          field({ name: "channelId", label: "Channel", type: "text", required: false }), // NOT secret (innocuous "id")
        ]),
      ],
      [],
    );
    expect(fieldMetaOf(map, "acme:call", "apiKey").secret).toBe(true);
    expect(fieldMetaOf(map, "acme:call", "accessToken").secret).toBe(true);
    expect(fieldMetaOf(map, "acme:call", "channelId").secret).toBe(false);
  });

  it("includes trigger metas alongside action metas", () => {
    const map = buildConfigDiffFieldMeta(
      [],
      [
        trigger("gmail:new_email", "Gmail / New Email", [
          field({ name: "label", label: "Label", type: "text", required: false }),
        ]),
      ],
    );
    expect(map["gmail:new_email"]!.displayName).toBe("Gmail / New Email");
    expect(fieldMetaOf(map, "gmail:new_email", "label").label).toBe("Label");
  });
});
