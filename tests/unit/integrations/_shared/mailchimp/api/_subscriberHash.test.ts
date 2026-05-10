/**
 * @jest-environment node
 *
 * Tests for `_shared/mailchimp/api/_subscriberHash.ts` — the MD5
 * email-hash helper Mailchimp's subscriber endpoints require.
 *
 * Slice 14 Commit 2 lands the helper; Slice 14 Commit 3's action
 * handlers will use it.
 */
import { subscriberHash } from "@/integrations/_shared/mailchimp/api/_subscriberHash";

describe("subscriberHash", () => {
  it("returns the lowercase-email MD5 hex per Mailchimp's documented recipe", () => {
    // The canonical reference value: per current Mailchimp docs,
    // `subscriberHash('urist@mcvankab.com')` is
    // `'41c00e62476865ba72254cdc5b2c191e'` — the MD5 hex digest of
    // the lowercased email string. Independent verification:
    // `echo -n "urist@mcvankab.com" | md5sum` produces the same value.
    expect(subscriberHash("urist@mcvankab.com")).toBe(
      "41c00e62476865ba72254cdc5b2c191e",
    );
  });

  it("lowercases the email before hashing (case-insensitivity is REQUIRED by Mailchimp)", () => {
    // Mailchimp normalizes emails to lowercase on store. If the
    // helper hashes the input verbatim, an action passing
    // `"User@Example.com"` would resolve to a different hash than
    // the same record looked up via `"user@example.com"` — and
    // hit a 404. Lowercasing is mandatory.
    const lower = subscriberHash("user@example.com");
    const mixed = subscriberHash("User@Example.COM");
    const upper = subscriberHash("USER@EXAMPLE.COM");
    expect(mixed).toBe(lower);
    expect(upper).toBe(lower);
  });

  it("produces a stable 32-character lowercase hex string", () => {
    const h = subscriberHash("user@example.com");
    expect(h).toMatch(/^[0-9a-f]{32}$/);
  });

  it("throws on empty string (fails loud rather than silently hashing '')", () => {
    // The MD5 of empty string is `d41d8cd98f00b204e9800998ecf8427e`
    // — a real string. If the helper accepted empty input, a
    // missing-email bug would resolve to that fixed hash and
    // either 404 (best case) or hit an unintended record (worst).
    // Fail loud.
    expect(() => subscriberHash("")).toThrow(/non-empty/);
  });

  it("throws on whitespace-only input", () => {
    expect(() => subscriberHash("   ")).toThrow(/non-empty/);
    expect(() => subscriberHash("\t")).toThrow(/non-empty/);
  });

  it("throws on non-string input (defensive — TS catches at compile time, runtime catches mocks)", () => {
    // Anti-test for runtime callers that pass through untyped
    // user input. The Zod schema layer in Slice 14 Commit 3 will
    // catch this at the handler boundary, but the helper has its
    // own defense.
    expect(() => subscriberHash(null as unknown as string)).toThrow(
      /non-empty/,
    );
    expect(() => subscriberHash(undefined as unknown as string)).toThrow(
      /non-empty/,
    );
  });
});
