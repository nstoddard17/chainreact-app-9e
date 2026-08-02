/**
 * Structure invariant: every MUTATING route under `app/api/` proves an auth
 * gate, and no route reaches for a service-role client unless it is cron-authed.
 *
 * Per docs/rules/database-security.md + account-ownership-model.md: RLS is the
 * primary control, but a mutating route that (a) skips its auth/authorization
 * gate or (b) grabs a service-role client (which BYPASSES RLS) can silently
 * defeat every DB-level guardrail. This sweep makes both classes a build
 * failure so a new route can't regress them.
 *
 * This is the LOCALLY-PROVABLE structural half of API authorization. It does
 * NOT replace per-route behavior tests (302 exist) — it's the regression net
 * that proves a recognized gate is PRESENT. Two checks:
 *
 *   A. Service-role confinement — a route referencing the service-role client
 *      (or its env var) must also be cron-authenticated (`requireCronAuth`).
 *      Today only the 4 purge/release cron routes qualify; a user-facing route
 *      grabbing service-role would fail here.
 *
 *   B. Mutating-route auth presence — any route exporting POST/PATCH/PUT/DELETE
 *      must reference at least one recognized auth/authorization/verification
 *      mechanism, or be ALLOW-LISTED with a reason. Recognized mechanisms cover
 *      session gates, account-role gates, the workflow-caller resolver, API-key
 *      verification, cron auth, OAuth state consumption, inline session reads,
 *      and webhook signature/challenge verification.
 *
 * Allow-lists are deliberately tiny + documented. Comments are stripped before
 * token scanning so a mention in prose can't satisfy the guard.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const API_DIR = join(ROOT, "app", "api");

function collectRouteFiles(dir: string): string[] {
  const out: string[] = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectRouteFiles(full));
    else if (entry.name === "route.ts") out.push(full);
  }
  return out;
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

const rel = (f: string) => f.slice(ROOT.length + 1).replace(/\\/g, "/");

const ROUTES = (() => {
  try {
    statSync(API_DIR);
  } catch {
    return [];
  }
  return collectRouteFiles(API_DIR);
})();

const MUTATING_EXPORT_RE =
  /export\s+(?:async\s+)?(?:function|const)\s+(POST|PATCH|PUT|DELETE)\b|export\s*\{[^}]*\b(POST|PATCH|PUT|DELETE)\b/;

const SERVICE_ROLE_RE =
  /getServiceRoleClient|createServiceClient|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY/;

/**
 * Recognized auth / authorization / verification tokens. A mutating route must
 * reference at least one. Kept broad on purpose — the guard proves a gate is
 * PRESENT; the per-route tests prove it's CORRECT.
 */
const AUTH_TOKENS: RegExp[] = [
  /\brequireUser\b/,
  /\brequireMobileUser\b/, // mobile v1 bearer gate (app/api/mobile/v1/_shared)
  /\brequireUserWithAccount\b/, // session + active-account resolver (workflows/folders/ai)
  /\brequireAuthedUserId\b/, // session uid resolver (account/profile, accounts, templates)
  /\brequireAccount\b/, // analytics: auth.getUser() + resolveActiveAccount (app/api/analytics/_shared)
  /\brequireDashboardAuthor\b/, // analytics dashboards: author-role gate on the owning account
  /\brequireAccountRole\b/, // account-role gate (services/accounts/accountAuthz)
  /\brequireAuth\b/,
  /\brequireAccountRole\b/,
  /\brequireAdmin\b/,
  /\brequireCronAuth\b/,
  /\brequireOwnPersonalAccount\b/,
  /\brequireWorkflowAccountMember\b/,
  /\brequireMembership\b/,
  /\bresolveCaller\b/, // credential-owner shared resolver (auth+membership+role)
  /\bverifyApiKey\b/, // public API-key routes
  /\bconsumeState\b/, // OAuth callback (signed state token IS the auth)
  /\bapplyDiagnosticsGate\b/, // internal diagnostics machine-bearer gate (DIAGNOSTICS_API_TOKEN)
  /auth\.getUser\b/, // inline SSR session read (oauth connect/ingest)
  /[Ss]ignature/, // webhook HMAC/signature verification
  /verify(?:Facebook)?Challenge/, // webhook subscription challenge handshakes
];

/**
 * Mutating routes that legitimately have NO authorization gate, each with a
 * reason. Keep this list TINY. Paths are repo-relative with forward slashes.
 *
 * The Microsoft Graph `lifecycle` endpoints are write-free stubs: they echo the
 * `?validationToken` subscription handshake and otherwise log + 200 so Graph
 * doesn't retry-storm (Slice 6 stubs; real reauthorization handling is a later
 * slice). They perform NO mutation, so there is nothing to authorize. When they
 * gain real side effects they must add clientState/subscription verification and
 * come off this list.
 */
const MUTATION_AUTH_ALLOWLIST: ReadonlyArray<{ path: string; reason: string }> = [
  { path: "app/api/webhooks/microsoft-onedrive/lifecycle/route.ts", reason: "MS Graph lifecycle: validationToken handshake + log-only stub, no mutation" },
  { path: "app/api/webhooks/microsoft-outlook/lifecycle/route.ts", reason: "MS Graph lifecycle: validationToken handshake + log-only stub, no mutation" },
  { path: "app/api/webhooks/microsoft-outlook-calendar/lifecycle/route.ts", reason: "MS Graph lifecycle: validationToken handshake + log-only stub, no mutation" },
  { path: "app/api/webhooks/microsoft-teams/lifecycle/route.ts", reason: "MS Graph lifecycle: validationToken handshake + log-only stub, no mutation" },
  // Mailchimp does NOT sign its webhooks (no HMAC). Authentication relies on URL
  // secrecy (per-workflow workflowId/nodeId in the path), audienceId match, an
  // event-type allow-list, and sha256(rawBody) dedup — documented in the route.
  // There is no signature token to recognize; this is the accepted provider
  // limitation, not a missing gate.
  { path: "app/api/webhooks/mailchimp/route.ts", reason: "Mailchimp does not sign webhooks; auth = URL secrecy + audienceId match + event-type allow-list + dedup" },
  // REACT-LIVE-SKELETON-3 — limited anonymous AI planning for logged-out /start visitors.
  // Intentionally PUBLIC (no auth): planning-ONLY. It performs NO workflow mutation, NO DB read/write,
  // NO provider call, NO service-role, touches NO account/session/private context, and never
  // creates/saves/connects/runs anything — it returns advisory text + a non-applied preview from a
  // VALIDATED plan. Abuse is bounded by a signed HttpOnly per-browser cap + a per-instance IP/day soft
  // cap (lib/anonAiLimit); input is size-bounded. Nothing to authorize.
  { path: "app/api/ai/anonymous-workflow-guidance/route.ts", reason: "Public anonymous AI planning: no mutation, no DB, no provider, no account; planning-only, signed-cookie + IP capped, size bounded" },
];

/** Routes allowed to use a service-role client WITHOUT being cron-authed. Empty
 *  today — every service-role route is a cron job. A future signed-webhook that
 *  must write via service-role after signature verify would be added here. */
const SERVICE_ROLE_ALLOWLIST: ReadonlyArray<{ path: string; reason: string }> = [];

const allowlistedMutation = new Set(MUTATION_AUTH_ALLOWLIST.map((e) => e.path));
const allowlistedServiceRole = new Set(SERVICE_ROLE_ALLOWLIST.map((e) => e.path));

describe("app/api route authorization — structural guards", () => {
  it("discovers route files to scan (guard is not silently empty)", () => {
    expect(ROUTES.length).toBeGreaterThan(80);
  });

  // ── Check A: service-role client only in cron-authed routes ──
  it("a route using a service-role client is cron-authenticated (or allow-listed)", () => {
    const offenders: string[] = [];
    for (const file of ROUTES) {
      const code = stripComments(readFileSync(file, "utf8"));
      if (!SERVICE_ROLE_RE.test(code)) continue;
      const r = rel(file);
      if (allowlistedServiceRole.has(r)) continue;
      if (!/\brequireCronAuth\b/.test(code)) {
        offenders.push(
          `${r} — uses a service-role client but is not cron-authed and not allow-listed (RLS bypass risk)`,
        );
      }
    }
    expect(offenders).toEqual([]);
  });

  // ── Check B: every mutating route references a recognized auth gate ──
  it("every mutating route (POST/PATCH/PUT/DELETE) references a recognized auth gate (or is allow-listed)", () => {
    const offenders: string[] = [];
    let mutatingCount = 0;
    for (const file of ROUTES) {
      const raw = readFileSync(file, "utf8");
      const code = stripComments(raw);
      if (!MUTATING_EXPORT_RE.test(code)) continue;
      mutatingCount += 1;
      const r = rel(file);
      if (allowlistedMutation.has(r)) continue;
      const hasGate = AUTH_TOKENS.some((re) => re.test(code));
      if (!hasGate) {
        offenders.push(`${r} — mutating route with no recognized auth gate`);
      }
    }
    // Sanity: the audit found 84 mutating routes; guard must actually be seeing them.
    expect(mutatingCount).toBeGreaterThan(75);
    expect(offenders).toEqual([]);
  });

  it("every allow-list entry still exists and still applies (no stale entries)", () => {
    for (const entry of [...MUTATION_AUTH_ALLOWLIST, ...SERVICE_ROLE_ALLOWLIST]) {
      const full = join(ROOT, entry.path);
      expect(statSync(full).isFile()).toBe(true);
      expect(entry.reason.length).toBeGreaterThan(10);
    }
    // The mutation allow-list is for write-free stubs only — if one ever gains a
    // recognized gate, drop it from the list (this keeps the list from rotting).
    for (const entry of MUTATION_AUTH_ALLOWLIST) {
      const code = stripComments(readFileSync(join(ROOT, entry.path), "utf8"));
      const hasGate = AUTH_TOKENS.some((re) => re.test(code));
      expect(hasGate).toBe(false); // still genuinely gate-less → still needs the allow-list
    }
  });
});
