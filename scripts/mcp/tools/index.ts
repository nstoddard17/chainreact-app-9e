/**
 * Internal MCP server — tool wiring.
 *
 * The single place that assembles the registry. Every exposed tool is listed
 * here explicitly; there is no dynamic discovery.
 */
import { ToolRegistry } from "../registry";
import { builderGapsTools } from "./builderGaps";
import { commandTools } from "./commands";
import { diagnosisTools } from "./diagnose";
import { diagnoseLiveTools } from "./diagnoseLive";
import { diagnoseWorkflowTools } from "./diagnoseWorkflow";
import { docsTools } from "./docs";
import { doctorTools } from "./doctors";
import { noLeakScannerTools } from "./noLeakScanner";
import { providerTools } from "./providers";
import { repoNavTools } from "./repoNav";
import { smokeTools } from "./smoke";
import { testRunnerTools } from "./testRunners";
import { verifyTools } from "./verify";

/** Build a registry with every internal MCP tool registered. */
export function buildRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  for (const tool of docsTools) registry.register(tool);
  for (const tool of providerTools) registry.register(tool);
  for (const tool of builderGapsTools()) registry.register(tool);
  for (const tool of commandTools) registry.register(tool);
  // Stage 2A diagnostics (CS-1 smoke artifact tools + CS-2 static option-source
  // / connection-requirements tools). Local-artifact + repo-static only.
  for (const tool of smokeTools) registry.register(tool);
  for (const tool of diagnosisTools) registry.register(tool);
  // Stage 2B-1 — the single LIVE (Plane-B) tool. It is a `fetch` client onto the
  // app's internal diagnostics route; the MCP process stays DB-free + import-fenced.
  for (const tool of diagnoseLiveTools) registry.register(tool);
  // Stage 2B-3 CS-1 — live workflow-readiness tool (same `fetch`-client posture).
  for (const tool of diagnoseWorkflowTools) registry.register(tool);
  // Phase A-1 — read-only developer-orientation helpers (repo navigation +
  // verification advisory). Static/local; no live data, no mutation.
  for (const tool of repoNavTools) registry.register(tool);
  for (const tool of verifyTools) registry.register(tool);
  // Phase B — bounded local jest runners (run_jest_for_path + fixed structure
  // wrappers). Local/read-only; validated argv; no shell passthrough.
  for (const tool of testRunnerTools) registry.register(tool);
  // Phase C-1 — no-leak scanner (pure local dev aid; not a runtime gate). The
  // live diagnose_workflow_graph tool registers via diagnoseWorkflowTools above.
  for (const tool of noLeakScannerTools) registry.register(tool);
  // Phase C-2 — composite doctors. They COMPOSE the gated routes (via
  // postDiagnostic) + the static providerStatics brain; no new route, no new
  // brain, no DB access in scripts/mcp.
  for (const tool of doctorTools) registry.register(tool);
  return registry;
}
