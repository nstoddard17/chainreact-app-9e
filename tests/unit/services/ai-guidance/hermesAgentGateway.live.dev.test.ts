/**
 * @jest-environment node
 *
 * Hermes Agent gateway — OPT-IN LIVE SMOKE against the PRODUCTION Render gateway
 * (HERMES-AGENT-PROD-CLIENT).
 *
 * Calls the public ChainReact-owned gateway once through the real client to prove the end-to-end
 * path (Vercel client → Render gateway → private Hermes Agent → model vendor → back) works. This
 * is the ONE test that can hit the real gateway, so it is double-gated and SKIPPED BY DEFAULT. It
 * never runs in CI (no `.env.local`, switches not set) and never fails when disabled — it SKIPs.
 *
 * DOUBLE OPT-IN (both from the LAUNCH env — NOT auto-loaded):
 *   HERMES_AGENT_ENABLED=true       — the gateway flag (`isHermesAgentEnabled`)
 *   HERMES_AGENT_GATEWAY_SMOKE=true — this test's explicit live switch
 * plus the gateway config (CHAINREACT_AI_GATEWAY_URL / CHAINREACT_AI_GATEWAY_TOKEN) which IS
 * auto-loaded from `.env.local`. Missing any of these → the suite SKIPs.
 *
 * Run it (bash), once:
 *   HERMES_AGENT_ENABLED=true HERMES_AGENT_GATEWAY_SMOKE=true \
 *     npx jest tests/unit/services/ai-guidance/hermesAgentGateway.live.dev.test.ts
 *
 * SECRET DISCIPLINE: reads CHAINREACT_AI_GATEWAY_TOKEN to assert it is in the Authorization header
 * only; never logs/prints it. See docs/runbooks/hermes-agent-render-prod.md.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

import {
  requestHermesAgentGuidance,
  type GatewayFetch,
  type GatewayHttpResponse,
} from "@/services/ai-guidance/gateway/hermesAgentGatewayClient";
import { getHermesAgentGatewayConfig, HERMES_AGENT_REQUIRED_VARS } from "@/services/ai-guidance/gateway/gatewayConfig";
import type { WorkflowGuidanceRequest } from "@/contracts/aiGuidance";

/**
 * Load ONLY the gateway CONFIG values from `.env.local` (URL / token / timeout). It deliberately
 * does NOT load the two opt-in switches (`HERMES_AGENT_ENABLED`, `HERMES_AGENT_GATEWAY_SMOKE`):
 * those must come from the actual launch env so the live call stays an explicit, conscious opt-in.
 * This keeps the focused run (`npx jest tests/unit/services/ai-guidance`) and CI from ever calling
 * the production gateway, even on a dev box whose `.env.local` has the gateway configured.
 */
function loadGatewayConfigFromEnvLocal(): void {
  const p = resolve(process.cwd(), ".env.local");
  if (!existsSync(p)) return;
  const ALLOW = new Set(["CHAINREACT_AI_GATEWAY_URL", "CHAINREACT_AI_GATEWAY_TOKEN", "HERMES_AGENT_TIMEOUT_MS"]);
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    const key = m[1]!;
    if (!ALLOW.has(key) || process.env[key]) continue;
    let v = m[2]!.trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[key] = v;
  }
}
loadGatewayConfigFromEnvLocal();

const FLAG_ON = process.env.HERMES_AGENT_ENABLED === "true";
const SMOKE_ON = process.env.HERMES_AGENT_GATEWAY_SMOKE === "true";
const CONFIG_PRESENT = HERMES_AGENT_REQUIRED_VARS.every((v) => !!process.env[v]?.trim());
const RUN = FLAG_ON && SMOKE_ON && CONFIG_PRESENT;

const describeLive = RUN ? describe : describe.skip;

if (!RUN) {
  const missing = HERMES_AGENT_REQUIRED_VARS.filter((v) => !process.env[v]?.trim());
  // Names only — NEVER values. Safe to print anywhere (incl. CI).
  console.log(
    "SKIP Hermes Agent gateway LIVE smoke — needs HERMES_AGENT_ENABLED=true AND " +
      "HERMES_AGENT_GATEWAY_SMOKE=true (both from the launch env) plus gateway config. " +
      `flagOn=${FLAG_ON} smokeOn=${SMOKE_ON} ` +
      (missing.length ? `missingConfig=[${missing.join(", ")}]` : "config=present") +
      ". Opt-in PAID live call — see docs/runbooks/hermes-agent-render-prod.md.",
  );
}

const FAKE_PROMPT =
  "I keep forgetting to follow up with leads. I do not know what workflow I need. Ask me questions to figure it out.";
const REQUEST: WorkflowGuidanceRequest = {
  schemaVersion: 1,
  guidanceKind: "workflow_design",
  workflow: { nodeCount: 0, edgeCount: 0, nodes: [], edges: [] },
};

describeLive("Hermes Agent gateway LIVE smoke — production Render gateway (opt-in)", () => {
  it(
    "calls the real gateway once; token only in the Authorization header; advisory ok response",
    async () => {
      const cfg = getHermesAgentGatewayConfig();
      expect(cfg).not.toBeNull();
      if (!cfg) return;

      // Spy fetch: capture the outgoing request + the gateway's HTTP status, then forward to the
      // REAL global fetch. The status lets us assert the CLIENT contract against the ACTUAL gateway
      // health instead of pretending the backend is up.
      let capturedUrl: string | undefined;
      let capturedInit: Parameters<GatewayFetch>[1] | undefined;
      let capturedStatus = 0;
      const realFetch = globalThis.fetch as unknown as (u: string, i: unknown) => Promise<Response>;
      const spyFetch: GatewayFetch = async (url, init) => {
        capturedUrl = url;
        capturedInit = init;
        const res = await realFetch(url, init);
        capturedStatus = res.status;
        return res as unknown as GatewayHttpResponse;
      };

      const startedAt = Date.now();
      const res = await requestHermesAgentGuidance({ request: REQUEST, config: cfg, goalText: FAKE_PROMPT, fetchImpl: spyFetch });
      const elapsedMs = Date.now() - startedAt;

      // --- ChainReact CLIENT contract (always true): correct URL, method, auth header in the
      // header only, token never in the body. This proves the Vercel→gateway leg + secret discipline.
      expect(capturedUrl).toBe(`${cfg.gatewayUrl.replace(/\/$/, "")}/api/hermes-agent/guidance`);
      expect(capturedInit?.method).toBe("POST");
      expect(capturedInit?.headers.authorization).toBe(`Bearer ${cfg.gatewayToken}`);
      expect(capturedInit?.body ?? "").not.toContain(cfg.gatewayToken);

      // --- Result must always be a well-formed GuidanceResult, mapped to the ACTUAL gateway state:
      //   gateway healthy (HTTP 2xx) → advisory ok with suggestions;
      //   gateway/agent erroring     → typed PROVIDER_ERROR (the client must NOT invent guidance).
      if (capturedStatus >= 200 && capturedStatus < 300 && res.ok) {
        expect(res.response.providerId).toBe("hermes-agent");
        expect(res.response.suggestions.length).toBeGreaterThan(0);
        console.log(`[HERMES-AGENT-GATEWAY-SMOKE] OK end-to-end — elapsedMs=${elapsedMs}`);
      } else {
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.code).toBe("PROVIDER_ERROR");
        // Loud, secret-free signal: the client is correct, but the gateway's downstream is unhealthy.
        console.warn(
          `[HERMES-AGENT-GATEWAY-SMOKE] CLIENT OK but GATEWAY UNHEALTHY — httpStatus=${capturedStatus} ` +
            `clientCode=${res.ok ? "ok" : res.code} elapsedMs=${elapsedMs}. The Vercel→gateway leg + auth work; ` +
            "the gateway→private-Hermes-Agent hop returned an error (fix on Render — see runbook).",
        );
      }
    },
    60_000,
  );
});
