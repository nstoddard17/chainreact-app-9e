/**
 * @jest-environment node
 *
 * Tests for `integrations/_shared/facebook/webhooks/verifyChallenge.ts` —
 * Slice 3.FACEBOOK-5.
 */
import { verifyFacebookChallenge } from "@/integrations/_shared/facebook/webhooks/verifyChallenge";

const TOKEN = "my-verify-token";

describe("verifyFacebookChallenge", () => {
  it("subscribe + matching token + challenge → ok with the challenge echoed", () => {
    expect(
      verifyFacebookChallenge({
        mode: "subscribe",
        token: TOKEN,
        challenge: "CHALLENGE_123",
        expectedToken: TOKEN,
      }),
    ).toEqual({ ok: true, challenge: "CHALLENGE_123" });
  });

  it("wrong verify token → not ok", () => {
    expect(
      verifyFacebookChallenge({
        mode: "subscribe",
        token: "wrong",
        challenge: "CHALLENGE_123",
        expectedToken: TOKEN,
      }),
    ).toEqual({ ok: false });
  });

  it("missing expected token (unconfigured) → not ok (fail-closed)", () => {
    expect(
      verifyFacebookChallenge({
        mode: "subscribe",
        token: TOKEN,
        challenge: "CHALLENGE_123",
        expectedToken: undefined,
      }),
    ).toEqual({ ok: false });
  });

  it("missing token param → not ok", () => {
    expect(
      verifyFacebookChallenge({
        mode: "subscribe",
        token: null,
        challenge: "CHALLENGE_123",
        expectedToken: TOKEN,
      }),
    ).toEqual({ ok: false });
  });

  it("wrong mode → not ok", () => {
    expect(
      verifyFacebookChallenge({
        mode: "unsubscribe",
        token: TOKEN,
        challenge: "CHALLENGE_123",
        expectedToken: TOKEN,
      }),
    ).toEqual({ ok: false });
  });

  it("missing challenge → not ok (nothing to echo)", () => {
    expect(
      verifyFacebookChallenge({
        mode: "subscribe",
        token: TOKEN,
        challenge: null,
        expectedToken: TOKEN,
      }),
    ).toEqual({ ok: false });
  });
});
