/** @jest-environment node */
import {
  assertSafeTestEnvironment,
  evaluateTestEnvironmentSafety,
  parseSupabaseProjectRef,
  type TestEnvironmentInput,
} from "../../e2e/helpers/assertSafeTestEnvironment";

/**
 * 5.DUAL-BUILDER-1 CS-7C — the destructive-test-setup safety guard.
 *
 * The guard is the reason a blocked CS-7C cannot silently point the e2e
 * harness at production: it refuses to build the service-role admin client
 * unless the target proves it is a safe test/local database.
 */
describe("assertSafeTestEnvironment (CS-7C destructive-setup guard)", () => {
  describe("parseSupabaseProjectRef", () => {
    it("extracts the 20-char ref from a cloud host", () => {
      expect(
        parseSupabaseProjectRef("https://qcepijemjlkssfkvzlio.supabase.co"),
      ).toBe("qcepijemjlkssfkvzlio");
    });
    it("returns null for a localhost URL", () => {
      expect(parseSupabaseProjectRef("http://127.0.0.1:54321")).toBeNull();
    });
    it("returns null for undefined / non-supabase hosts", () => {
      expect(parseSupabaseProjectRef(undefined)).toBeNull();
      expect(parseSupabaseProjectRef("https://example.com")).toBeNull();
    });
  });

  describe("SAFE targets", () => {
    it.each([
      "http://localhost:54321",
      "http://127.0.0.1:54321",
      "http://0.0.0.0:54321",
      "http://host.docker.internal:54321",
    ])("accepts loopback/local host %s", (url) => {
      const r = evaluateTestEnvironmentSafety({ NEXT_PUBLIC_SUPABASE_URL: url });
      expect(r.safe).toBe(true);
    });

    it("accepts a cloud project only with explicit opt-in", () => {
      const env: TestEnvironmentInput = {
        NEXT_PUBLIC_SUPABASE_URL: "https://testtesttesttesttest.supabase.co",
        E2E_ALLOW_DESTRUCTIVE_TEST_SETUP: "true",
      };
      const r = evaluateTestEnvironmentSafety(env);
      expect(r.safe).toBe(true);
      expect(r.reason).toContain("E2E_ALLOW_DESTRUCTIVE_TEST_SETUP");
    });

    it("accepts a cloud project whose ref is allow-listed", () => {
      const env: TestEnvironmentInput = {
        NEXT_PUBLIC_SUPABASE_URL: "https://aaaaaaaaaaaaaaaaaaaa.supabase.co",
        E2E_TEST_SUPABASE_REFS: "bbbbbbbbbbbbbbbbbbbb, aaaaaaaaaaaaaaaaaaaa",
      };
      const r = evaluateTestEnvironmentSafety(env);
      expect(r.safe).toBe(true);
      expect(r.reason).toContain("allow-list");
    });
  });

  describe("UNSAFE targets (fail closed)", () => {
    it("refuses a cloud project with NO proof (the production-accident case)", () => {
      const env: TestEnvironmentInput = {
        NEXT_PUBLIC_SUPABASE_URL: "https://qcepijemjlkssfkvzlio.supabase.co",
      };
      const r = evaluateTestEnvironmentSafety(env);
      expect(r.safe).toBe(false);
      expect(r.projectRef).toBe("qcepijemjlkssfkvzlio");
      expect(r.reason).toContain("Refusing destructive e2e setup");
    });

    it("refuses when the URL is unset", () => {
      expect(evaluateTestEnvironmentSafety({}).safe).toBe(false);
    });

    it("does NOT treat a non-matching ref in the allow-list as safe", () => {
      const env: TestEnvironmentInput = {
        NEXT_PUBLIC_SUPABASE_URL: "https/qcepijemjlkssfkvzlio.supabase.co", // invalid URL
        E2E_TEST_SUPABASE_REFS: "aaaaaaaaaaaaaaaaaaaa",
      };
      expect(evaluateTestEnvironmentSafety(env).safe).toBe(false);
    });

    it("does not rely on NODE_ENV=test alone", () => {
      // NODE_ENV is not even read by the guard; a prod URL stays unsafe.
      const env: TestEnvironmentInput = {
        NEXT_PUBLIC_SUPABASE_URL: "https://qcepijemjlkssfkvzlio.supabase.co",
      };
      expect(evaluateTestEnvironmentSafety(env).safe).toBe(false);
    });
  });

  describe("never leaks secrets", () => {
    it("reason surfaces host/ref only, never key material", () => {
      const env: TestEnvironmentInput = {
        NEXT_PUBLIC_SUPABASE_URL: "https://qcepijemjlkssfkvzlio.supabase.co",
      };
      const r = evaluateTestEnvironmentSafety(env);
      // A ref is fine; a key/JWT-looking string must never appear.
      expect(r.reason).not.toMatch(/eyJ[A-Za-z0-9]/); // JWT prefix
      expect(r.reason).not.toMatch(/service_role|anon key|password/i);
    });
  });

  describe("assertSafeTestEnvironment", () => {
    it("throws a [e2e safety] error for an unproven cloud target", () => {
      expect(() =>
        assertSafeTestEnvironment({
          NEXT_PUBLIC_SUPABASE_URL: "https://qcepijemjlkssfkvzlio.supabase.co",
        }),
      ).toThrow(/\[e2e safety\]/);
    });

    it("does not throw for a localhost target", () => {
      expect(() =>
        assertSafeTestEnvironment({
          NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
        }),
      ).not.toThrow();
    });
  });
});
