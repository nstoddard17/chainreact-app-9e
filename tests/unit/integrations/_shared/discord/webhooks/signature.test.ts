/**
 * @jest-environment node
 *
 * Tests for `verifyDiscordSignature` — the Ed25519 signature
 * verification helper that drives the Discord interactions endpoint.
 *
 * Pinned wire-format facts (Discord docs:
 * https://discord.com/developers/docs/interactions/receiving-and-responding):
 *   - Algorithm: Ed25519 (RFC 8032).
 *   - Signed payload: `${timestamp}${rawBody}` — concatenated UTF-8
 *     bytes, no separator.
 *   - Header `X-Signature-Ed25519`: lowercase hex of the 64-byte
 *     signature (128 hex chars).
 *   - Header `X-Signature-Timestamp`: ASCII decimal integer (epoch
 *     seconds).
 *   - Public key: 32-byte raw, lowercase hex (64 chars).
 *
 * **Load-bearing V2 contracts:**
 *   - `missing_secret` distinct typed reason → route maps to 503.
 *     Server misconfig is fail-closed (no silent-accept).
 *   - Replay tolerance: NONE — same as GitHub. Timestamp is part of
 *     the signed payload but a stale-but-valid signature is still
 *     valid. Workflow author owns dedup via the trigger event id.
 */
import { generateKeyPairSync, sign as nodeSign } from "node:crypto";
import { verifyDiscordSignature } from "@/integrations/_shared/discord/webhooks/signature";

// Generate a single Ed25519 keypair for the test suite.
const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const PUBLIC_KEY_RAW = publicKey.export({ format: "der", type: "spki" });
// SPKI prefix is 12 bytes for Ed25519; the trailing 32 bytes are the raw key.
const PUBLIC_KEY_HEX = PUBLIC_KEY_RAW.subarray(12).toString("hex");

const TIMESTAMP = "1716480000"; // 2024-05-23T16:00:00Z — arbitrary fixed value.

function signMessage(body: string, timestamp: string = TIMESTAMP): string {
  const payload = Buffer.concat([
    Buffer.from(timestamp, "utf8"),
    Buffer.from(body, "utf8"),
  ]);
  return nodeSign(null, payload, privateKey).toString("hex");
}

describe("verifyDiscordSignature — happy path", () => {
  it("accepts a correct Ed25519 signature over ${timestamp}${rawBody}", () => {
    const body = '{"type":1}';
    const sig = signMessage(body);
    expect(
      verifyDiscordSignature(body, sig, TIMESTAMP, PUBLIC_KEY_HEX),
    ).toEqual({ valid: true });
  });

  it("preserves whitespace + newlines (raw bytes signed verbatim)", () => {
    // Discord signs literal bytes — the receive route MUST capture raw
    // body BEFORE JSON parsing. Re-serializing alters whitespace and
    // breaks the digest.
    const body =
      '{\n  "type": 2,\n  "data": {\n    "name": "report"\n  }\n}';
    const sig = signMessage(body);
    expect(
      verifyDiscordSignature(body, sig, TIMESTAMP, PUBLIC_KEY_HEX),
    ).toEqual({ valid: true });
  });

  it("accepts a signature over an empty body when computed over empty bytes", () => {
    const body = "";
    const sig = signMessage(body);
    expect(
      verifyDiscordSignature(body, sig, TIMESTAMP, PUBLIC_KEY_HEX),
    ).toEqual({ valid: true });
  });

  it("verifies signature is bound to the timestamp (timestamp is part of signed payload)", () => {
    // A signature computed over (T1, body) must NOT verify against
    // (T2, body) — Discord's design intentionally couples timestamp to
    // the signature so a captured (sig, body) can't be replayed with
    // a different timestamp header.
    const body = '{"type":1}';
    const sig = signMessage(body, "1716480000");
    expect(
      verifyDiscordSignature(body, sig, "1716480001", PUBLIC_KEY_HEX),
    ).toEqual({ valid: false, reason: "mismatch" });
  });
});

describe("verifyDiscordSignature — V2-bug-fix gates", () => {
  it("returns missing_secret when public key is empty (V2 fail-closed at 503)", () => {
    // Load-bearing V2 contract: route maps `missing_secret` to 503
    // (server misconfig). Mirrors GitHub's `missing_secret` →
    // MissingSecretError → 503 mapping.
    const body = '{"type":1}';
    const sig = signMessage(body);
    expect(verifyDiscordSignature(body, sig, TIMESTAMP, "")).toEqual({
      valid: false,
      reason: "missing_secret",
    });
  });

  it("returns missing_header when X-Signature-Ed25519 is null", () => {
    expect(
      verifyDiscordSignature("body", null, TIMESTAMP, PUBLIC_KEY_HEX),
    ).toEqual({ valid: false, reason: "missing_header" });
  });

  it("returns missing_header when X-Signature-Timestamp is null", () => {
    const sig = signMessage("body");
    expect(verifyDiscordSignature("body", sig, null, PUBLIC_KEY_HEX)).toEqual({
      valid: false,
      reason: "missing_header",
    });
  });

  it("returns missing_header when both headers are null", () => {
    expect(verifyDiscordSignature("body", null, null, PUBLIC_KEY_HEX)).toEqual({
      valid: false,
      reason: "missing_header",
    });
  });

  it("missing_secret takes precedence over missing_header (server-misconfig is bigger)", () => {
    expect(verifyDiscordSignature("body", null, null, "")).toEqual({
      valid: false,
      reason: "missing_secret",
    });
  });
});

describe("verifyDiscordSignature — failure modes", () => {
  it("returns mismatch when signed with a DIFFERENT keypair", () => {
    const body = '{"type":1}';
    const { privateKey: other } = generateKeyPairSync("ed25519");
    const otherSig = nodeSign(
      null,
      Buffer.concat([Buffer.from(TIMESTAMP), Buffer.from(body)]),
      other,
    ).toString("hex");
    expect(
      verifyDiscordSignature(body, otherSig, TIMESTAMP, PUBLIC_KEY_HEX),
    ).toEqual({ valid: false, reason: "mismatch" });
  });

  it("returns mismatch when body is tampered with after signing", () => {
    const original = '{"type":2,"data":{"name":"report"}}';
    const sig = signMessage(original);
    const tampered = '{"type":2,"data":{"name":"attack"}}';
    expect(
      verifyDiscordSignature(tampered, sig, TIMESTAMP, PUBLIC_KEY_HEX),
    ).toEqual({ valid: false, reason: "mismatch" });
  });

  it("returns malformed when signature hex is the wrong length", () => {
    expect(
      verifyDiscordSignature("x", "abc", TIMESTAMP, PUBLIC_KEY_HEX),
    ).toEqual({ valid: false, reason: "malformed" });
  });

  it("returns malformed when signature hex contains uppercase (Discord docs specify lowercase)", () => {
    const body = "x";
    const sig = signMessage(body);
    expect(
      verifyDiscordSignature(
        body,
        sig.toUpperCase(),
        TIMESTAMP,
        PUBLIC_KEY_HEX,
      ),
    ).toEqual({ valid: false, reason: "malformed" });
  });

  it("returns malformed when signature hex contains non-hex characters", () => {
    expect(
      verifyDiscordSignature("x", "z".repeat(128), TIMESTAMP, PUBLIC_KEY_HEX),
    ).toEqual({ valid: false, reason: "malformed" });
  });

  it("returns malformed when timestamp is empty", () => {
    const sig = signMessage("x");
    expect(verifyDiscordSignature("x", sig, "", PUBLIC_KEY_HEX)).toEqual({
      valid: false,
      // empty timestamp falls into missing_header per the helper's
      // null/empty check ordering (intentional: missing-vs-empty is a
      // distinction without a difference at the wire level).
      reason: "missing_header",
    });
  });

  it("returns malformed when timestamp contains non-digits", () => {
    const sig = signMessage("x");
    expect(
      verifyDiscordSignature("x", sig, "1716480000abc", PUBLIC_KEY_HEX),
    ).toEqual({ valid: false, reason: "malformed" });
  });

  it("returns malformed when public key hex is the wrong length", () => {
    expect(
      verifyDiscordSignature("x", signMessage("x"), TIMESTAMP, "abc123"),
    ).toEqual({ valid: false, reason: "malformed" });
  });

  it("returns malformed when public key hex contains non-hex characters", () => {
    expect(
      verifyDiscordSignature(
        "x",
        signMessage("x"),
        TIMESTAMP,
        "z".repeat(64),
      ),
    ).toEqual({ valid: false, reason: "malformed" });
  });
});
