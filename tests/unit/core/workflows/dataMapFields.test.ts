/**
 * Tests for core/workflows/dataMapFields — Slice 4.BUILDER-DATA-MAP-2.
 *
 * Pure flattening + secret-name heuristic for the builder Data Map. Proves the
 * safety-critical shape rules: nested objects flatten to dotted leaf paths,
 * depth + field-count caps bound large outputs, sensitive subtrees are NOT
 * descended into (one redacted row), fileRef stays a leaf (never content
 * sub-paths), and secret-like names are flagged even without the metadata flag.
 */
import {
  flattenOutputFields,
  looksSecretLike,
} from "@/core/workflows/dataMapFields";
import type { OutputMeta } from "@/contracts/actionMeta";

describe("flattenOutputFields", () => {
  it("flattens top-level fields in order", () => {
    const outputs: OutputMeta[] = [
      { name: "channel", type: "string" },
      { name: "ts", type: "string" },
    ];
    const { fields, truncated } = flattenOutputFields(outputs);
    expect(fields.map((f) => f.path)).toEqual(["channel", "ts"]);
    expect(truncated).toBe(false);
  });

  it("flattens nested object fields into dotted leaf paths (parent row omitted)", () => {
    const outputs: OutputMeta[] = [
      { name: "channel", type: "string" },
      {
        name: "message",
        type: "object",
        fields: [
          { name: "text", type: "string" },
          { name: "user", type: "string" },
        ],
      },
    ];
    const { fields } = flattenOutputFields(outputs);
    expect(fields.map((f) => f.path)).toEqual([
      "channel",
      "message.text",
      "message.user",
    ]);
  });

  it("caps nesting depth and emits the depth-capped object as a single row", () => {
    const deep: OutputMeta = {
      name: "a",
      type: "object",
      fields: [
        {
          name: "b",
          type: "object",
          fields: [{ name: "c", type: "string" }],
        },
      ],
    };
    const { fields } = flattenOutputFields([deep], { maxDepth: 2 });
    // depth1 a → descend; depth2 a.b is at the cap → not descended → one row.
    expect(fields.map((f) => f.path)).toEqual(["a.b"]);
  });

  it("bounds the field count and flags truncated", () => {
    const many: OutputMeta[] = Array.from({ length: 10 }, (_, i) => ({
      name: `f${i}`,
      type: "string" as const,
    }));
    const { fields, truncated } = flattenOutputFields(many, { maxFields: 4 });
    expect(fields).toHaveLength(4);
    expect(truncated).toBe(true);
  });

  it("does not descend into a sensitive object; emits it as one sensitive row", () => {
    const outputs: OutputMeta[] = [
      {
        name: "secrets",
        type: "object",
        sensitive: true,
        fields: [{ name: "token", type: "string" }],
      },
    ];
    const { fields } = flattenOutputFields(outputs);
    expect(fields).toHaveLength(1);
    expect(fields[0]).toMatchObject({ path: "secrets", sensitive: true });
  });

  it("treats fileRef outputs as leaves (never flattens into content sub-paths)", () => {
    const outputs: OutputMeta[] = [
      {
        name: "attachment",
        type: "fileRef",
        fields: [{ name: "content", type: "string" }],
      },
    ];
    const { fields } = flattenOutputFields(outputs);
    expect(fields.map((f) => f.path)).toEqual(["attachment"]);
    expect(fields[0]!.type).toBe("fileRef");
  });

  it("marks secret-like field names sensitive even without the metadata flag", () => {
    const outputs: OutputMeta[] = [
      { name: "accessToken", type: "string" },
      { name: "text", type: "string" },
    ];
    const { fields } = flattenOutputFields(outputs);
    const byPath = Object.fromEntries(fields.map((f) => [f.path, f.sensitive]));
    expect(byPath["accessToken"]).toBe(true);
    expect(byPath["text"]).toBe(false);
  });
});

describe("looksSecretLike", () => {
  it("flags common secret-ish names (incl. camelCase / snake_case)", () => {
    for (const n of [
      "accessToken",
      "refresh_token",
      "apiKey",
      "clientSecret",
      "password",
      "authorization",
      "signature",
      "webhookSecret",
      "config.token",
    ]) {
      expect(looksSecretLike(n)).toBe(true);
    }
  });

  it("does not flag benign names that merely contain a substring", () => {
    for (const n of [
      "author",
      "monkey",
      "message.text",
      "idempotencyKey",
      "title",
      "status",
      "tokenizer",
    ]) {
      expect(looksSecretLike(n)).toBe(false);
    }
  });
});
