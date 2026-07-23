/**
 * MCP catalog import pipeline (CS-2..CS-5A) — operator CLI.
 *
 *   npm run mcp:import -- generate <provider>                    snapshot+catalog → provider artifacts
 *   npm run mcp:import -- generate <provider> --print-registration  print inventory wiring (no write)
 *   npm run mcp:import -- capture <provider>                     live tools/list → mcp-snapshot.json
 *   npm run mcp:import -- capture <provider> --evidence          + approved read-only tool-call evidence
 *   npm run mcp:import -- check <provider> [--json]              live tools/list vs pinned (drift)
 *   npm run mcp:import -- rehash <provider>                      recompute snapshot schemaHash fields
 *   npm run mcp:import -- write-evidence <provider> --tool <t> --fixture <p> --allow-write-evidence --yes-run-write
 *                                                               explicit, gated WRITE-tool evidence (disposable records)
 *
 * `capture`/`check`/`write-evidence` need a bearer in MCP_IMPORT_BEARER
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
import { buildEvidence, writeEvidenceEligibility, buildWriteEvidence } from "@/integrations/_shared/mcp/evidence";
// `@next/env` is CommonJS — default-import the namespace so this resolves under
// both native ESM (the CLI runtime) and tsc.
import nextEnv from "@next/env";
const { loadEnvConfig } = nextEnv;

// Run from the repo root (the npm script guarantees the cwd).
const repoRoot = process.cwd();

// Load .env / .env.local the way Next.js tooling does, so the live commands
// (capture/check/write-evidence) pick up MCP_IMPORT_BEARER / LINEAR_* from the
// repo's local env files without the operator having to export them by hand.
// process.env still WINS over the files (Next precedence). Silent logger — the
// info line names files only, but we suppress it entirely and NEVER print values.
loadEnvConfig(repoRoot, true, { info: () => {}, error: (...a) => console.error(...a) });

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

/**
 * CS-6B — EXPLICIT, operator-gated write-evidence. Never runs through ordinary
 * `capture --evidence`. Requires, in order: `--allow-write-evidence`; a `--tool`
 * that is catalog-approved for write-evidence + risk exactly `write` + not a
 * forbidden verb (delete/refund/publish/invite/…); a `--fixture <path>` of
 * DISPOSABLE test args; a prominent confirmation; and a SECOND `--yes-run-write`
 * acknowledgment (without it the command prints the confirmation and STOPS).
 * The result is scrubbed + bounded + type-only exactly like read evidence. NO
 * auto-cleanup — the operator deletes the disposable record.
 */
async function writeEvidence(
  provider: string,
  opts: { tool?: string; fixture?: string; allow: boolean; yes: boolean },
): Promise<void> {
  if (!opts.allow) {
    console.log("REFUSED: write-evidence is disabled by default. Re-run with --allow-write-evidence to opt in.");
    process.exitCode = 2;
    return;
  }
  if (!opts.tool) {
    console.log("REFUSED: --tool <name> is required (the exact write tool to capture).");
    process.exitCode = 2;
    return;
  }
  const catalog = McpCatalogSchema.parse(await readCatalog(provider));
  const elig = writeEvidenceEligibility(catalog, opts.tool);
  if (!elig.eligible) {
    console.log(`REFUSED: ${elig.reason}.`);
    process.exitCode = 2;
    return;
  }
  if (!opts.fixture) {
    console.log("REFUSED: --fixture <path> is required — a JSON file of DISPOSABLE test args, e.g. { \"args\": { ... } }.");
    process.exitCode = 2;
    return;
  }
  const fixtureRaw = JSON.parse(readFileSync(path.resolve(repoRoot, opts.fixture), "utf8")) as { args?: Record<string, unknown> };
  const args = fixtureRaw.args;
  if (!args || typeof args !== "object") {
    console.log("REFUSED: fixture must be { \"args\": { ...tool arguments... } }.");
    process.exitCode = 2;
    return;
  }

  // Prominent confirmation (arg KEYS only — never echo values).
  console.log("\n============================================================");
  console.log("  ⚠  WRITE EVIDENCE — this CREATES/MODIFIES REAL DATA");
  console.log("============================================================");
  console.log(`  provider: ${provider}`);
  console.log(`  tool:     ${opts.tool}`);
  console.log(`  does:     ${elig.description}`);
  console.log(`  arg keys: ${Object.keys(args).join(", ")}`);
  console.log("  Use a DISPOSABLE certification record in a test team/project.");
  console.log("  There is NO auto-cleanup — delete the record yourself afterward.");
  console.log("============================================================");
  if (!opts.yes) {
    console.log("STOPPED: add --yes-run-write to acknowledge and actually run the write.\n");
    process.exitCode = 2;
    return;
  }

  const client = makeLiveClient(provider, catalog.serverUrl);
  await client.initialize();
  const evidence = await buildWriteEvidence({
    provider,
    tool: opts.tool,
    args,
    // Writes are NOT idempotent → single attempt (never auto-retried).
    callTool: (tool, a) => client.callTool(tool, a, { idempotent: false }),
  });

  // Merge into mcp-evidence.json: replace the tool's (skipped) entry.
  const evPath = path.join(providerDir(provider), "mcp-evidence.json");
  const existing = JSON.parse(readFileSync(evPath, "utf8")) as { tools: Array<{ tool: string }>; [k: string]: unknown };
  const others = (existing.tools ?? []).filter((t) => t.tool !== opts.tool);
  const merged = {
    ...existing,
    tools: [...others, evidence].sort((a, b) => a.tool.localeCompare(b.tool)),
    writeEvidenceCapturedAt: new Date().toISOString(),
  };
  writeFileSync(evPath, JSON.stringify(merged, null, 2) + "\n", "utf8");
  console.log(`\nwrite evidence for '${opts.tool}': ${evidence.captureStatus} → integrations/${provider}/mcp-evidence.json`);
  console.log("Reminder: delete the disposable certification record you just created.\n");
}

interface ParsedArgs {
  positionals: string[];
  flags: Map<string, string | true>;
}

/** Parse `positional`, `--flag`, and `--flag value` / `--flag=value`. */
function parseArgs(argv: string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags = new Map<string, string | true>();
  const valueFlags = new Set(["tool", "fixture"]);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (!a.startsWith("--")) {
      positionals.push(a);
      continue;
    }
    const body = a.slice(2);
    const eq = body.indexOf("=");
    if (eq >= 0) {
      flags.set(body.slice(0, eq), body.slice(eq + 1));
    } else if (valueFlags.has(body) && i + 1 < argv.length && !argv[i + 1]!.startsWith("--")) {
      flags.set(body, argv[++i]!);
    } else {
      flags.set(body, true);
    }
  }
  return { positionals, flags };
}

async function main(): Promise<void> {
  const { positionals, flags } = parseArgs(process.argv.slice(2));
  const [command, provider] = positionals;
  const flag = (k: string): boolean => flags.get(k) === true || typeof flags.get(k) === "string";
  const flagVal = (k: string): string | undefined => (typeof flags.get(k) === "string" ? (flags.get(k) as string) : undefined);
  if (!command || !provider) {
    console.log("usage: npm run mcp:import -- <generate|capture|check|rehash|write-evidence> <provider> [flags]");
    process.exitCode = 2;
    return;
  }
  if (command === "generate") return generate(provider, { printRegistration: flag("print-registration"), json: flag("json") });
  if (command === "capture") return capture(provider, { evidence: flag("evidence") });
  if (command === "check") return check(provider, { json: flag("json") });
  if (command === "rehash") return rehash(provider);
  if (command === "write-evidence") {
    return writeEvidence(provider, {
      ...(flagVal("tool") ? { tool: flagVal("tool") } : {}),
      ...(flagVal("fixture") ? { fixture: flagVal("fixture") } : {}),
      allow: flag("allow-write-evidence"),
      yes: flag("yes-run-write"),
    });
  }
  throw new Error(`unknown command '${command}'.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
