/**
 * @jest-environment node
 *
 * SUPABASE-ENV-PIPELINE-1 — supabase/seed.sql stays data-only and commit-safe.
 *
 * The seed runs automatically on every `supabase db reset` (local + guarded dev
 * resets). These invariants keep it from ever becoming a second schema channel
 * or a secret/production-data leak.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const seedPath = resolve(__dirname, "../../../supabase/seed.sql");
const raw = readFileSync(seedPath, "utf8");
// Policy applies to executable SQL, not the explanatory comments.
const sql = raw
  .split(/\r?\n/)
  .map((l) => l.replace(/--.*$/, ""))
  .join("\n");

describe("supabase/seed.sql safety", () => {
  it("contains no DDL — schema belongs exclusively to migrations", () => {
    expect(sql).not.toMatch(/\b(create|alter|drop)\s+(table|index|view|function|trigger|policy|schema|type|extension|role)\b/i);
    expect(sql).not.toMatch(/\bgrant\b|\brevoke\b/i);
  });

  it("never touches auth.users directly (bootstrap uses the auth.admin API)", () => {
    expect(sql).not.toMatch(/auth\s*\.\s*users/i);
  });

  it("contains no secret-shaped values", () => {
    // JWTs, Stripe live keys, long base64/hex blobs, bearer headers.
    expect(sql).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/);
    expect(sql).not.toMatch(/sk_(live|test)_/);
    expect(sql).not.toMatch(/[A-Za-z0-9+/]{40,}={0,2}/);
    expect(sql).not.toMatch(/\b[0-9a-f]{40,}\b/i);
    expect(sql).not.toMatch(/authorization:\s*bearer/i);
  });

  it("contains no real-looking email addresses (only *.chainreact.test allowed)", () => {
    const emails = sql.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi) ?? [];
    for (const email of emails) {
      expect(email.endsWith("@chainreact.test")).toBe(true);
    }
  });

  it("contains no production project reference", () => {
    expect(raw).not.toContain("qcepijemjlkssfkvzlio");
  });
});
