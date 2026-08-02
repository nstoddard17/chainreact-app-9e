/**
 * Structure lock for the /api/mobile/v1 namespace
 * (MOBILE-COMPANION-M1-MOBILE-READ-API-1).
 *
 * Every mobile route must flow through the DEDICATED mobile gate — never a
 * web cookie gate, never a repository directly, never the SSR cookie client
 * — and every route must egress-validate via `sendMobileJson`. The gate
 * itself must be structurally cookie-free.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const MOBILE_DIR = join(ROOT, "app", "api", "mobile");

function collectRouteFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectRouteFiles(full));
    else if (entry.name === "route.ts") out.push(full);
  }
  return out;
}

function rel(file: string): string {
  return file.slice(ROOT.length + 1).replace(/\\/g, "/");
}

describe("mobile API boundary", () => {
  it("the namespace exists and has the M1 route inventory (non-vacuous)", () => {
    expect(statSync(MOBILE_DIR).isDirectory()).toBe(true);
    expect(collectRouteFiles(MOBILE_DIR).length).toBeGreaterThanOrEqual(7);
  });

  it("every mobile route uses the dedicated mobile gate and egress validation", () => {
    const offenders: string[] = [];
    for (const file of collectRouteFiles(MOBILE_DIR)) {
      const code = readFileSync(file, "utf8");
      const gated = /\brequireMobileUser\b/.test(code) || /\brequireMobilePublic\b/.test(code);
      if (!gated) offenders.push(`${rel(file)} — no mobile gate`);
      if (!/\bsendMobileJson\b/.test(code)) {
        offenders.push(`${rel(file)} — success path not egress-validated`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("no mobile route bypasses the gate with web gates, repositories, service-role, or the cookie client", () => {
    const banned = [
      { re: /api\/workflows\/_shared/, why: "web cookie gate" },
      { re: /api\/account\/_shared/, why: "web cookie gate" },
      { re: /api\/analytics\/_shared/, why: "web cookie gate" },
      { re: /api\/providers\/_shared/, why: "web cookie gate" },
      { re: /\brequireUser\b(?!WithAccount)/, why: "web gate symbol" },
      { re: /\brequireUserWithAccount\b/, why: "web gate symbol" },
      { re: /@\/repositories\//, why: "route must not touch repositories directly" },
      { re: /@\/utils\/supabase\/server/, why: "cookie client is banned in mobile routes" },
      { re: /getServiceRoleClient/, why: "service-role identity must stay behind the gate/services" },
    ];
    const offenders: string[] = [];
    for (const file of collectRouteFiles(MOBILE_DIR)) {
      const code = readFileSync(file, "utf8");
      for (const { re, why } of banned) {
        if (re.test(code)) offenders.push(`${rel(file)} — ${why}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the mobile gate itself is structurally cookie-free and owns the flag check", () => {
    const gate = readFileSync(join(MOBILE_DIR, "v1", "_shared.ts"), "utf8");
    expect(gate).not.toContain("@/utils/supabase/server");
    expect(gate).not.toContain("next/headers");
    expect(gate).toContain("isMobileApiEnabled");
    // Foreign ChainReact token formats are rejected before Supabase.
    expect(gate).toContain("crk_");
    expect(gate).toContain("crmcp_");
  });

  it("mobile services never import the web SSR cookie client", () => {
    const servicesDir = join(ROOT, "services", "mobile");
    for (const entry of readdirSync(servicesDir)) {
      const code = readFileSync(join(servicesDir, entry), "utf8");
      expect(`${entry}:${code.includes("@/utils/supabase/server")}`).toBe(`${entry}:false`);
    }
  });
});
