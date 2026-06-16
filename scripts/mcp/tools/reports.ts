/**
 * Internal MCP server — Phase 2D report tools.
 *
 *   generate_diagnostic_report        → a safe, copyable Markdown diagnostic
 *                                       report COMPOSED from an existing doctor
 *                                       (doctor_workflow / doctor_provider /
 *                                       doctor_account_integration).
 *   generate_deploy_readiness_report  → an internal pre-push/pre-deploy readiness
 *                                       report COMPOSED from the existing safe
 *                                       local checks + the verification advisor.
 *
 * COMPOSE, NEVER DUPLICATE — and NEVER MUTATE.
 *   - The diagnostic report calls the SAME `compute*` functions the doctor tools
 *     use; it adds no diagnostic brain, opens no route, and reaches no DB. Every
 *     value it renders is already-sanitized (the gated routes sanitize).
 *   - The deploy-readiness report only ever invokes EXISTING safe, read-only
 *     check tools (typecheck / structure-lint / migration-lint / route- &
 *     provider-structure tests / smoke-artifact summary / optional broad lint).
 *     It NEVER pushes, deploys, applies a migration, runs db:push, or triggers a
 *     prod smoke. `advisory` mode runs nothing at all.
 *
 * IMPORT FENCE — LOCAL MCP modules + `node` globals only.
 */
import { commandTools } from "./commands";
import { computeDoctorWorkflow } from "./doctors";
import { computeDoctorAccountIntegration, computeDoctorProvider } from "./doctorsProviders";
import { smokeTools } from "./smoke";
import { testRunnerTools } from "./testRunners";
import { gitChangedFiles, recommendChecksForPaths } from "./verify";
import type { DoctorOutcome } from "../lib/doctorShared";
import {
  type CheckOutcome,
  classifyCheckOutput,
  DEPLOY_NO_ACTION_STATEMENTS,
  type DiagnosticReportOptions,
  type DiagnosticReportType,
  deriveReadiness,
  type ReadinessStatus,
  renderDiagnosticReport,
} from "../lib/reportShared";
import { truncateOutput } from "../security/truncate";
import type { ToolDefinition } from "../registry";

// ───────────────────────── generate_diagnostic_report ─────────────────────────

const VALID_TYPES: readonly DiagnosticReportType[] = ["workflow", "provider", "accountIntegration"];

function readOptions(args: Record<string, unknown>): DiagnosticReportOptions {
  const includeSections = Array.isArray(args.includeSections)
    ? args.includeSections.filter((s): s is string => typeof s === "string")
    : undefined;
  const includeUnavailable = args.includeUnavailable === false ? false : undefined;
  const maxFindings = typeof args.maxFindings === "number" && args.maxFindings > 0 ? Math.floor(args.maxFindings) : undefined;
  return { includeSections, includeUnavailable, maxFindings };
}

async function generateDiagnosticReport(args: Record<string, unknown>): Promise<string> {
  const type = typeof args.type === "string" ? args.type.trim() : "";
  if (!VALID_TYPES.includes(type as DiagnosticReportType)) {
    return "Error: 'type' is required and must be one of: workflow | provider | accountIntegration.";
  }

  let outcome: DoctorOutcome;
  if (type === "workflow") outcome = await computeDoctorWorkflow(args);
  else if (type === "provider") outcome = await computeDoctorProvider(args);
  else outcome = await computeDoctorAccountIntegration(args);

  if (!outcome.ok) return outcome.message; // safe validation error from the doctor

  return renderDiagnosticReport(type as DiagnosticReportType, outcome.title, outcome.result, readOptions(args));
}

// ─────────────────────── generate_deploy_readiness_report ───────────────────────

interface SafeCheckDef {
  /** The EXISTING tool name this check invokes. */
  readonly name: string;
  /** Only run when `includeBroadLint` is set (broad eslint is expensive). */
  readonly broadLint?: boolean;
}

/**
 * The ONLY checks the deploy-readiness report may execute — each maps to an
 * existing, read-only check tool. There is deliberately no typecheck-less or
 * push/deploy/db entry here.
 */
const SAFE_CHECKS: readonly SafeCheckDef[] = [
  { name: "run_typecheck" },
  { name: "run_structure_lint" },
  { name: "run_migration_lint" },
  { name: "run_route_structure_tests" },
  { name: "run_provider_metadata_tests" },
  { name: "summarize_last_test_failure" },
  { name: "run_lint", broadLint: true },
];
const SAFE_CHECK_NAMES: ReadonlySet<string> = new Set(SAFE_CHECKS.map((c) => c.name));

/** Existing sibling tool handlers, indexed by name (read-only check tools only). */
const SIBLING_TOOLS = new Map<string, ToolDefinition>(
  [...commandTools, ...testRunnerTools, ...smokeTools].map((t) => [t.name, t]),
);

/** Default runner — invokes an EXISTING allow-listed safe check tool handler. */
async function defaultRunCheck(toolName: string): Promise<string> {
  if (!SAFE_CHECK_NAMES.has(toolName)) {
    return `Error: '${toolName}' is not an allow-listed safe check (deploy-readiness refuses it).`;
  }
  const tool = SIBLING_TOOLS.get(toolName);
  if (!tool) return `Error: safe check '${toolName}' is not registered.`;
  return await tool.handler({});
}

export interface DeployReadinessDeps {
  /** Invoke an allow-listed safe check by tool name; returns its (redacted) output. */
  readonly runCheck: (toolName: string) => Promise<string>;
  /** Read changed files (read-only git) when `changedPaths` is not provided. */
  readonly getChangedFiles: () => { files: string[]; source: string };
}

const DEFAULT_DEPS: DeployReadinessDeps = {
  runCheck: defaultRunCheck,
  getChangedFiles: () => {
    const { files, note } = gitChangedFiles();
    return { files, source: note ? `git (${note})` : "git diff vs HEAD + untracked" };
  },
};

/**
 * Core deploy-readiness builder. `deps` are injected so tests can stub execution
 * (and assert that advisory mode runs NOTHING and runSafeChecks runs only the
 * allow-listed tools). Exported for tests.
 */
export async function buildDeployReadinessReport(
  args: Record<string, unknown>,
  deps: DeployReadinessDeps = DEFAULT_DEPS,
): Promise<string> {
  const mode: "advisory" | "runSafeChecks" = args.mode === "runSafeChecks" ? "runSafeChecks" : "advisory";
  const includeMcpSmoke = args.includeMcpSmoke === true;
  const includeBroadLint = args.includeBroadLint === true;
  const maxOutput = typeof args.maxOutput === "number" && args.maxOutput > 0 ? Math.floor(args.maxOutput) : undefined;

  // Changed files (provided list or read-only git).
  let files: string[];
  let changedSource: string;
  if (Array.isArray(args.changedPaths)) {
    files = args.changedPaths.filter((p): p is string => typeof p === "string");
    changedSource = "provided changedPaths";
  } else {
    const got = deps.getChangedFiles();
    files = got.files;
    changedSource = got.source;
  }
  const changedRecs = recommendChecksForPaths(files);

  const selected = SAFE_CHECKS.filter((c) => !c.broadLint || includeBroadLint);

  // Run (only in runSafeChecks mode); advisory runs NOTHING.
  const checksRun: CheckOutcome[] = [];
  const failedOutputs: Array<{ name: string; tail: string }> = [];
  if (mode === "runSafeChecks") {
    for (const c of selected) {
      const out = await deps.runCheck(c.name);
      const outcome = classifyCheckOutput(c.name, out);
      checksRun.push(outcome);
      if (outcome.status === "failed" || outcome.status === "warning") {
        failedOutputs.push({ name: c.name, tail: truncateOutput(out, 1500) });
      }
    }
  }

  // Recommended (not run).
  const checksRecommended: string[] = [];
  if (mode === "advisory") {
    for (const c of selected) checksRecommended.push(c.name);
  } else if (!includeBroadLint) {
    checksRecommended.push("run_lint (broad eslint — pass includeBroadLint:true to run it)");
  }
  if (includeMcpSmoke) {
    checksRecommended.push("npm run mcp:smoke (run manually — NOT auto-runnable via MCP by design)");
  }
  for (const r of changedRecs) checksRecommended.push(`${r.check} — ${r.reason}`);

  const blockers = checksRun.filter((c) => c.status === "failed").map((c) => `${c.name}: ${c.headline}`);
  const warnings = checksRun.filter((c) => c.status === "warning").map((c) => `${c.name}: ${c.headline}`);
  const readiness = deriveReadiness(mode, checksRun, selected.length);

  const body = renderDeployReadiness({
    mode,
    readiness,
    changedSource,
    changedFiles: files,
    checksRun,
    failedOutputs,
    checksRecommended,
    blockers,
    warnings,
    includeMcpSmoke,
  });
  return maxOutput ? truncateOutput(body, maxOutput) : body;
}

interface DeployRenderInput {
  mode: "advisory" | "runSafeChecks";
  readiness: ReadinessStatus;
  changedSource: string;
  changedFiles: readonly string[];
  checksRun: readonly CheckOutcome[];
  failedOutputs: ReadonlyArray<{ name: string; tail: string }>;
  checksRecommended: readonly string[];
  blockers: readonly string[];
  warnings: readonly string[];
  includeMcpSmoke: boolean;
}

function renderDeployReadiness(i: DeployRenderInput): string {
  const out: string[] = [];
  out.push("# Deploy Readiness Report (internal, local)");
  out.push("");
  out.push(`**Readiness:** ${i.readiness}`);
  out.push(`**Mode:** ${i.mode}${i.mode === "advisory" ? " (recommends checks only; runs none)" : " (ran only safe local checks)"}`);
  out.push(`**Changed files source:** ${i.changedSource} (${i.changedFiles.length})`);
  out.push("");

  // Explicit no-action statements (always present).
  out.push("## Actions performed");
  for (const s of DEPLOY_NO_ACTION_STATEMENTS) out.push(`- ${s}`);
  out.push("- This report only RAN read-only local checks (in runSafeChecks mode) or recommended them (in advisory mode).");
  out.push("");

  // Checks run
  out.push("## Checks run");
  if (i.checksRun.length === 0) {
    out.push(i.mode === "advisory" ? "- _(none — advisory mode runs no checks)_" : "- _(none)_");
  } else {
    for (const c of i.checksRun) out.push(`- [${c.status.toUpperCase()}] ${c.name} — ${c.headline}`);
  }
  out.push("");

  // Checks recommended
  out.push("## Checks recommended");
  if (i.checksRecommended.length === 0) out.push("- _(none)_");
  else for (const r of i.checksRecommended) out.push(`- ${r}`);
  out.push("");

  // Blockers
  out.push("## Blockers");
  if (i.blockers.length === 0) out.push("- _(none)_");
  else for (const b of i.blockers) out.push(`- ${b}`);
  out.push("");

  // Warnings
  out.push("## Warnings");
  if (i.warnings.length === 0) out.push("- _(none)_");
  else for (const w of i.warnings) out.push(`- ${w}`);
  out.push("");

  // Failed/warning check detail (already-redacted tails)
  if (i.failedOutputs.length > 0) {
    out.push("## Failing / warning check detail (redacted, capped)");
    for (const f of i.failedOutputs) {
      out.push(`### ${f.name}`);
      out.push("```");
      out.push(f.tail);
      out.push("```");
    }
    out.push("");
  }

  // Changed files
  out.push("## Changed files");
  if (i.changedFiles.length === 0) out.push("- _(none detected)_");
  else {
    for (const f of i.changedFiles.slice(0, 50)) out.push(`- ${f}`);
    if (i.changedFiles.length > 50) out.push(`- …and ${i.changedFiles.length - 50} more`);
  }
  out.push("");

  out.push("## Safety note");
  out.push(
    "Internal pre-deploy readiness report. It is read-only: it never pushes, deploys, applies " +
      "migrations, runs db:push, or triggers a production smoke. Check output is redacted and " +
      "capped by the underlying tools; no secrets/env/tokens are included. Internal developer output only.",
  );
  return out.join("\n");
}

async function generateDeployReadinessReport(args: Record<string, unknown>): Promise<string> {
  return buildDeployReadinessReport(args);
}

export const reportTools: ToolDefinition[] = [
  {
    name: "generate_diagnostic_report",
    description:
      "Create a SAFE, copyable Markdown diagnostic report by composing an existing doctor. " +
      "type='workflow' composes doctor_workflow (needs workflowId + userId; optional runId / includeRunVisibility); " +
      "type='provider' composes doctor_provider (needs provider; optional accountId + userId for the live section); " +
      "type='accountIntegration' composes doctor_account_integration (needs accountId + userId; optional provider — account-wide enumeration is deferred). " +
      "The report adds NO new diagnostic brain, opens no route, and reaches no DB — every value comes from the already-sanitized doctor output (status enums, counts, node ids, field NAMES). " +
      "Body = Markdown (Summary, Sections, Findings by severity, Prioritized next steps, Sources used, Unavailable/deferred checks, Safety note) plus a structured-metadata JSON block. Optional includeSections / includeUnavailable / maxFindings.",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["workflow", "provider", "accountIntegration"], description: "Which diagnostic to compose into a report." },
        workflowId: { type: "string", description: "workflow report: the workflow id." },
        userId: { type: "string", description: "Subject (member of the relevant account)." },
        accountId: { type: "string", description: "account id (provider/accountIntegration reports)." },
        provider: { type: "string", description: "provider id (provider/accountIntegration reports)." },
        runId: { type: "string", description: "workflow report: optional run id to add the run-failure section." },
        includeRunVisibility: { type: "boolean", description: "workflow report: with a runId, add the visibility section." },
        includeSections: { type: "array", items: { type: "string" }, description: "Optional: only render these section names." },
        includeUnavailable: { type: "boolean", description: "Include the unavailable/deferred block (default true)." },
        maxFindings: { type: "number", description: "Cap findings shown per section (default 12)." },
      },
      required: ["type"],
      additionalProperties: false,
    },
    handler: generateDiagnosticReport,
  },
  {
    name: "generate_deploy_readiness_report",
    description:
      "Create an internal pre-push/pre-deploy readiness report for the CURRENT local repo state. " +
      "mode='advisory' (default) recommends checks but RUNS NONE; mode='runSafeChecks' runs ONLY allow-listed read-only local checks " +
      "(run_typecheck, run_structure_lint, run_migration_lint, run_route_structure_tests, run_provider_metadata_tests, summarize_last_test_failure; run_lint only when includeBroadLint:true). " +
      "It NEVER pushes, deploys, applies migrations, runs db:push, or triggers a production smoke (includeMcpSmoke is a recommendation only — MCP does not run it). " +
      "Returns readiness (ready/blocked/review_needed/unknown), checksRun vs checksRecommended, blockers, warnings, a Markdown body, and explicit no-push/no-deploy/no-db statements. " +
      "Optional changedPaths[] (else read-only git diff), includeBroadLint (default false), includeMcpSmoke, maxOutput.",
    inputSchema: {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["advisory", "runSafeChecks"], description: "advisory = recommend only (default); runSafeChecks = run allow-listed safe local checks." },
        changedPaths: { type: "array", items: { type: "string" }, description: "Optional changed repo-relative paths (else read-only git diff vs HEAD + untracked)." },
        includeMcpSmoke: { type: "boolean", description: "Recommend `npm run mcp:smoke` (NOT auto-run by MCP)." },
        includeBroadLint: { type: "boolean", description: "Also run the broad eslint check (expensive). Default false." },
        maxOutput: { type: "number", description: "Optional cap on the report's character length." },
      },
      additionalProperties: false,
    },
    handler: generateDeployReadinessReport,
  },
];
