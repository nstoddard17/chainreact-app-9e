/**
 * Tests for AI-CONFIG-ASSIST CS-1 — chat-fill eligibility + value validation
 * (features/workflow-builder/ai/chatFillEligibility.ts).
 *
 * Pure foundation only: these helpers decide IF a chat-typed value may later be
 * placed into a pending field and IF the value is acceptable. They fill nothing,
 * mutate nothing, save/run nothing, and import no server modules. v1 allows only
 * a non-secret, non-recipient, non-destructive text/textarea field.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { FieldMeta } from "@/contracts/actionMeta";
import {
  isChatFillEligible,
  validateChatFillValue,
  MAX_CHAT_FILL_VALUE_LENGTH,
} from "@/features/workflow-builder/ai/chatFillEligibility";

function field(name: string, type: FieldMeta["type"] = "text"): FieldMeta {
  return { name, label: name, type, required: false } as FieldMeta;
}

const SAFE_ACTION = { isDestructive: false, requiresConfirmation: false };

describe("isChatFillEligible — allowed shape", () => {
  it("allows a Slack Message-like text field on a non-destructive, no-confirmation action", () => {
    const res = isChatFillEligible({ field: field("text", "textarea"), action: SAFE_ACTION });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.field.name).toBe("text");
  });

  it("allows a plain `text`-typed safe field, and when no action flags are supplied (trigger)", () => {
    expect(isChatFillEligible({ field: field("summary", "text"), action: SAFE_ACTION }).ok).toBe(true);
    expect(isChatFillEligible({ field: field("note", "textarea") }).ok).toBe(true);
  });
});

describe("isChatFillEligible — secret-shaped keys blocked", () => {
  it.each(["token", "apiKey", "API_KEY", "password", "clientSecret", "bearerToken", "authToken", "credential"])(
    "blocks secret-shaped key %s",
    (name) => {
      const res = isChatFillEligible({ field: field(name, "text"), action: SAFE_ACTION });
      expect(res).toEqual({ ok: false, reason: "SECRET_FIELD" });
    },
  );
});

describe("isChatFillEligible — recipient/destination keys blocked", () => {
  it.each(["to", "cc", "bcc", "recipients", "attendees", "email", "phone", "address", "destination", "target"])(
    "blocks recipient/destination key %s",
    (name) => {
      const res = isChatFillEligible({ field: field(name, "text"), action: SAFE_ACTION });
      expect(res).toEqual({ ok: false, reason: "RECIPIENT_OR_DESTINATION_FIELD" });
    },
  );

  it("blocks channel and channelId (recipient/destination)", () => {
    expect(isChatFillEligible({ field: field("channel", "text"), action: SAFE_ACTION })).toEqual({
      ok: false,
      reason: "RECIPIENT_OR_DESTINATION_FIELD",
    });
    expect(isChatFillEligible({ field: field("channelId", "text"), action: SAFE_ACTION })).toEqual({
      ok: false,
      reason: "RECIPIENT_OR_DESTINATION_FIELD",
    });
  });

  it("blocks url and webhookUrl (recipient/destination)", () => {
    expect(isChatFillEligible({ field: field("url", "text"), action: SAFE_ACTION })).toEqual({
      ok: false,
      reason: "RECIPIENT_OR_DESTINATION_FIELD",
    });
    expect(isChatFillEligible({ field: field("webhookUrl", "text"), action: SAFE_ACTION })).toEqual({
      ok: false,
      reason: "RECIPIENT_OR_DESTINATION_FIELD",
    });
  });

  it("does NOT false-positive on normal text fields containing recipient substrings", () => {
    // "customMessage" contains "to" as a substring but tokenizes to custom/message.
    expect(isChatFillEligible({ field: field("customMessage", "textarea"), action: SAFE_ACTION }).ok).toBe(true);
    expect(isChatFillEligible({ field: field("subject", "text"), action: SAFE_ACTION }).ok).toBe(true);
  });
});

describe("isChatFillEligible — unsupported field types blocked", () => {
  it.each([
    "select",
    "combobox",
    "boolean",
    "number",
    "cron",
    "router-routes",
    "keyvalue",
    "file",
    "file-array",
    "string-array",
  ] as const)("blocks structured/unsupported field type %s", (type) => {
    const res = isChatFillEligible({ field: field("body", type), action: SAFE_ACTION });
    expect(res).toEqual({ ok: false, reason: "UNSUPPORTED_FIELD_TYPE" });
  });
});

describe("isChatFillEligible — action-level danger blocked", () => {
  it("blocks a destructive action even for a safe text field", () => {
    const res = isChatFillEligible({
      field: field("body", "textarea"),
      action: { isDestructive: true, requiresConfirmation: false },
    });
    expect(res).toEqual({ ok: false, reason: "DESTRUCTIVE_ACTION" });
  });

  it("blocks a confirmation-required action even for a safe text field", () => {
    const res = isChatFillEligible({
      field: field("body", "textarea"),
      action: { isDestructive: false, requiresConfirmation: true },
    });
    expect(res).toEqual({ ok: false, reason: "CONFIRMATION_REQUIRED_ACTION" });
  });
});

describe("isChatFillEligible — missing/unknown target", () => {
  it("rejects missing field metadata (stale/unknown target)", () => {
    expect(isChatFillEligible({ field: undefined, action: SAFE_ACTION })).toEqual({
      ok: false,
      reason: "MISSING_FIELD_METADATA",
    });
  });
});

describe("validateChatFillValue", () => {
  it("accepts a non-empty string and preserves the EXACT typed value (no trimming)", () => {
    const exact = "  hello from ChainReact  ";
    const res = validateChatFillValue(exact);
    expect(res).toEqual({ ok: true, value: exact });
  });

  it("rejects an empty string", () => {
    expect(validateChatFillValue("")).toEqual({ ok: false, reason: "EMPTY_VALUE" });
  });

  it("rejects a whitespace-only string", () => {
    expect(validateChatFillValue("   \n\t ")).toEqual({ ok: false, reason: "EMPTY_VALUE" });
  });

  it.each([42, true, null, undefined, {}, [], ["x"]])("rejects non-string value %p", (v) => {
    expect(validateChatFillValue(v as unknown)).toEqual({ ok: false, reason: "NON_STRING_VALUE" });
  });

  it("rejects an oversized value beyond the length cap", () => {
    const tooLong = "x".repeat(MAX_CHAT_FILL_VALUE_LENGTH + 1);
    expect(validateChatFillValue(tooLong)).toEqual({ ok: false, reason: "VALUE_TOO_LONG" });
  });

  it("accepts a value at exactly the length cap", () => {
    const atCap = "x".repeat(MAX_CHAT_FILL_VALUE_LENGTH);
    expect(validateChatFillValue(atCap)).toEqual({ ok: true, value: atCap });
  });
});

describe("purity + client-safety", () => {
  it("is deterministic — repeated calls return equal results with no side effects", () => {
    const a1 = isChatFillEligible({ field: field("text", "textarea"), action: SAFE_ACTION });
    const a2 = isChatFillEligible({ field: field("text", "textarea"), action: SAFE_ACTION });
    expect(a1).toEqual(a2);
    const v1 = validateChatFillValue("hello");
    const v2 = validateChatFillValue("hello");
    expect(v1).toEqual(v2);
  });

  it("imports no server-only modules (no `import … from @/services|@/repositories`)", () => {
    const src = readFileSync(
      path.join(process.cwd(), "features/workflow-builder/ai/chatFillEligibility.ts"),
      "utf8",
    );
    // Match real import statements only — prose mentions in JSDoc are allowed.
    expect(src).not.toMatch(/\bfrom\s+["']@\/(services|repositories)\//);
    expect(src).not.toMatch(/\brequire\(\s*["']@\/(services|repositories)\//);
  });
});
