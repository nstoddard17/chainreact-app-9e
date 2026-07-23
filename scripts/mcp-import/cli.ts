/**
 * MCP catalog import pipeline (CS-2..CS-5A) — operator CLI.
 *
 *   npm run mcp:import -- generate <provider>                    snapshot+catalog → provider artifacts
 *   npm run mcp:import -- generate <provider> --print-registration  print inventory wiring (no write)
 *   npm run mcp:import -- capture <provider>                     live tools/list → mcp-snapshot.json
 *   npm run mcp:import -- capture <provider> --evidence          + approved read-only tool-call evidence
 *   npm run mcp:import -- check <provider> [--json]              live tools/list vs pinned (drift)
 *   npm run mcp:import -- rehash <provider>                      recompute snapshot schemaHash fields
 *
 * `capture`/`check` need a bearer for the vendor server in MCP_IMPORT_BEARER
 * (an owner-time dev credential — NEVER a customer token; nothing is logged).
 * `generate` (write mode) and `--print-registration` are pure/deterministic;
 * `--print-registration` mutates nothing and refuses when artifacts are stale.
 * A jest guard keeps generated artifacts in sync.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import {
  McpToolSnapshotFileSchema,
  McpCatalogSchema,
  compileProvider,
  emitProviderArtifacts,
  buildRegistrationPlan,
  renderRegistrationPlan,
  schemaHash,
  type CompiledProvider,
  type McpCatalog,
  type McpToolSnapshotFile,
} from "@/core/mcpCompile";
import { createMcpClient, type McpClient } from "@/integrations/_shared/mcp/client";
import { buildDriftReport, type DriftReport } from "@/integrations/_shared/mcp/driftClassify";
import { buildEvidence } from "@/integrations/_shared/mcp/evidence";

// Run from the repo root (the npm script guarantees the cwd).
const repoRoot = process.cwd();

function providerDir(provider: string): string {
  if (!/^[a-z][a-z0-9_-]*$/.test(provider)) throw new Error(`Invalid provider id '${provider}'.`);
  return path.join(repoRoot, "integrations", provider);
}

function readSnapshot(provider: string): unknown {
  const p = path.join(providerDir(provider), "mcp-snapshot.json");
  return JSON.parse(readFileSync(p, "utf8"));
}

async function readCatalog(provider: string): Promise<unknown> {
  const mod = (await import(`@/integrations/${provider}/mcp-catalog`)) as Record<string, unknown>;
  const catalog = mod.default ?? mod.catalog ?? Object.values(mod)[0];
  if (!catalog) throw new Error(`integrations/${provider}/mcp-catalog.ts exports no catalog.`);
  return catalog;
}

/** Fail loudly if committed generated artifacts differ from a fresh compile. */
function assertArtifactsFresh(provider: string, compiled: CompiledProvider): void {
  const dir = providerDir(provider);
  for (const file of emitProviderArtifacts(compiled)) {
    const target = path.join(dir, file.path);
    let committed: string;
    try {
      committed = readFileSync(target, "utf8");
    } catch {
      throw new Error(`missing generated file '${file.path}' — run: npm run mcp:import -- generate ${provider}`);
    }
    if (committed.replace(/\r\n/g, "\n") !== file.content) {
      throw new Error(`stale generated artifact '${file.path}' — run: npm run mcp:import -- generate ${provider}`);
    }
  }
}

async function generate(
  provider: string,
  opts: { printRegistration: boolean; json: boolean } = { printRegistration: false, json: false },
): Promise<void> {
  const compiled = compileProvider(readSnapshot(provider), await readCatalog(provider));

  // CS-5A — registration-output mode: mutate nothing, validate freshness, print
  // the exact hand-maintained inventory fragments to paste.
  if (opts.printRegistration) {
    assertArtifactsFresh(provider, compiled);
    const plan = buildRegistrationPlan(compiled);
    console.log(opts.json ? JSON.stringify(plan, null, 2) : renderRegistrationPlan(plan));
    return;
  }

  const dir = providerDir(provider);
  for (const file of emitProviderArtifacts(compiled)) {
    const target = path.join(dir, file.path);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, file.content, "utf8");
    console.log(`wrote integrations/${provider}/${file.path}`);
  }
  console.log(
    `generated ${compiled.actions.length} action(s); artifacts stay UNREGISTERED until the executor slice registers them.`,
  );
}

/** A bearer-authenticated client bounded like the runtime executor. */
function makeLiveClient(provider: string, serverUrl: string): McpClient {
  const bearer = process.env.MCP_IMPORT_BEARER;
  if (!bearer) throw new Error("MCP_IMPORT_BEARER env var is required for capture/check.");
  return createMcpClient({
    endpoint: serverUrl,
    accessToken: bearer,
    serverLabel: provider,
    maxResponseBytes: 1_000_000,
    timeoutMs: 25_000,
  });
}

async function liveTools(provider: string, serverUrl: string) {
  const client = makeLiveClient(provider, serverUrl);
  await client.initialize();
  const listed = await client.listTools();
  return listed.tools;
}

async function capture(provider: string, opts: { evidence: boolean } = { evidence: false }): Promise<void> {
  const catalog = McpCatalogSchema.parse(await readCatalog(provider));
  const client = makeLiveClient(provider, catalog.serverUrl);
  await client.initialize();
  const tools = (await client.listTools()).tools;
  const snapshot: McpToolSnapshotFile = McpToolSnapshotFileSchema.parse({
    provider,
    serverUrl: catalog.serverUrl,
    protocolVersion: null,
    capturedBy: "live",
    capturedAt: new Date().toISOString(),
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description ?? "",
      inputSchema: (t.inputSchema ?? {}) as Record<string, unknown>,
      outputSchema: null,
      schemaHash: schemaHash((t.inputSchema ?? {}) as Record<string, unknown>),
    })),
  });
  writeFileSync(path.join(providerDir(provider), "mcp-snapshot.json"), JSON.stringify(snapshot, null, 2) + "\n", "utf8");
  console.log(`captured ${snapshot.tools.length} tool(s) → integrations/${provider}/mcp-snapshot.json`);

  if (opts.evidence) {
    await captureEvidence(provider, catalog, snapshot, client);
  }
}

/**
 * CS-5A — evidence mode. Runs ONLY the read-only tools the catalog explicitly
 * approved (with committed sample args), records type-only scrubbed result
 * shapes, and writes a reviewable artifact. Never invokes write/destructive/etc.
 */
async function captureEvidence(
  provider: string,
  catalog: McpCatalog,
  snapshot: McpToolSnapshotFile,
  client: McpClient,
): Promise<void> {
  const artifact = await buildEvidence({
    provider,
    catalog,
    snapshot,
    // Read-only tools only reach here (selection double-gates); idempotent retry ok.
    callTool: (tool, args) => client.callTool(tool, args, { idempotent: true }),
  });
  const withMeta = { ...artifact, capturedAt: new Date().toISOString(), capturedBy: "live" as const };
  writeFileSync(path.join(providerDir(provider), "mcp-evidence.json"), JSON.stringify(withMeta, null, 2) + "\n", "utf8");
  const captured = artifact.tools.filter((t) => t.captureStatus === "captured").length;
  const skipped = artifact.tools.filter((t) => t.captureStatus === "skipped").length;
  const manual = artifact.tools.filter((t) => t.captureStatus === "manual_review_required").length;
  console.log(
    `evidence → integrations/${provider}/mcp-evidence.json (${captured} captured, ${skipped} skipped, ${manual} need manual review). Review before curating outputs.`,
  );
}

/**
 * CS-4 — proactive drift REVIEW. Compares live `tools/list` against the certified
 * snapshot, classifies every tool, and prints an internal review report (or JSON
 * for scheduled/cron inspection with `--json`). Exit code 1 on any
 * execution-blocking drift so a cron/CI can alert. NEVER regenerates, approves,
 * or publishes — those stay human decisions.
 */
async function check(provider: string, opts: { json: boolean } = { json: false }): Promise<void> {
  const snapshot = McpToolSnapshotFileSchema.parse(readSnapshot(provider));
  let catalog: McpCatalog | undefined;
  try {
    catalog = McpCatalogSchema.parse(await readCatalog(provider));
  } catch {
    catalog = undefined; // affected-actions mapping is best-effort
  }
  const live = await liveTools(provider, snapshot.serverUrl);
  const report = buildDriftReport({
    provider,
    serverUrl: snapshot.serverUrl,
    certifiedTools: snapshot.tools,
    liveTools: live,
    ...(catalog ? { catalog } : {}),
  });

  if (opts.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    renderDriftReport(report);
  }
  // Exit non-zero when anything is execution-blocking (breaking / removed /
  // renamed / ambiguous) — the signal a scheduled inspection alerts on.
  if (report.overallRisk === "breaking") process.exitCode = 1;
}

function renderDriftReport(report: DriftReport): void {
  console.log(`\nMCP drift review — ${report.provider} (${report.serverUrl})`);
  console.log(`overall: ${report.overallRisk.toUpperCase()}   ready for certification: ${report.readyForCertification ? "yes" : "no"}\n`);
  for (const f of report.findings) {
    const flag = f.executionAllowed ? (f.classification === "no_change" ? "  ok  " : " review ") : " BLOCK ";
    const detail: string[] = [];
    if (f.fields.removed.length) detail.push(`removed: ${f.fields.removed.join(", ")}`);
    if (f.fields.newlyRequired.length) detail.push(`newly-required: ${f.fields.newlyRequired.join(", ")}`);
    if (f.fields.added.length) detail.push(`added: ${f.fields.added.join(", ")}`);
    if (f.fields.modified.length) detail.push(`changed: ${f.fields.modified.join(", ")}`);
    if (f.renamedTo) detail.push(`renamed→ ${f.renamedTo}`);
    console.log(`[${flag}] ${f.tool.padEnd(18)} ${f.classification.padEnd(15)} → ${f.certificationState}`);
    console.log(`         ${f.reason}`);
    if (f.affectedActions.length) console.log(`         affected actions: ${f.affectedActions.join(", ")}`);
    if (detail.length) console.log(`         ${detail.join("; ")}`);
  }
  if (report.unapprovedNewTools.length) {
    console.log(`\nnew server tools (never auto-appear; curate to adopt): ${report.unapprovedNewTools.join(", ")}`);
  }
  console.log(
    report.overallRisk === "breaking"
      ? `\nACTION: breaking drift — re-capture, re-review the catalog, regenerate, re-certify.`
      : report.overallRisk === "review"
        ? `\nACTION: non-breaking change(s) detected — schedule a re-certification review.`
        : `\nno drift across ${report.findings.length} certified tool(s).`,
  );
}

function rehash(provider: string): void {
  const raw = readSnapshot(provider) as { tools?: Array<Record<string, unknown>> };
  if (!Array.isArray(raw.tools)) throw new Error("snapshot has no tools array.");
  for (const t of raw.tools) {
    t.schemaHash = schemaHash((t.inputSchema ?? {}) as Record<string, unknown>);
  }
  McpToolSnapshotFileSchema.parse(raw);
  const target = path.join(providerDir(provider), "mcp-snapshot.json");
  writeFileSync(target, JSON.stringify(raw, null, 2) + "\n", "utf8");
  console.log(`rehashed ${raw.tools.length} tool(s).`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const flags = new Set(args.filter((a) => a.startsWith("--")));
  const [command, provider] = args.filter((a) => !a.startsWith("--"));
  if (!command || !provider) {
    console.log("usage: npm run mcp:import -- <generate|capture|check|rehash> <provider> [--print-registration|--evidence|--json]");
    process.exitCode = 2;
    return;
  }
  if (command === "generate") return generate(provider, { printRegistration: flags.has("--print-registration"), json: flags.has("--json") });
  if (command === "capture") return capture(provider, { evidence: flags.has("--evidence") });
  if (command === "check") return check(provider, { json: flags.has("--json") });
  if (command === "rehash") return rehash(provider);
  throw new Error(`unknown command '${command}'.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
