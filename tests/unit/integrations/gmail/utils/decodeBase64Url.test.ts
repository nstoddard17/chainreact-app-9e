/**
 * @jest-environment node
 *
 * Tests for the Gmail base64url decoding helper.
 *
 * Pins the Gmail-attachment wire-shape decoding contract from Gmail
 * 2.3 plan §7: handles base64url alphabet (`-`/`_`), optional
 * padding, and produces a `Uint8Array` of the exact original bytes.
 * Pure helper — no mocks, no fetch.
 */
import { decodeBase64Url } from "@/integrations/gmail/utils/decodeBase64Url";

describe("decodeBase64Url", () => {
  it("decodes standard base64 (no base64url-specific chars)", () => {
    // "hello" → "aGVsbG8=" (standard base64 with padding)
    const result = decodeBase64Url("aGVsbG8=");
    expect(Array.from(result)).toEqual([0x68, 0x65, 0x6c, 0x6c, 0x6f]);
  });

  it("decodes base64 with missing padding (Gmail strips trailing `=`)", () => {
    // Same "hello" but without the trailing padding char.
    const result = decodeBase64Url("aGVsbG8");
    expect(Array.from(result)).toEqual([0x68, 0x65, 0x6c, 0x6c, 0x6f]);
  });

  it("decodes base64url alphabet — `-` instead of `+`", () => {
    // Bytes 0xfb 0xff 0xff produce `+///` in standard base64
    // and `-///` in base64url. Verify both routes decode to the
    // same bytes.
    const fromUrl = decodeBase64Url("-///");
    expect(Array.from(fromUrl)).toEqual([0xfb, 0xff, 0xff]);
  });

  it("decodes base64url alphabet — `_` instead of `/`", () => {
    // Bytes 0xff 0xff 0xff produce `////` in standard base64 and
    // `____` in base64url.
    const fromUrl = decodeBase64Url("____");
    expect(Array.from(fromUrl)).toEqual([0xff, 0xff, 0xff]);
  });

  it("decodes a string mixing both base64url-specific chars + missing padding", () => {
    // 4 bytes 0xfb 0xef 0xbf 0xff → `+++//w==` standard
    // → `---__w` base64url no-padding.
    const result = decodeBase64Url("---__w");
    expect(Array.from(result)).toEqual([0xfb, 0xef, 0xbf, 0xff]);
  });

  it("round-trips sentinel bytes through Buffer base64url + decodeBase64Url", () => {
    const sentinel = new Uint8Array([0, 1, 127, 128, 200, 255]);
    // Encode via Node's Buffer.toString("base64url") (Gmail wire shape)
    // then decode back. This is the exact round-trip get_attachment
    // exercises against Gmail's response.
    const encoded = Buffer.from(sentinel).toString("base64url");
    const decoded = decodeBase64Url(encoded);
    expect(Array.from(decoded)).toEqual(Array.from(sentinel));
  });

  it("round-trips a larger payload (1KB) verbatim", () => {
    const original = new Uint8Array(1024);
    for (let i = 0; i < original.length; i++) {
      original[i] = (i * 37 + 5) & 0xff; // deterministic pseudo-random
    }
    const encoded = Buffer.from(original).toString("base64url");
    const decoded = decodeBase64Url(encoded);
    expect(decoded.length).toBe(original.length);
    expect(Array.from(decoded)).toEqual(Array.from(original));
  });

  it("returns an empty Uint8Array for an empty string", () => {
    const result = decodeBase64Url("");
    expect(result.length).toBe(0);
  });

  it("throws on a single trailing char (malformed base64url)", () => {
    // length % 4 === 1 is never a valid base64 length.
    expect(() => decodeBase64Url("aGVsbG8a")).not.toThrow(); // length 8 → valid
    expect(() => decodeBase64Url("aGVsbG8aa")).toThrow(/malformed base64url/);
  });

  it("returns a Uint8Array (not a Node Buffer) — typed-array invariant", () => {
    const result = decodeBase64Url("aGVsbG8");
    expect(result).toBeInstanceOf(Uint8Array);
  });
});
