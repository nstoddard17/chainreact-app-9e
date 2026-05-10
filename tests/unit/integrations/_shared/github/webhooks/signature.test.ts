/**
 * @jest-environment node
 *
 * Tests for `verifyGitHubSignature` — the HMAC-SHA256-hex-over-raw-body
 * verification helper that drives the GitHub webhook receive route.
 *
 * Pinned wire-format facts:
 *   - Algorithm: HMAC-SHA256 over raw body bytes.
 *   - Encoding: lowercase hex of the 32-byte digest (64 hex chars).
 *   - Header format: `sha256=<hex>` — `sha256=` prefix mandatory.
 *   - Key: single global webhook secret (`GITHUB_WEBHOOK_SECRET`).
 *   - No timestamp, no replay tolerance.
 *   - Constant-time compare via `crypto.timingSafeEqual` with a
 *     length-mismatch guard that runs FIRST.
 *
 * **Load-bearing V1-bug-fix tests:**
 *   - `missing_secret` is its own typed reason (route maps to 503).
 *     V1 silently returned `true` (allowed) when the secret env was
 *     missing — V2 fails closed.
 *   - `missing_header` distinct from `missing_secret`. V1 also
 *     returned `true` when header was absent — V2 fails closed at 401.
 */
import { createHmac } from "node:crypto";
import { verifyGitHubSignature } from "@/integrations/_shared/github/webhooks/signature";

const SECRET = "test_webhook_secret_xxx";

function signBody(body: string, secret: string = SECRET): string {
  const hex = createHmac("sha256", secret).update(body, "utf8").digest("hex");
  return `sha256=${hex}`;
}

describe("verifyGitHubSignature — happy path", () => {
  it("accepts a correct sha256=<hex> HMAC over the raw body", () => {
    const body = '{"ref":"refs/heads/main","repository":{"full_name":"u/r"}}';
    const sig = signBody(body);
    expect(verifyGitHubSignature(body, sig, SECRET)).toEqual({ valid: true });
  });

  it("preserves whitespace + newlines (raw bytes signed verbatim)", () => {
    // GitHub signs the literal bytes — re-serializing alters
    // whitespace and breaks the digest. The receive route MUST
    // capture the raw body before JSON parsing.
    const body =
      '{\n  "ref": "refs/heads/develop",\n  "head_commit": {\n    "id": "abc"\n  }\n}';
    const sig = signBody(body);
    expect(verifyGitHubSignature(body, sig, SECRET)).toEqual({ valid: true });
  });

  it("accepts an empty body when the signature was computed over empty bytes", () => {
    const body = "";
    const sig = signBody(body);
    expect(verifyGitHubSignature(body, sig, SECRET)).toEqual({ valid: true });
  });
});

describe("verifyGitHubSignature — V1-bug-fix gates", () => {
  it("returns missing_secret when secret is empty (V1 silently accepted unsigned events here)", () => {
    // Load-bearing test for V2's "fail-closed on missing secret"
    // contract. V1 [`route.ts:26-28`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/webhooks/github/route.ts#L26)
    // returned `true` (allowed) when the secret was missing. V2
    // returns a distinct typed reason so the route can map to 503.
    const body = '{"ref":"refs/heads/main"}';
    const sig = signBody(body, "any-other-secret");
    expect(verifyGitHubSignature(body, sig, "")).toEqual({
      valid: false,
      reason: "missing_secret",
    });
  });

  it("returns missing_header when signatureHeader is null (V1 had a dev bypass here)", () => {
    // Load-bearing test for V2's "fail-closed on missing header"
    // contract. V1 [`route.ts:31-34`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/webhooks/github/route.ts#L31)
    // returned `true` ("Allow in development") when the header was
    // absent. V2 returns a distinct typed reason so the route can
    // 401-reject.
    expect(verifyGitHubSignature("body", null, SECRET)).toEqual({
      valid: false,
      reason: "missing_header",
    });
  });

  it("returns missing_header when signatureHeader is empty string", () => {
    expect(verifyGitHubSignature("body", "", SECRET)).toEqual({
      valid: false,
      reason: "missing_header",
    });
  });

  it("missing_secret takes precedence over missing_header (server-misconfig is the bigger problem)", () => {
    expect(verifyGitHubSignature("body", null, "")).toEqual({
      valid: false,
      reason: "missing_secret",
    });
  });
});

describe("verifyGitHubSignature — failure modes", () => {
  it("returns mismatch when computed with a DIFFERENT secret", () => {
    const body = '{"ref":"refs/heads/main"}';
    const sig = signBody(body, "wrong-secret");
    expect(verifyGitHubSignature(body, sig, SECRET)).toEqual({
      valid: false,
      reason: "mismatch",
    });
  });

  it("returns mismatch when the body has been tampered with after signing", () => {
    const original = '{"ref":"refs/heads/main","author":"alice"}';
    const sig = signBody(original);
    const tampered = '{"ref":"refs/heads/main","author":"attacker"}';
    expect(verifyGitHubSignature(tampered, sig, SECRET)).toEqual({
      valid: false,
      reason: "mismatch",
    });
  });

  it("returns malformed when header is missing the sha256= prefix", () => {
    // GitHub sends `sha256=<hex>`. A bare hex without prefix is
    // malformed.
    const body = "x";
    const hex = createHmac("sha256", SECRET).update(body, "utf8").digest("hex");
    expect(verifyGitHubSignature(body, hex, SECRET)).toEqual({
      valid: false,
      reason: "malformed",
    });
  });

  it("returns malformed for a wrong sha1= prefix (V2 only verifies SHA-256)", () => {
    // GitHub also sends `X-Hub-Signature: sha1=<hex>` (legacy SHA-1)
    // — V2 ignores it. Verifier rejects sha1= prefix.
    const body = "x";
    const hex = createHmac("sha1", SECRET).update(body, "utf8").digest("hex");
    expect(verifyGitHubSignature(body, `sha1=${hex}`, SECRET)).toEqual({
      valid: false,
      reason: "malformed",
    });
  });

  it("returns malformed when hex digest is the wrong length", () => {
    const body = "x";
    expect(verifyGitHubSignature(body, "sha256=abc", SECRET)).toEqual({
      valid: false,
      reason: "malformed",
    });
  });

  it("returns malformed when hex digest contains non-hex characters", () => {
    // 64 chars but with letters outside [0-9a-f].
    const body = "x";
    const garbage = "sha256=" + "z".repeat(64);
    expect(verifyGitHubSignature(body, garbage, SECRET)).toEqual({
      valid: false,
      reason: "malformed",
    });
  });

  it("returns malformed when hex digest contains uppercase letters", () => {
    // GitHub's docs specify lowercase. Reject uppercase to keep wire
    // contract strict.
    const body = "x";
    const hex = createHmac("sha256", SECRET).update(body, "utf8").digest("hex");
    expect(
      verifyGitHubSignature(body, `sha256=${hex.toUpperCase()}`, SECRET),
    ).toEqual({
      valid: false,
      reason: "malformed",
    });
  });
});
