/**
 * Pure-function tests for the FileField / FileRefArrayField shared
 * helper module — Slice 3.25 (D-SFR-4).
 *
 * Both renderers MUST stay in lockstep on what counts as a valid
 * token / a parseable FileRef literal / a dedup key / a chip label.
 * These tests pin the helpers' contract so renderer-side regressions
 * surface here first (cheap unit signal) rather than at integration-
 * test time.
 */
import {
  coerceFileRefArray,
  coerceSingleFileRef,
  entryKey,
  entryLabel,
  isExactToken,
  tryParseFileRef,
} from "@/features/workflow-builder/config-modal/fields/_fileRefEntry";

const v2Ref = {
  kind: "v2_storage",
  name: "report.pdf",
  mimeType: "application/pdf",
  storagePath: "user/wf/run/node/report.pdf",
} as const;

const signedRef = {
  kind: "signed_url",
  name: "logo.png",
  mimeType: "image/png",
  url: "https://example.test/signed",
} as const;

describe("isExactToken", () => {
  it("accepts a single `{{nodeId}}` token", () => {
    expect(isExactToken("{{trigger}}")).toBe(true);
  });

  it("accepts a single `{{nodeId.path}}` token", () => {
    expect(isExactToken("{{getAttachment.file}}")).toBe(true);
  });

  it("accepts a bracketed-index path", () => {
    expect(isExactToken("{{trigger[0]}}")).toBe(true);
  });

  it("rejects an unterminated token", () => {
    expect(isExactToken("{{getAttachment.file")).toBe(false);
  });

  it("rejects empty content", () => {
    expect(isExactToken("{{}}")).toBe(false);
  });

  it("rejects a token surrounded by other content", () => {
    expect(isExactToken("prefix {{trigger.file}}")).toBe(false);
    expect(isExactToken("{{trigger.file}} suffix")).toBe(false);
  });

  it("rejects two tokens in one string", () => {
    expect(isExactToken("{{a.b}}{{c.d}}")).toBe(false);
  });

  it("rejects AI_FIELD tokens — picker contract skips them", () => {
    expect(isExactToken("{{AI_FIELD:someField}}")).toBe(false);
  });

  it("rejects a plain non-token string", () => {
    expect(isExactToken("hello")).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(isExactToken("")).toBe(false);
  });
});

describe("tryParseFileRef", () => {
  it("returns a parsed FileRef for a valid v2_storage literal", () => {
    const out = tryParseFileRef(JSON.stringify(v2Ref));
    expect(out).not.toBeNull();
    expect(out).toEqual(v2Ref);
  });

  it("returns a parsed FileRef for a valid signed_url literal", () => {
    const out = tryParseFileRef(JSON.stringify(signedRef));
    expect(out).toEqual(signedRef);
  });

  it("returns null for non-JSON input", () => {
    expect(tryParseFileRef("not json at all")).toBeNull();
  });

  it("returns null for a JSON object missing the discriminator", () => {
    expect(tryParseFileRef('{"name":"x","mimeType":"text/plain"}')).toBeNull();
  });

  it("returns null for a JSON object with an inline bytes / base64 field", () => {
    const bad = JSON.stringify({ ...v2Ref, base64: "AAAA" });
    expect(tryParseFileRef(bad)).toBeNull();
  });

  it("returns null for JSON that isn't an object literal (array, primitive)", () => {
    expect(tryParseFileRef("[1,2,3]")).toBeNull();
    expect(tryParseFileRef("42")).toBeNull();
    expect(tryParseFileRef('"hi"')).toBeNull();
  });

  it("returns null for the empty string", () => {
    expect(tryParseFileRef("")).toBeNull();
  });

  it("never throws on malformed JSON", () => {
    expect(() => tryParseFileRef("{this is not json")).not.toThrow();
    expect(tryParseFileRef("{this is not json")).toBeNull();
  });
});

describe("entryKey", () => {
  it("emits a `t:` prefix for token strings", () => {
    expect(entryKey("{{trigger.file}}")).toBe("t:{{trigger.file}}");
  });

  it("emits an `f:` prefix for FileRef objects", () => {
    expect(entryKey(v2Ref)).toBe(`f:${JSON.stringify(v2Ref)}`);
  });

  it("distinguishes token vs object even when their canonical strings would otherwise overlap", () => {
    // A token's printable form starts with `{{`; a FileRef JSON starts
    // with `{`. The `t:` / `f:` prefixes guarantee no cross-collision.
    expect(entryKey("{{a.b}}")).not.toBe(entryKey(v2Ref));
  });

  it("treats two FileRefs with the same canonical fields as equal", () => {
    const dup = { ...v2Ref };
    expect(entryKey(v2Ref)).toBe(entryKey(dup));
  });
});

describe("entryLabel", () => {
  it("renders a token chip with the token's verbatim text", () => {
    expect(entryLabel("{{trigger.file}}")).toBe("{{trigger.file}}");
  });

  it("renders a FileRef chip with `name` (never `url` / `storagePath`)", () => {
    expect(entryLabel(v2Ref)).toBe("report.pdf");
    expect(entryLabel(signedRef)).toBe("logo.png");
  });
});

describe("coerceFileRefArray", () => {
  it("returns [] for non-array input", () => {
    expect(coerceFileRefArray(undefined)).toEqual([]);
    expect(coerceFileRefArray("oops")).toEqual([]);
    expect(coerceFileRefArray(42)).toEqual([]);
    expect(coerceFileRefArray(null)).toEqual([]);
    expect(coerceFileRefArray({ kind: "v2_storage" })).toEqual([]);
  });

  it("returns [] for an empty array", () => {
    expect(coerceFileRefArray([])).toEqual([]);
  });

  it("keeps valid tokens (after trim) and valid FileRefs", () => {
    expect(
      coerceFileRefArray([
        "{{getAtt.file}}",
        v2Ref,
        "  {{trigger.file}}  ",
        signedRef,
      ]),
    ).toEqual([
      "{{getAtt.file}}",
      v2Ref,
      "{{trigger.file}}",
      signedRef,
    ]);
  });

  it("drops malformed entries (non-token strings, non-FileRef objects, primitives, null)", () => {
    expect(
      coerceFileRefArray([
        "{{getAtt.file}}",
        "not a token",
        { kind: "bogus", name: "x" },
        null,
        42,
        false,
        v2Ref,
      ]),
    ).toEqual(["{{getAtt.file}}", v2Ref]);
  });
});

describe("coerceSingleFileRef", () => {
  it("returns undefined for non-string non-object input", () => {
    expect(coerceSingleFileRef(undefined)).toBeUndefined();
    expect(coerceSingleFileRef(null)).toBeUndefined();
    expect(coerceSingleFileRef(42)).toBeUndefined();
    expect(coerceSingleFileRef(true)).toBeUndefined();
    expect(coerceSingleFileRef([v2Ref])).toBeUndefined();
  });

  it("returns undefined for the empty string", () => {
    expect(coerceSingleFileRef("")).toBeUndefined();
    expect(coerceSingleFileRef("   ")).toBeUndefined();
  });

  it("returns the token literal for a valid `{{nodeId.path}}` string (after trim)", () => {
    expect(coerceSingleFileRef("{{getAtt.file}}")).toBe("{{getAtt.file}}");
    expect(coerceSingleFileRef("  {{getAtt.file}}  ")).toBe("{{getAtt.file}}");
  });

  it("returns undefined for a non-token string", () => {
    expect(coerceSingleFileRef("hello world")).toBeUndefined();
    expect(coerceSingleFileRef("prefix {{getAtt.file}} suffix")).toBeUndefined();
  });

  it("returns the FileRef for a valid object", () => {
    expect(coerceSingleFileRef(v2Ref)).toEqual(v2Ref);
    expect(coerceSingleFileRef(signedRef)).toEqual(signedRef);
  });

  it("returns undefined for an object that fails FileRefSchema", () => {
    expect(
      coerceSingleFileRef({ kind: "bogus", name: "x" }),
    ).toBeUndefined();
    // Inline bytes/base64 fields are rejected by FileRefSchema's strict
    // arms — the helper must not strip-and-accept.
    expect(
      coerceSingleFileRef({ ...v2Ref, base64: "AAAA" }),
    ).toBeUndefined();
  });
});
