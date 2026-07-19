/**
 * @jest-environment node
 *
 * Phase 8 / OAUTH-REFRESH-RELIABILITY-1 — end-to-end smoke for the proactive
 * OAuth token refresh cron, using REAL V2 internals against the dev DB:
 * route handler → requireCronAuth → tokenRefreshSweep → refreshWithClaim
 * (DB claim) → dispatcher → gmail OAuth (shared Google helper) → repository
 * (service-role) → encryption. The ONLY mocked boundary is Google's token
 * endpoint — a local HTTP server pointed at via the `GOOGLE_TOKEN_BASE`
 * env override the shared helper already supports.
 *
 * Scenarios:
 *   1. Expired (long-idle) row → cron refreshes it in place: new access token
 *      persisted, future expiry, REFRESH TOKEN PRESERVED when Google's refresh
 *      response omits one, needs_reconnect_at stays NULL — no reconnect needed.
 *   2. Rotating response → the returned refresh_token is persisted.
 *   3. invalid_grant → row marked needs_reconnect_at; refresh token NOT wiped;
 *      access token untouched.
 *   4. Reactive path: an "action" against the expired token 401s, refreshes
 *      through the same claim pipeline, retries with the new token, succeeds.
 *
 * SAFETY: fixtures use epoch-1970 expiries so `ORDER BY access_token_expires_at
 * ASC` + `limit=1` guarantees the sweep only ever touches OUR fixture row —
 * never a real dev-DB integration (whose expiries are all ≥ connect time).
 * Fake token plaintexts are obvious fakes; cleanup deletes everything seeded.
 *
 * DESTRUCTIVE (throwaway auth user + account + integration). OPT-IN — set
 * ALLOW_DB_INTEGRATION_TESTS=true with NEXT_PUBLIC_SUPABASE_URL +
 * SUPABASE_SERVICE_ROLE_KEY + TOKEN_ENCRYPTION_KEY (migrations applied,
 * including 20260719000000_integrations_refresh_claim).
 */

import { createServer, type Server } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { encryptToken, decryptToken } from "@/core/encryption/tokens";
import {
  cleanupFixtures,
  createFixtureTracker,
  createTrackedUser,
} from "@/tests/helpers/dbFixtureCleanup";

function loadEnvLocal(): void {
  const p = resolve(process.cwd(), ".env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    const key = m[1]!;
    if (process.env[key]) continue;
    let v = m[2]!.trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    process.env[key] = v;
  }
}
loadEnvLocal();

const ALLOW = process.env.ALLOW_DB_INTEGRATION_TESTS === "true";
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const HAS_ENC_KEY = !!process.env.TOKEN_ENCRYPTION_KEY;
const RUN = ALLOW && !!URL_ && !!SERVICE_KEY && HAS_ENC_KEY;
const describeDb = RUN ? describe : describe.skip;

if (!RUN) {
  console.log(
    "SKIP oauth refresh cron smoke — set ALLOW_DB_INTEGRATION_TESTS=true with NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + TOKEN_ENCRYPTION_KEY.",
  );
}

// Obvious fakes — never real token material.
const FAKE_STALE_ACCESS = "ya29.FAKE-stale-access-DoNotStorePlaintext";
const FAKE_REFRESH = "1//FAKE-refresh-DoNotStorePlaintext";
const FAKE_NEW_ACCESS = "ya29.FAKE-new-access-from-mock";
const FAKE_ROTATED_REFRESH = "1//FAKE-rotated-refresh-from-mock";

/** Epoch-1970 expiries: sort FIRST under ORDER BY expiry ASC, so limit=1
 * can never reach a real dev row. Distinct per fixture for deterministic order. */
const EXPIRY_FIXTURE_1 = "1970-01-02T00:00:00.000Z";
const EXPIRY_FIXTURE_2 = "1970-01-03T00:00:00.000Z";

type MockMode = "refresh_no_rotation" | "refresh_with_rotation" | "invalid_grant";

describeDb("refresh-oauth-tokens cron — end-to-end (mock Google HTTP only)", () => {
  let admin: SupabaseClient;
  let server: Server;
  let userId = "";
  let accountId = "";
  const integrationIds: string[] = [];
  const fixtures = createFixtureTracker();
  let mockMode: MockMode = "refresh_no_rotation";
  let tokenEndpointHits = 0;

  jest.setTimeout(60_000);

  beforeAll(async () => {
    admin = createClient(URL_!, SERVICE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Local mock of Google's token endpoint. Real code path constructs
    // `${GOOGLE_TOKEN_BASE}/token`.
    server = createServer((req, res) => {
      tokenEndpointHits += 1;
      if (req.method === "POST" && req.url === "/token") {
        if (mockMode === "invalid_grant") {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "invalid_grant" }));
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            access_token: FAKE_NEW_ACCESS,
            expires_in: 3600,
            scope: "https://www.googleapis.com/auth/gmail.send",
            token_type: "Bearer",
            ...(mockMode === "refresh_with_rotation"
              ? { refresh_token: FAKE_ROTATED_REFRESH }
              : {}),
          }),
        );
        return;
      }
      res.writeHead(404);
      res.end();
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const addr = server.address();
    if (addr === null || typeof addr === "string") throw new Error("mock server addr");
    process.env.GOOGLE_TOKEN_BASE = `http://127.0.0.1:${addr.port}`;
    process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "fake-client-id";
    process.env.GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "fake-client-secret";
    process.env.CRON_SECRET = process.env.CRON_SECRET || "smoke-cron-secret";

    // Throwaway user (trigger provisions the personal account).
    const created = await createTrackedUser(admin, fixtures, "oauth-refresh-smoke");
    userId = created.userId;
    const { data: acct, error: acctErr } = await admin
      .from("accounts")
      .select("id")
      .eq("type", "personal")
      .eq("owner_user_id", userId)
      .single<{ id: string }>();
    if (acctErr || !acct) throw new Error(`personal account: ${acctErr?.message ?? "no row"}`);
    accountId = acct.id;
  });

  afterAll(async () => {
    await new Promise<void>((r) => server.close(() => r()));
    delete process.env.GOOGLE_TOKEN_BASE;
    // `notifications` is keyed by user_id, not account_id — not covered by the
    // account-scoped shared cleanup, so clear it first.
    if (admin && userId) {
      await admin.from("notifications").delete().eq("user_id", userId);
    }
    await cleanupFixtures(admin, fixtures);
  });

  async function seedGmailRow(providerAccountId: string, expiresAtIso: string): Promise<string> {
    const { data, error } = await admin
      .from("integrations")
      .insert({
        account_id: accountId,
        connected_by_user_id: userId,
        provider: "gmail",
        provider_account_id: providerAccountId,
        display_name: "smoke gmail",
        access_token_encrypted: encryptToken(FAKE_STALE_ACCESS),
        refresh_token_encrypted: encryptToken(FAKE_REFRESH),
        access_token_expires_at: expiresAtIso,
        scopes: ["https://www.googleapis.com/auth/gmail.send"],
        account_metadata: {},
      })
      .select("id")
      .single<{ id: string }>();
    if (error || !data) throw new Error(`seed integration: ${error?.message ?? "no row"}`);
    integrationIds.push(data.id);
    return data.id;
  }

  async function readRow(id: string): Promise<{
    access_token_encrypted: string;
    refresh_token_encrypted: string | null;
    access_token_expires_at: string | null;
    needs_reconnect_at: string | null;
    refresh_claim_id: string | null;
  }> {
    const { data, error } = await admin
      .from("integrations")
      .select(
        "access_token_encrypted, refresh_token_encrypted, access_token_expires_at, needs_reconnect_at, refresh_claim_id",
      )
      .eq("id", id)
      .single();
    if (error || !data) throw new Error(`read row: ${error?.message ?? "no row"}`);
    return data as never;
  }

  async function invokeCron(limit: number): Promise<{ status: number; body: Record<string, unknown> }> {
    // Import lazily so env overrides above are in place first.
    const { POST } = await import("@/app/api/cron/refresh-oauth-tokens/route");
    const res = await POST(
      new Request(`http://localhost/api/cron/refresh-oauth-tokens?limit=${limit}`, {
        method: "POST",
        headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
      }),
    );
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  }

  it("rejects an unauthenticated cron invocation", async () => {
    const { POST } = await import("@/app/api/cron/refresh-oauth-tokens/route");
    const res = await POST(
      new Request("http://localhost/api/cron/refresh-oauth-tokens", { method: "POST" }),
    );
    expect(res.status).toBe(401);
  });

  it("refreshes an expired row in place — refresh token preserved, no reconnect required", async () => {
    const id = await seedGmailRow("smoke-1@chainreact.test", EXPIRY_FIXTURE_1);
    mockMode = "refresh_no_rotation";
    tokenEndpointHits = 0;

    const { status, body } = await invokeCron(1);

    expect(status).toBe(200);
    expect(body).toMatchObject({ ok: true, due: 1, scanned: 1, refreshed: 1, failed: 0 });
    expect(tokenEndpointHits).toBe(1);
    // Response is counts-only — no token material, ids, or provider data.
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("FAKE");
    expect(serialized).not.toContain(id);

    const row = await readRow(id);
    expect(decryptToken(row.access_token_encrypted)).toBe(FAKE_NEW_ACCESS);
    // Google's refresh response omitted refresh_token → old one PRESERVED.
    expect(row.refresh_token_encrypted).not.toBeNull();
    expect(decryptToken(row.refresh_token_encrypted!)).toBe(FAKE_REFRESH);
    // Expiry moved into the future (now + 3600s).
    expect(Date.parse(row.access_token_expires_at!)).toBeGreaterThan(Date.now() + 30 * 60_000);
    // No reconnect required; claim released.
    expect(row.needs_reconnect_at).toBeNull();
    expect(row.refresh_claim_id).toBeNull();

    // The row is no longer due — the sweep's selection query (read-only, real
    // DB) no longer returns it. (Not asserted via a second cron tick: with the
    // fixture gone from the due set, limit=1 could reach a REAL dev row.)
    const { listRefreshDueServiceRole } = await import("@/repositories/integrationsRefresh");
    const due = await listRefreshDueServiceRole({
      dueBeforeIso: new Date(Date.now() + 30 * 60_000).toISOString(),
      limit: 500,
    });
    expect(due.map((r) => r.id)).not.toContain(id);
  });

  it("persists a rotated refresh token when the provider returns one", async () => {
    const id = await seedGmailRow("smoke-2@chainreact.test", EXPIRY_FIXTURE_1);
    mockMode = "refresh_with_rotation";

    const { body } = await invokeCron(1);
    expect(body).toMatchObject({ refreshed: 1 });

    const row = await readRow(id);
    expect(decryptToken(row.access_token_encrypted)).toBe(FAKE_NEW_ACCESS);
    expect(decryptToken(row.refresh_token_encrypted!)).toBe(FAKE_ROTATED_REFRESH);
    expect(row.needs_reconnect_at).toBeNull();
  });

  it("invalid_grant → marks needs_reconnect_at, never wipes tokens", async () => {
    const id = await seedGmailRow("smoke-3@chainreact.test", EXPIRY_FIXTURE_2);
    mockMode = "invalid_grant";

    const { status, body } = await invokeCron(1);

    expect(status).toBe(200);
    expect(body).toMatchObject({ actionRequired: 1, refreshed: 0, failed: 0 });

    const row = await readRow(id);
    expect(row.needs_reconnect_at).not.toBeNull();
    // Tokens are NOT wiped — reconnect flow owns replacement; nothing destroyed.
    expect(decryptToken(row.access_token_encrypted)).toBe(FAKE_STALE_ACCESS);
    expect(decryptToken(row.refresh_token_encrypted!)).toBe(FAKE_REFRESH);
    expect(row.refresh_claim_id).toBeNull();

    // Marked rows leave the sweep — the selection query (read-only, real DB)
    // excludes needs_reconnect rows, so the dead grant is never retried.
    const { listRefreshDueServiceRole } = await import("@/repositories/integrationsRefresh");
    const due = await listRefreshDueServiceRole({
      dueBeforeIso: new Date(Date.now() + 30 * 60_000).toISOString(),
      limit: 500,
    });
    expect(due.map((r) => r.id)).not.toContain(id);
  });

  it("reactive path: action 401s on expired token → refresh → retry succeeds (workflow keeps running)", async () => {
    await seedGmailRow("smoke-4@chainreact.test", EXPIRY_FIXTURE_2);
    mockMode = "refresh_no_rotation";

    const { refreshAndRetry, Unauthorized401Error } = await import(
      "@/services/oauth/refreshAndRetry"
    );

    // The "provider API" (mocked at the HTTP boundary conceptually): rejects
    // the stale token with 401, succeeds with the refreshed one.
    const apiCall = jest.fn(async (accessToken: string) => {
      if (accessToken === FAKE_STALE_ACCESS) throw new Unauthorized401Error();
      return { sent: true, with: accessToken };
    });

    const result = await refreshAndRetry({
      accountId,
      provider: "gmail",
      providerAccountId: "smoke-4@chainreact.test",
      apiCall,
    });

    expect(result).toEqual({ sent: true, with: FAKE_NEW_ACCESS });
    expect(apiCall).toHaveBeenCalledTimes(2);

    const id = integrationIds[integrationIds.length - 1]!;
    const row = await readRow(id);
    expect(decryptToken(row.access_token_encrypted)).toBe(FAKE_NEW_ACCESS);
    expect(row.needs_reconnect_at).toBeNull(); // success never marks reconnect
  });
});
