/**
 * @jest-environment node
 *
 * Hermes guidance UI — boundary/safety guards (HERMES-AGENT-GUIDANCE-UI).
 * Proves the browser surface (panel + client helper) talks ONLY to the ChainReact route and never
 * to the Render gateway / a model vendor / Nous / the private Hermes Agent, holds no token, and
 * touches no workflow-mutation API. Static source scan.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const PANEL = resolve(process.cwd(), "features/workflows/WorkflowGuidancePanel.tsx");
const HELPER = resolve(process.cwd(), "lib/api/ai/guidance.ts");

describe("guidance UI — calls only the ChainReact route, no forbidden surface", () => {
  it("the client helper targets only the account guidance route", () => {
    const src = readFileSync(HELPER, "utf8");
    expect(src).toContain("/api/accounts/");
    expect(src).toContain("/ai/workflow-guidance");
    // Never the gateway / vendor / private Hermes / gateway path / token.
    for (const pat of [
      /onrender\.com/,
      /\/api\/hermes-agent\/guidance/, // the gateway endpoint (server-only)
      /hermesAgentGatewayClient/,
      /CHAINREACT_AI_GATEWAY_TOKEN/,
      /nousresearch|api\.openai\.com/i,
    ]) {
      expect({ pat: String(pat), matched: pat.test(src) }).toEqual({ pat: String(pat), matched: false });
    }
  });

  it("the panel calls the helper, makes no direct fetch, and touches no mutation/gateway/vendor", () => {
    const src = readFileSync(PANEL, "utf8");
    expect(src).toContain("requestWorkflowGuidance");
    for (const pat of [
      /\bfetch\s*\(/, // no direct fetch from the component
      /onrender\.com|\/api\/hermes-agent\/guidance|hermesAgentGatewayClient/,
      /nousresearch|api\.openai\.com/i,
      /CHAINREACT_AI_GATEWAY_TOKEN|OPENAI_API_KEY|API_SERVER_KEY/,
      // workflow mutation / execution from this advisory panel
      /updateWorkflow|saveDraftDefinition|applyWorkflowPatch|createWorkflow|deleteWorkflow|runWorkflow|\/run-now/,
    ]) {
      expect({ pat: String(pat), matched: pat.test(src) }).toEqual({ pat: String(pat), matched: false });
    }
  });
});
