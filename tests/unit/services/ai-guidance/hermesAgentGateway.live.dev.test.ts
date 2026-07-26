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
  requestHermesAgentGuidanceNormalized,
  type GatewayFetch,
  type GatewayHttpResponse,
} from "@/services/ai-guidance/gateway/hermesAgentGatewayClient";
import {
  getHermesAgentGatewayConfig,
  HERMES_AGENT_REQUIRED_VARS,
  DEFAULT_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
} from "@/services/ai-guidance/gateway/gatewayConfig";
import { buildCapabilityCatalogKeys } from "@/services/ai-guidance/capabilityCatalog";
import { buildFieldSchemaLines, selectRelevantProviders } from "@/services/ai-guidance/promptFieldSchemas";
import type { WorkflowGuidanceRequest } from "@/contracts/aiGuidance";
import type { EditableWorkflowGraph } from "@/contracts/editableWorkflowGraph";

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
      const res = await requestHermesAgentGuidanceNormalized({ request: REQUEST, config: cfg, goalText: FAKE_PROMPT, fetchImpl: spyFetch });
      const elapsedMs = Date.now() - startedAt;

      // --- ChainReact CLIENT contract (always true): correct URL, method, auth header in the
      // header only, token never in the body. This proves the Vercel→gateway leg + secret discipline.
      expect(capturedUrl).toBe(`${cfg.gatewayUrl.replace(/\/$/, "")}/api/hermes-agent/guidance`);
      expect(capturedInit?.method).toBe("POST");
      expect(capturedInit?.headers.authorization).toBe(`Bearer ${cfg.gatewayToken}`);
      expect(capturedInit?.body ?? "").not.toContain(cfg.gatewayToken);

      // --- Normalized result must always be well-formed, mapped to the ACTUAL gateway state:
      //   gateway healthy (HTTP 2xx) → ok with NON-EMPTY guidanceText, source "hermes-agent";
      //   gateway/agent erroring     → typed error (the client must NOT invent guidance).
      if (capturedStatus >= 200 && capturedStatus < 300 && res.ok) {
        expect(res.source).toBe("hermes-agent");
        expect(res.guidanceText.trim().length).toBeGreaterThan(0);
        expect(res.workflowPlan).toBeNull();
        console.log(`[HERMES-AGENT-GATEWAY-SMOKE] OK end-to-end — guidanceChars=${res.guidanceText.length} elapsedMs=${elapsedMs}`);
      } else {
        expect(res.ok).toBe(false);
        if (!res.ok) expect(["PROVIDER_ERROR", "INVALID_RESPONSE", "TIMEOUT"]).toContain(res.code);
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

  /**
   * REACT-AGENT-PRODUCTION-TIMEOUT-1 — the LATENCY case (the one the first smoke could not see).
   *
   * The original smoke sends a tiny prose prompt and answers in ~3.5s, which is why a healthy smoke
   * coexisted with a production failure: the request that actually broke was a builder EDIT turn,
   * whose prompt carries the full capability catalog + narrowed field schemas + the editable graph
   * (measured ~45 KB / ~11k tokens versus ~25 KB / ~6k for a first turn). This case reproduces THAT
   * shape and reports the real round-trip so the configured budget can be judged against evidence
   * instead of a guess.
   *
   * It deliberately runs with the MAXIMUM allowed client deadline, not the configured one — the point
   * is to MEASURE how long the brain takes, not to re-observe the abort. A run that reports an elapsed
   * time near or above `DEFAULT_TIMEOUT_MS` means production turns are still at risk and the budget
   * (or the prompt size) needs another look; that verdict is printed, not asserted, because gateway
   * latency is not deterministic enough to gate a build on.
   *
   * NOTE: this makes a SECOND paid live call per smoke run.
   */
  it(
    "measures real round-trip latency for a full-size EDIT-shaped prompt (budget evidence)",
    async () => {
      const cfg = getHermesAgentGatewayConfig();
      expect(cfg).not.toBeNull();
      if (!cfg) return;

      const catalog = buildCapabilityCatalogKeys();
      const goal = "Also email the customer a receipt when the invoice is paid, and log it in Notion.";
      const fieldSchemaLines = buildFieldSchemaLines(
        selectRelevantProviders({ texts: [goal], connectedProviders: ["slack", "stripe", "gmail", "notion"] }),
      );
      const editableGraph: EditableWorkflowGraph = {
        schemaVersion: 1,
        version: "live-smoke-version",
        nodeCount: 2,
        edgeCount: 1,
        nodes: [
          {
            ref: "node_1",
            role: "trigger",
            kind: "trigger",
            provider: "stripe",
            type: "invoice_paid",
            capabilityKey: "stripe:invoice_paid",
            config: [],
          },
          {
            ref: "node_2",
            role: "action",
            kind: "action",
            provider: "slack",
            type: "send_channel_message",
            capabilityKey: "slack:send_channel_message",
            config: [],
          },
        ],
        edges: [{ ref: "edge_1", fromRef: "node_1", toRef: "node_2" }],
      };

      // Measure with the ceiling deadline so the true latency is observable even when it exceeds the
      // configured default. This never widens production behavior — it is a local, opt-in measurement.
      const measuringConfig = { ...cfg, timeoutMs: MAX_TIMEOUT_MS };

      const startedAt = Date.now();
      const res = await requestHermesAgentGuidanceNormalized({
        request: REQUEST,
        config: measuringConfig,
        goalText: goal,
        capabilityCatalog: catalog,
        fieldSchemaLines,
        editableGraph,
      });
      const elapsedMs = Date.now() - startedAt;

      const verdict =
        !res.ok && res.code === "TIMEOUT"
          ? `OVER BUDGET — exceeded even the ${MAX_TIMEOUT_MS}ms ceiling`
          : elapsedMs >= DEFAULT_TIMEOUT_MS
            ? `AT RISK — slower than the ${DEFAULT_TIMEOUT_MS}ms default`
            : "WITHIN BUDGET";
      console.log(
        `[HERMES-AGENT-GATEWAY-SMOKE] EDIT-shaped latency — elapsedMs=${elapsedMs} ` +
          `catalogKeys=${catalog.length} fieldSchemaLines=${fieldSchemaLines.length} ` +
          `defaultBudgetMs=${DEFAULT_TIMEOUT_MS} ceilingMs=${MAX_TIMEOUT_MS} result=${res.ok ? "ok" : res.code} ` +
          `→ ${verdict}`,
      );

      // Contract only: the client must return a well-formed normalized result either way, and must
      // never invent guidance when the brain failed.
      if (res.ok) expect(res.guidanceText.trim().length).toBeGreaterThan(0);
      else expect(["PROVIDER_ERROR", "INVALID_RESPONSE", "TIMEOUT"]).toContain(res.code);
    },
    120_000,
  );
});
