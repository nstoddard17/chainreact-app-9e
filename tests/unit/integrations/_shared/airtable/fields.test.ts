/**
 * @jest-environment node
 *
 * Tests for the typed Airtable field polymorphism module.
 * Covers all 15 supported types (14 Slice 10 + 1 Airtable 2.1
 * Commit 1: `attachment`) + the 17 remaining deferred types (the
 * UnsupportedFieldTypeError loud-fail path).
 */
import {
  DEFERRED_FIELD_TYPES,
  SUPPORTED_FIELD_TYPES,
  UnsupportedFieldTypeError,
  formatFieldValue,
  formatFields,
  parseFieldValue,
  parseFieldsWithSchema,
  type AirtableFieldSchema,
  type TypedFieldInput,
} from "@/integrations/_shared/airtable/fields";

// ─── formatFieldValue (outbound) ────────────────────────────────────────────

describe("formatFieldValue — outbound coercion", () => {
  it("singleLineText / longText pass strings through unchanged", () => {
    expect(formatFieldValue("singleLineText", "hi")).toBe("hi");
    expect(formatFieldValue("longText", "multi\nline")).toBe("multi\nline");
  });

  it("number / currency / percent pass numbers and null", () => {
    expect(formatFieldValue("number", 42)).toBe(42);
    expect(formatFieldValue("currency", 19.99)).toBe(19.99);
    expect(formatFieldValue("percent", 0.5)).toBe(0.5);
    expect(formatFieldValue("number", null)).toBeNull();
  });

  it("singleSelect uses option name; null clears", () => {
    expect(formatFieldValue("singleSelect", "Active")).toBe("Active");
    expect(formatFieldValue("singleSelect", null)).toBeNull();
  });

  it("multipleSelects returns a defensive copy of the array", () => {
    const input = ["A", "B"];
    const out = formatFieldValue("multipleSelects", input) as string[];
    expect(out).toEqual(["A", "B"]);
    expect(out).not.toBe(input);
    out.push("C");
    expect(input).toEqual(["A", "B"]);
  });

  it("checkbox passes booleans", () => {
    expect(formatFieldValue("checkbox", true)).toBe(true);
    expect(formatFieldValue("checkbox", false)).toBe(false);
  });

  it("date formats as YYYY-MM-DD (UTC components — avoids local TZ shift)", () => {
    // Use UTC to avoid TZ-dependent flakes in CI.
    expect(formatFieldValue("date", "2026-05-09")).toBe("2026-05-09");
    expect(formatFieldValue("date", "2026-05-09T00:00:00Z")).toBe("2026-05-09");
    expect(formatFieldValue("date", new Date("2026-12-25T00:00:00Z"))).toBe(
      "2026-12-25",
    );
    expect(formatFieldValue("date", null)).toBeNull();
  });

  it("date pads single-digit months and days", () => {
    expect(formatFieldValue("date", "2026-01-05T00:00:00Z")).toBe("2026-01-05");
    expect(formatFieldValue("date", "2026-09-09T00:00:00Z")).toBe("2026-09-09");
  });

  it("date throws on invalid input", () => {
    expect(() => formatFieldValue("date", "not-a-date")).toThrow(
      /invalid date value/,
    );
  });

  it("dateTime formats as ISO 8601", () => {
    const iso = "2026-05-09T14:30:15.000Z";
    expect(formatFieldValue("dateTime", iso)).toBe(iso);
    expect(
      formatFieldValue("dateTime", new Date("2026-05-09T14:30:15Z")),
    ).toBe(iso);
    expect(formatFieldValue("dateTime", null)).toBeNull();
  });

  it("dateTime throws on invalid input", () => {
    expect(() => formatFieldValue("dateTime", "not-a-date")).toThrow(
      /invalid date value/,
    );
  });

  it("email / url / phoneNumber pass strings + null", () => {
    expect(formatFieldValue("email", "a@b.com")).toBe("a@b.com");
    expect(formatFieldValue("url", "https://x.com")).toBe("https://x.com");
    expect(formatFieldValue("phoneNumber", "+15551234")).toBe("+15551234");
    expect(formatFieldValue("email", null)).toBeNull();
  });

  it("multipleRecordLinks normalizes string → array of one", () => {
    expect(formatFieldValue("multipleRecordLinks", "rec123")).toEqual([
      "rec123",
    ]);
  });

  it("multipleRecordLinks strips V1's recXXX::Display Name suffix", () => {
    expect(
      formatFieldValue("multipleRecordLinks", [
        "recABC::Alice",
        "recDEF::Bob",
      ]),
    ).toEqual(["recABC", "recDEF"]);
  });

  it("multipleRecordLinks leaves clean ids untouched", () => {
    expect(formatFieldValue("multipleRecordLinks", ["recXYZ"])).toEqual([
      "recXYZ",
    ]);
  });

  it("multipleRecordLinks strips display suffix on a single string too", () => {
    expect(
      formatFieldValue("multipleRecordLinks", "recABC::Alice"),
    ).toEqual(["recABC"]);
  });

  // ─── attachment (Airtable 2.1 Commit 1) ───────────────────────────────────

  it("attachment: single attachment with url + filename emits Airtable wire shape", () => {
    expect(
      formatFieldValue("attachment", [
        { url: "https://files.example/photo.jpg", filename: "photo.jpg" },
      ]),
    ).toEqual([
      { url: "https://files.example/photo.jpg", filename: "photo.jpg" },
    ]);
  });

  it("attachment: multiple attachments preserve order", () => {
    expect(
      formatFieldValue("attachment", [
        { url: "https://x.example/a.png", filename: "a.png" },
        { url: "https://x.example/b.png", filename: "b.png" },
        { url: "https://x.example/c.pdf" },
      ]),
    ).toEqual([
      { url: "https://x.example/a.png", filename: "a.png" },
      { url: "https://x.example/b.png", filename: "b.png" },
      { url: "https://x.example/c.pdf" },
    ]);
  });

  it("attachment: filename is OMITTED from the wire shape when undefined (NOT sent as null)", () => {
    const out = formatFieldValue("attachment", [
      { url: "https://x.example/a.png" },
    ]) as Array<Record<string, unknown>>;
    expect(out[0]).toEqual({ url: "https://x.example/a.png" });
    expect(out[0]!.filename).toBeUndefined();
    expect("filename" in out[0]!).toBe(false);
  });

  it("attachment: empty array is forwarded (Airtable clears the field — multipleSelects parity)", () => {
    expect(formatFieldValue("attachment", [])).toEqual([]);
  });
});

// ─── UnsupportedFieldTypeError ──────────────────────────────────────────────

describe("UnsupportedFieldTypeError — fail-loud on deferred types", () => {
  it.each(DEFERRED_FIELD_TYPES)(
    "formatFieldValue throws for deferred type: %s",
    (type) => {
      expect(() => formatFieldValue(type, "anything")).toThrow(
        UnsupportedFieldTypeError,
      );
    },
  );

  it("error message lists supported + deferred sets", () => {
    try {
      formatFieldValue("formula", null);
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(UnsupportedFieldTypeError);
      const message = (err as UnsupportedFieldTypeError).message;
      // `attachment` is now in the SUPPORTED set (Airtable 2.1 Commit 1)
      // — message includes it via SUPPORTED_FIELD_TYPES.join.
      expect(message).toContain("attachment");
      expect(message).toContain("singleLineText");
      expect(message).toContain("multipleRecordLinks");
      expect(message).toContain("formula");
      expect(message).toContain("rollup");
    }
  });

  it("error carries fieldType + supportedTypes + deferredTypes", () => {
    try {
      formatFieldValue("formula", "x");
      throw new Error("should have thrown");
    } catch (err) {
      const e = err as UnsupportedFieldTypeError;
      expect(e.fieldType).toBe("formula");
      expect(e.supportedTypes).toEqual(SUPPORTED_FIELD_TYPES);
      expect(e.deferredTypes).toEqual(DEFERRED_FIELD_TYPES);
    }
  });

  it("throws on completely unknown types (not in supported OR deferred)", () => {
    expect(() => formatFieldValue("totallyMadeUp", null)).toThrow(
      UnsupportedFieldTypeError,
    );
  });

  it("parseFieldValue also throws on deferred + unknown types", () => {
    expect(() => parseFieldValue("rollup", null)).toThrow(
      UnsupportedFieldTypeError,
    );
    expect(() => parseFieldValue("totallyUnknown", null)).toThrow(
      UnsupportedFieldTypeError,
    );
  });

  // ─── Airtable 2.1 Commit 1 regression guards ──────────────────────────────

  it("attachment is NOT in DEFERRED_FIELD_TYPES (promoted in Airtable 2.1 Commit 1)", () => {
    expect(DEFERRED_FIELD_TYPES).not.toContain("attachment");
  });

  it("attachment IS in SUPPORTED_FIELD_TYPES (promoted in Airtable 2.1 Commit 1)", () => {
    expect(SUPPORTED_FIELD_TYPES).toContain("attachment");
  });

  it("SUPPORTED_FIELD_TYPES has 15 entries; DEFERRED_FIELD_TYPES has 17", () => {
    expect(SUPPORTED_FIELD_TYPES).toHaveLength(15);
    expect(DEFERRED_FIELD_TYPES).toHaveLength(17);
  });

  it("the 14 Slice 10 supported types are still supported (regression guard)", () => {
    const slice10 = [
      "singleLineText",
      "longText",
      "number",
      "currency",
      "percent",
      "singleSelect",
      "multipleSelects",
      "checkbox",
      "date",
      "dateTime",
      "email",
      "url",
      "phoneNumber",
      "multipleRecordLinks",
    ];
    for (const t of slice10) {
      expect(SUPPORTED_FIELD_TYPES).toContain(t);
      expect(DEFERRED_FIELD_TYPES).not.toContain(t);
    }
  });

  it("the 17 still-deferred types remain deferred (regression guard)", () => {
    const stillDeferred = [
      "formula",
      "rollup",
      "lookup",
      "count",
      "rating",
      "duration",
      "autoNumber",
      "barcode",
      "button",
      "singleCollaborator",
      "multipleCollaborators",
      "createdBy",
      "createdTime",
      "lastModifiedBy",
      "lastModifiedTime",
      "externalSyncSource",
      "aiText",
    ];
    for (const t of stillDeferred) {
      expect(DEFERRED_FIELD_TYPES).toContain(t);
      expect(SUPPORTED_FIELD_TYPES).not.toContain(t);
    }
  });
});

// ─── formatFields (convenience wrapper) ─────────────────────────────────────

describe("formatFields — typed input map → wire-format", () => {
  it("converts a full typed map", () => {
    const inputs: Record<string, TypedFieldInput> = {
      Name: { type: "singleLineText", value: "Alice" },
      Score: { type: "number", value: 100 },
      Active: { type: "checkbox", value: true },
      Joined: { type: "date", value: "2026-05-09T00:00:00Z" },
      Tags: { type: "multipleSelects", value: ["A", "B"] },
      Linked: { type: "multipleRecordLinks", value: ["rec1::Bob"] },
    };
    expect(formatFields(inputs)).toEqual({
      Name: "Alice",
      Score: 100,
      Active: true,
      Joined: "2026-05-09",
      Tags: ["A", "B"],
      Linked: ["rec1"],
    });
  });

  it("empty map returns empty object", () => {
    expect(formatFields({})).toEqual({});
  });

  it("preserves field-name keys as-is (no normalization)", () => {
    const inputs: Record<string, TypedFieldInput> = {
      "Field With Spaces": { type: "longText", value: "x" },
      'Quote"Mark': { type: "singleLineText", value: "y" },
    };
    expect(Object.keys(formatFields(inputs))).toEqual([
      "Field With Spaces",
      'Quote"Mark',
    ]);
  });
});

// ─── parseFieldValue (inbound) ──────────────────────────────────────────────

describe("parseFieldValue — inbound coercion", () => {
  it("singleLineText / longText return strings; default '' for missing", () => {
    expect(parseFieldValue("singleLineText", "hi")).toEqual({
      type: "singleLineText",
      value: "hi",
    });
    expect(parseFieldValue("longText", undefined)).toEqual({
      type: "longText",
      value: "",
    });
  });

  it("number / currency / percent return numbers; null for missing", () => {
    expect(parseFieldValue("number", 42)).toEqual({ type: "number", value: 42 });
    expect(parseFieldValue("currency", undefined)).toEqual({
      type: "currency",
      value: null,
    });
  });

  it("checkbox normalizes Airtable's omit-when-unchecked to false", () => {
    expect(parseFieldValue("checkbox", true)).toEqual({
      type: "checkbox",
      value: true,
    });
    // Airtable OMITS the field when unchecked — undefined comes
    // through; parser must return false (not null).
    expect(parseFieldValue("checkbox", undefined)).toEqual({
      type: "checkbox",
      value: false,
    });
  });

  it("multipleSelects / multipleRecordLinks normalize Airtable's omit-when-empty to []", () => {
    expect(parseFieldValue("multipleSelects", ["A", "B"])).toEqual({
      type: "multipleSelects",
      value: ["A", "B"],
    });
    expect(parseFieldValue("multipleSelects", undefined)).toEqual({
      type: "multipleSelects",
      value: [],
    });
    expect(parseFieldValue("multipleRecordLinks", undefined)).toEqual({
      type: "multipleRecordLinks",
      value: [],
    });
  });

  it("date / dateTime return strings as-is or null", () => {
    expect(parseFieldValue("date", "2026-05-09")).toEqual({
      type: "date",
      value: "2026-05-09",
    });
    expect(parseFieldValue("dateTime", "2026-05-09T14:30:00Z")).toEqual({
      type: "dateTime",
      value: "2026-05-09T14:30:00Z",
    });
    expect(parseFieldValue("date", undefined)).toEqual({
      type: "date",
      value: null,
    });
  });

  it("email / url / phoneNumber return strings; null for missing", () => {
    expect(parseFieldValue("email", "a@b.com")).toEqual({
      type: "email",
      value: "a@b.com",
    });
    expect(parseFieldValue("phoneNumber", undefined)).toEqual({
      type: "phoneNumber",
      value: null,
    });
  });

  it("singleSelect returns the selected option name or null", () => {
    expect(parseFieldValue("singleSelect", "Active")).toEqual({
      type: "singleSelect",
      value: "Active",
    });
    expect(parseFieldValue("singleSelect", undefined)).toEqual({
      type: "singleSelect",
      value: null,
    });
  });

  // ─── attachment (Airtable 2.1 Commit 1) ───────────────────────────────────

  it("attachment: parses Airtable's read shape into the bounded 6-key projection", () => {
    const raw = [
      {
        id: "att1",
        url: "https://files.example/photo.jpg",
        filename: "photo.jpg",
        size: 1234,
        type: "image/jpeg",
        thumbnails: {
          small: { url: "https://t.example/s.jpg", width: 36, height: 36 },
          large: { url: "https://t.example/l.jpg", width: 512, height: 512 },
        },
        // Width / height / extras intentionally NOT projected.
        width: 1024,
        height: 768,
      },
    ];
    const parsed = parseFieldValue("attachment", raw);
    expect(parsed.type).toBe("attachment");
    const value = parsed.value as unknown as ReadonlyArray<Record<string, unknown>>;
    expect(value).toHaveLength(1);
    expect(value[0]).toEqual({
      id: "att1",
      url: "https://files.example/photo.jpg",
      filename: "photo.jpg",
      size: 1234,
      type: "image/jpeg",
      thumbnails: {
        small: { url: "https://t.example/s.jpg", width: 36, height: 36 },
        large: { url: "https://t.example/l.jpg", width: 512, height: 512 },
      },
    });
    // Width / height extras are NOT in the projection.
    expect(value[0]).not.toHaveProperty("width");
    expect(value[0]).not.toHaveProperty("height");
  });

  it("attachment: omits thumbnails when Airtable did not return them (non-image attachment)", () => {
    const raw = [
      {
        id: "att2",
        url: "https://files.example/doc.pdf",
        filename: "doc.pdf",
        size: 9876,
        type: "application/pdf",
      },
    ];
    const parsed = parseFieldValue("attachment", raw);
    const value = parsed.value as unknown as ReadonlyArray<Record<string, unknown>>;
    expect(value[0]).toEqual({
      id: "att2",
      url: "https://files.example/doc.pdf",
      filename: "doc.pdf",
      size: 9876,
      type: "application/pdf",
    });
    expect("thumbnails" in value[0]!).toBe(false);
  });

  it("attachment: normalizes Airtable's omit-when-empty to [] (multipleSelects parity)", () => {
    expect(parseFieldValue("attachment", undefined)).toEqual({
      type: "attachment",
      value: [],
    });
    expect(parseFieldValue("attachment", null)).toEqual({
      type: "attachment",
      value: [],
    });
  });

  it("attachment: handles multiple attachments in one field", () => {
    const raw = [
      { id: "a", url: "https://x.example/1", filename: "1.png", size: 10, type: "image/png" },
      { id: "b", url: "https://x.example/2", filename: "2.png", size: 20, type: "image/png" },
    ];
    const parsed = parseFieldValue("attachment", raw);
    expect((parsed.value as unknown[]).length).toBe(2);
  });

  it("attachment: defensive defaults for malformed Airtable entries (empty string / 0)", () => {
    // Defensive: Airtable always returns id/url/filename/size/type for
    // successfully-uploaded attachments. If a wire response is broken
    // (e.g. uploading attachment), the projection emits empty strings
    // / 0 rather than throwing.
    const raw = [{ id: "att3" }];
    const parsed = parseFieldValue("attachment", raw);
    const value = parsed.value as unknown as ReadonlyArray<Record<string, unknown>>;
    expect(value[0]).toEqual({
      id: "att3",
      url: "",
      filename: "",
      size: 0,
      type: "",
    });
  });
});

// ─── parseFieldsWithSchema (schema-aware bulk parse) ────────────────────────

describe("parseFieldsWithSchema — schema-aware bulk parse", () => {
  const schema: ReadonlyArray<AirtableFieldSchema> = [
    { id: "fld1", name: "Name", type: "singleLineText" },
    { id: "fld2", name: "Score", type: "number" },
    { id: "fld3", name: "Tags", type: "multipleSelects" },
    { id: "fld4", name: "BadField", type: "rollup" },
  ];

  it("parses supported fields; collects deferred-type fields in skipped[]", () => {
    const fields = {
      Name: "Alice",
      Score: 99,
      Tags: ["X"],
      BadField: 12,
    };
    const { parsed, skipped } = parseFieldsWithSchema(fields, schema);
    expect(parsed).toEqual({
      Name: { type: "singleLineText", value: "Alice" },
      Score: { type: "number", value: 99 },
      Tags: { type: "multipleSelects", value: ["X"] },
    });
    expect(skipped).toEqual([{ name: "BadField", type: "rollup" }]);
  });

  it("supports schema lookup by field id (not just name)", () => {
    const fields = { fld1: "Alice" };
    const { parsed } = parseFieldsWithSchema(fields, schema);
    expect(parsed).toEqual({
      fld1: { type: "singleLineText", value: "Alice" },
    });
  });

  it("skips fields missing from the schema (stale-schema defense)", () => {
    const fields = { Mystery: "x" };
    const { parsed, skipped } = parseFieldsWithSchema(fields, schema);
    expect(parsed).toEqual({});
    expect(skipped).toEqual([{ name: "Mystery", type: "<missing>" }]);
  });

  it("does NOT throw on a record that mixes supported + deferred types (graceful degrade)", () => {
    expect(() =>
      parseFieldsWithSchema(
        { Name: "x", BadField: 1 },
        schema,
      ),
    ).not.toThrow();
  });
});
