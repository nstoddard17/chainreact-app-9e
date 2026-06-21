/**
 * @jest-environment node
 *
 * Hermes guidance UI — boundary/safety guards (HERMES-AGENT-GUIDANCE-UI).
 * Proves the browser surface (panel + client helper + builder rail) talks ONLY to the ChainReact
 * route and never to the Render gateway / a model vendor / Nous / the private Hermes Agent, holds no
 * token, and touches no workflow-mutation API. Static source scan.
 *
 * Builder entry path (CHAINREACT-AI-SURFACE-STRUCTURE-LOCKS): the legacy floating
 * `BuilderGuidanceEntry` was deleted in the Hermes legacy-retirement arc. The visible builder AI is
 * now the left rail: BuilderGuidanceRail → WorkflowGuidancePanel → requestWorkflowGuidance →
 * POST /api/accounts/[id]/ai/workflow-guidance.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const PANEL = resolve(process.cwd(), "features/workflows/WorkflowGuidancePanel.tsx");
const HELPER = resolve(process.cwd(), "lib/api/ai/guidance.ts");
const BUILDER_RAIL = resolve(
  process.cwd(),
  "features/workflow-builder/panels/BuilderGuidanceRail.tsx",
);
const PREVIEW_OVERLAY = resolve(
  process.cwd(),
  "features/workflow-builder/canvas/BuilderPreviewOverlay.tsx",
);
const PREVIEW_SETUP_CARD = resolve(
  process.cwd(),
  "features/workflow-builder/panels/BuilderPreviewSetupCard.tsx",
);
const NODE_SETUP_CARD = resolve(
  process.cwd(),
  "features/workflow-builder/panels/BuilderNodeSetupCard.tsx",
);
const SETUP_FIELD_CONTROLS = resolve(
  process.cwd(),
  "features/workflow-builder/panels/builderSetupFieldControls.tsx",
);
const SINGLE_SHOT_PANEL = resolve(process.cwd(), "features/workflows/SingleShotGuidancePanel.tsx");
const WORKFLOWS_DASHBOARD_PAGE = resolve(process.cwd(), "app/workflows/page.tsx");

/**
 * Read source with comments stripped, so the scan asserts on actual CODE — not the explanatory
 * doc comments (which legitimately NAME the gateway / token / deprecated endpoints to document that
 * the surface deliberately avoids them).
 */
function readCode(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "") // block comments
    .replace(/([^:])\/\/.*$/gm, "$1") // trailing line comments (keep `://` in URLs)
    .replace(/^\s*\/\/.*$/gm, ""); // full-line comments
}

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

  it("the extracted single-shot panel calls only the helper, makes no direct fetch, and touches no mutation/gateway/vendor", () => {
    // BUILDER-AGENT-RAIL-WIRING-EXTRACT — the dashboard single-shot form moved out of WorkflowGuidancePanel;
    // it must keep the same governed-only boundary (helper, never gateway/vendor/token/mutation).
    const src = readFileSync(SINGLE_SHOT_PANEL, "utf8");
    expect(src).toContain("requestWorkflowGuidance");
    for (const pat of [
      /\bfetch\s*\(/,
      /onrender\.com|\/api\/hermes-agent\/guidance|hermesAgentGatewayClient/,
      /nousresearch|api\.openai\.com/i,
      /CHAINREACT_AI_GATEWAY_TOKEN|OPENAI_API_KEY|API_SERVER_KEY/,
      /updateWorkflow|saveDraftDefinition|applyWorkflowPatch|createWorkflow|deleteWorkflow|runWorkflow|\/run-now/,
    ]) {
      expect({ pat: String(pat), matched: pat.test(src) }).toEqual({ pat: String(pat), matched: false });
    }
  });

  it("the builder rail reuses the panel, makes no direct request, and imports no removed helper / gateway client / vendor", () => {
    // Scan CODE (comments stripped): the rail's doc comment legitimately names the gateway/token to
    // document that it avoids them. The rail delegates ALL request logic to WorkflowGuidancePanel —
    // BuilderGuidanceRail → WorkflowGuidancePanel → requestWorkflowGuidance → account route.
    const src = readCode(BUILDER_RAIL);
    expect(src).toContain("WorkflowGuidancePanel");
    for (const pat of [
      /\bfetch\s*\(/, // no direct fetch from the rail
      /requestWorkflowGuidance/, // the panel owns the request, not the rail
      // removed legacy builder-AI client helpers must never come back to the rail
      /useBuilderAi\b|useBuilderAiActions|useBuilderDiagnosisActions|useChatFill|planWorkflow|completePlan/,
      // server-only Hermes gateway client must never be imported into the browser rail
      /hermesAgentGatewayClient|ai-guidance\/gateway/,
      /onrender\.com|\/api\/hermes-agent\/guidance/,
      /nousresearch|api\.openai\.com/i,
      /CHAINREACT_AI_GATEWAY_TOKEN|OPENAI_API_KEY|API_SERVER_KEY/,
      // workflow mutation / execution from this advisory rail
      /updateWorkflow|saveDraftDefinition|applyWorkflowPatch|createWorkflow|deleteWorkflow|runWorkflow|\/run-now/,
    ]) {
      expect({ pat: String(pat), matched: pat.test(src) }).toEqual({ pat: String(pat), matched: false });
    }
  });

  it("the builder preview overlay is presentational — no store mutation, fetch, mutation API, or vendor", () => {
    const src = readFileSync(PREVIEW_OVERLAY, "utf8");
    for (const pat of [
      /\bfetch\s*\(/, // no network from the overlay
      /useGraphSlice|graphSlice|configSlice|runSlice|\.getState\(\)/, // no builder-store access/mutation
      /draftDefinition|saveDraft|updateWorkflow|applyWorkflowPatch|createWorkflow|deleteWorkflow|runWorkflow|\/run-now/, // no persistence/mutation
      /onrender\.com|\/api\/hermes-agent\/guidance|hermesAgentGatewayClient/,
      /nousresearch|api\.openai\.com/i,
      /CHAINREACT_AI_GATEWAY_TOKEN|OPENAI_API_KEY|API_SERVER_KEY/,
    ]) {
      expect({ pat: String(pat), matched: pat.test(src) }).toEqual({ pat: String(pat), matched: false });
    }
  });

  it("the /workflows dashboard is NOT an AI composer surface — it does not mount WorkflowGuidancePanel (HERMES-AGENT-…-DASHBOARD-CLEANUP)", () => {
    // The dashboard "Build with me" card was removed; the single AI build surface is the builder rail.
    const src = readCode(WORKFLOWS_DASHBOARD_PAGE);
    expect(src).not.toMatch(/WorkflowGuidancePanel/);
    expect(src).not.toMatch(/isHermesAgentEnabled/);
    // The builder rail STILL renders the panel (the panel itself is not deleted).
    expect(readCode(BUILDER_RAIL)).toContain("WorkflowGuidancePanel");
  });

  it("the rail guided-setup card is presentational — no fetch, no store/mutation API, no Hermes/vendor (recipient values never leave the client until Apply)", () => {
    // HERMES-AGENT-GUIDED-PREVIEW-SETUP-RAIL-UX — the setup card collects setup values (incl.
    // recipient-class) into ephemeral preview state via callbacks. It must NEVER call a model/route or
    // touch a store: filling it (or a recipient field) is never sent to Hermes / a prompt / audit text.
    // Scan CODE (comments stripped) — the card's doc comment legitimately names configSlice/DB/Hermes
    // to document that it avoids them.
    const src = readCode(PREVIEW_SETUP_CARD);
    for (const pat of [
      /\bfetch\s*\(/, // no network from the card
      /requestWorkflowGuidance|requestAccountWorkflowRepair/, // never calls a guidance/model route
      /useGraphSlice|graphSlice|configSlice|runSlice|\.getState\(\)/, // no builder-store access/mutation
      /draftDefinition|saveDraft|updateWorkflow|applyWorkflowPatch|createWorkflow|deleteWorkflow|runWorkflow|\/run-now/, // no persistence/mutation
      /onrender\.com|\/api\/hermes-agent\/guidance|hermesAgentGatewayClient/,
      /nousresearch|api\.openai\.com/i,
      /CHAINREACT_AI_GATEWAY_TOKEN|OPENAI_API_KEY|API_SERVER_KEY/,
    ]) {
      expect({ pat: String(pat), matched: pat.test(src) }).toEqual({ pat: String(pat), matched: false });
    }
  });

  it("the existing-node setup card + shared controls are presentational — no fetch, no store/mutation API, no Hermes/vendor (BUILDER-AGENT-RAIL-EXISTING-NODE-SETUP)", () => {
    // The card collects setup values into local state and applies them ONLY via the onUpdateStep
    // callback (the builder owns the graph-slice write). It must never call a model/route or touch a
    // store; async options load via useOptionsSource (the existing resolver), never Hermes. Scan CODE
    // (comments stripped) — doc comments legitimately name the resolver/store to document avoidance.
    for (const path of [NODE_SETUP_CARD, SETUP_FIELD_CONTROLS]) {
      const src = readCode(path);
      for (const pat of [
        /\bfetch\s*\(/, // no direct network from the card/controls
        /requestWorkflowGuidance|requestAccountWorkflowRepair/, // never a guidance/model route
        /useGraphSlice|graphSlice|configSlice|runSlice|\.getState\(\)/, // no builder-store access/mutation
        /draftDefinition|saveDraft|updateWorkflow|applyWorkflowPatch|createWorkflow|deleteWorkflow|runWorkflow|\/run-now/, // no persistence/mutation
        /onrender\.com|\/api\/hermes-agent\/guidance|hermesAgentGatewayClient/,
        /nousresearch|api\.openai\.com/i,
        /CHAINREACT_AI_GATEWAY_TOKEN|OPENAI_API_KEY|API_SERVER_KEY/,
      ]) {
        expect({ path, pat: String(pat), matched: pat.test(src) }).toEqual({ path, pat: String(pat), matched: false });
      }
    }
  });
});
