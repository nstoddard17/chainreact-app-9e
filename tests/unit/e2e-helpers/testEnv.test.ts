/** @jest-environment node */
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  resolveTestEnv,
  loadTestEnv,
  parseEnvFile,
  readTestEnvFile,
  testEnvFilePath,
  LOOPBACK_DEFAULTS,
} from "../../e2e/helpers/testEnv";
import { assertSafeTestEnvironment } from "../../e2e/helpers/assertSafeTestEnvironment";

const LOCAL_URL = "http://127.0.0.1:54321";
const CLOUD_URL = "https://qcepijemjlkssfkvzlio.supabase.co";
const FAKE_ANON = "anon.fake.jwt";
const FAKE_SERVICE = "service.fake.jwt";

function fileEnv(over: Record<string, string> = {}): Record<string, string> {
  return {
    NEXT_PUBLIC_SUPABASE_URL: LOCAL_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: FAKE_ANON,
    SUPABASE_SERVICE_ROLE_KEY: FAKE_SERVICE,
    ...over,
  };
}

describe("CS-7D e2e test-environment loader", () => {
  describe("parseEnvFile", () => {
    it("parses KEY=value, trims, and strips quotes", () => {
      const parsed = parseEnvFile(
        'A=1\n B = "two" \nC=\'three\'\n# comment\nNOTAKEY\n',
      );
      expect(parsed).toEqual({ A: "1", B: "two", C: "three" });
    });
  });

  describe("resolveTestEnv precedence", () => {
    it("prefers .env.test.local (file) over loopback defaults", () => {
      const r = resolveTestEnv({}, fileEnv({ E2E_BASE_URL: "http://localhost:9999" }));
      expect(r.values.E2E_BASE_URL).toBe("http://localhost:9999");
      expect(r.sources.E2E_BASE_URL).toBe("file");
    });

    it("prefers process env over the file", () => {
      const r = resolveTestEnv(
        { NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321" },
        fileEnv(),
      );
      expect(r.values.NEXT_PUBLIC_SUPABASE_URL).toBe("http://localhost:54321");
      expect(r.sources.NEXT_PUBLIC_SUPABASE_URL).toBe("process");
    });

    it("applies loopback default ONLY when neither process nor file supply it", () => {
      const withoutUrl = fileEnv();
      delete (withoutUrl as Record<string, string>).NEXT_PUBLIC_SUPABASE_URL;
      const r = resolveTestEnv({}, withoutUrl);
      expect(r.values.NEXT_PUBLIC_SUPABASE_URL).toBe(
        LOOPBACK_DEFAULTS.NEXT_PUBLIC_SUPABASE_URL,
      );
      expect(r.sources.NEXT_PUBLIC_SUPABASE_URL).toBe("default");
    });

    it("has NO default for secret keys (fails closed when absent)", () => {
      const noSecrets = { NEXT_PUBLIC_SUPABASE_URL: LOCAL_URL };
      const r = resolveTestEnv({}, noSecrets);
      expect(r.missing).toContain("SUPABASE_SERVICE_ROLE_KEY");
      expect(r.missing).toContain("NEXT_PUBLIC_SUPABASE_ANON_KEY");
      expect(r.values.SUPABASE_SERVICE_ROLE_KEY).toBeUndefined();
    });
  });

  describe("readTestEnvFile targets .env.test.local, never .env.local", () => {
    it("the resolved file path ends with .env.test.local", () => {
      expect(testEnvFilePath().replace(/\\/g, "/")).toMatch(/\.env\.test\.local$/);
      expect(testEnvFilePath().replace(/\\/g, "/")).not.toMatch(/\/\.env\.local$/);
    });

    it("returns {} for a non-existent file rather than reading anything else", () => {
      expect(readTestEnvFile(join(tmpdir(), "does-not-exist-cs7d.env"))).toEqual({});
    });
  });

  describe("loadTestEnv", () => {
    function tmpEnvFile(contents: string): string {
      const dir = mkdtempSync(join(tmpdir(), "cs7d-env-"));
      const p = join(dir, ".env.test.local");
      writeFileSync(p, contents);
      return p;
    }

    it("loads file values into a fresh process env without overriding existing", () => {
      const proc: Record<string, string | undefined> = {
        NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321", // caller-supplied wins
      };
      const filePath = tmpEnvFile(
        `NEXT_PUBLIC_SUPABASE_URL=${LOCAL_URL}\nNEXT_PUBLIC_SUPABASE_ANON_KEY=${FAKE_ANON}\nSUPABASE_SERVICE_ROLE_KEY=${FAKE_SERVICE}\n`,
      );
      const r = loadTestEnv({ processEnv: proc, filePath });
      expect(proc.NEXT_PUBLIC_SUPABASE_URL).toBe("http://localhost:54321"); // not overridden
      expect(proc.SUPABASE_SERVICE_ROLE_KEY).toBe(FAKE_SERVICE); // filled from file
      expect(r.sources.NEXT_PUBLIC_SUPABASE_URL).toBe("process");
    });

    it("FAILS CLOSED when the service-role key is missing — and leaks no secret", () => {
      const filePath = tmpEnvFile(
        `NEXT_PUBLIC_SUPABASE_URL=${LOCAL_URL}\nNEXT_PUBLIC_SUPABASE_ANON_KEY=${FAKE_ANON}\n`,
      );
      let msg = "";
      try {
        loadTestEnv({ processEnv: {}, filePath });
        throw new Error("should have thrown");
      } catch (e) {
        msg = (e as Error).message;
      }
      expect(msg).toContain("SUPABASE_SERVICE_ROLE_KEY");
      expect(msg).toContain("never");
      expect(msg).toContain(".env.local"); // explains it does NOT read it
      // No value/secret is ever echoed.
      expect(msg).not.toContain(FAKE_ANON);
    });

    it("never implicitly reads .env.local (only the given file path)", () => {
      // Point at an empty temp file → required keys missing → throws, proving it
      // did NOT silently fall back to a real .env.local.
      const filePath = tmpEnvFile("# empty\n");
      expect(() => loadTestEnv({ processEnv: {}, filePath })).toThrow(
        /Missing required test-environment variable/,
      );
    });
  });

  describe("end-to-end with the CS-7C safety guard", () => {
    it("loopback URL from the loader PASSES the guard", () => {
      const proc: Record<string, string | undefined> = {};
      const dir = mkdtempSync(join(tmpdir(), "cs7d-env-"));
      const p = join(dir, ".env.test.local");
      writeFileSync(
        p,
        `NEXT_PUBLIC_SUPABASE_URL=${LOCAL_URL}\nNEXT_PUBLIC_SUPABASE_ANON_KEY=${FAKE_ANON}\nSUPABASE_SERVICE_ROLE_KEY=${FAKE_SERVICE}\n`,
      );
      loadTestEnv({ processEnv: proc, filePath: p });
      expect(() => assertSafeTestEnvironment(proc)).not.toThrow();
    });

    it("a cloud production URL FAILS CLOSED at the guard even if loaded", () => {
      const proc: Record<string, string | undefined> = {};
      const dir = mkdtempSync(join(tmpdir(), "cs7d-env-"));
      const p = join(dir, ".env.test.local");
      writeFileSync(
        p,
        `NEXT_PUBLIC_SUPABASE_URL=${CLOUD_URL}\nNEXT_PUBLIC_SUPABASE_ANON_KEY=${FAKE_ANON}\nSUPABASE_SERVICE_ROLE_KEY=${FAKE_SERVICE}\n`,
      );
      loadTestEnv({ processEnv: proc, filePath: p });
      expect(() => assertSafeTestEnvironment(proc)).toThrow(/\[e2e safety\]/);
    });
  });
});
