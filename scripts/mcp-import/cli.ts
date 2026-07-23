/**
 * MCP catalog import pipeline (CS-2) — operator CLI.
 *
 *   npm run mcp:import -- generate <provider>   snapshot+catalog → provider artifacts
 *   npm run mcp:import -- capture <provider>    live tools/list → mcp-snapshot.json
 *   npm run mcp:import -- check <provider>      live tools/list vs pinned hashes (drift)
 *   npm run mcp:import -- rehash <provider>     recompute snapshot schemaHash fields
 *
 * `capture`/`check` need a bearer for the vendor server in MCP_IMPORT_BEARER
 * (an owner-time dev credential — NEVER a customer token; nothing is logged).
 * `generate` is pure and deterministic: committed snapshot + committed catalog
 * in, committed artifacts out. A jest guard keeps artifacts in sync.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import {
  McpToolSnapshotFileSchema,
  compileProvider,
  emitProviderArtifacts,
  schemaHash,
} from "@/core/mcpCompile";
import { createMcpClient } from "@/integrations/_shared/mcp/client";

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

async function generate(provider: string): Promise<void> {
  const compiled = compileProvider(readSnapshot(provider), await readCatalog(provider));
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

async function liveTools(provider: string, serverUrl: string) {
  const bearer = process.env.MCP_IMPORT_BEARER;
  if (!bearer) throw new Error("MCP_IMPORT_BEARER env var is required for capture/check.");
  const client = createMcpClient({
    endpoint: serverUrl,
    accessToken: bearer,
    serverLabel: provider,
  });
  await client.initialize();
  const listed = await client.listTools();
  return listed.tools;
}

async function capture(provider: string): Promise<void> {
  const catalog = (await readCatalog(provider)) as { serverUrl?: string };
  if (!catalog.serverUrl) throw new Error("catalog is missing serverUrl.");
  const tools = await liveTools(provider, catalog.serverUrl);
  const snapshot = McpToolSnapshotFileSchema.parse({
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
  const target = path.join(providerDir(provider), "mcp-snapshot.json");
  writeFileSync(target, JSON.stringify(snapshot, null, 2) + "\n", "utf8");
  console.log(`captured ${snapshot.tools.length} tool(s) → integrations/${provider}/mcp-snapshot.json`);
}

async function check(provider: string): Promise<void> {
  const snapshot = McpToolSnapshotFileSchema.parse(readSnapshot(provider));
  const live = await liveTools(provider, snapshot.serverUrl);
  const liveByName = new Map(live.map((t) => [t.name, t]));
  let drifted = 0;
  for (const pinned of snapshot.tools) {
    const current = liveByName.get(pinned.name);
    if (!current) {
      console.log(`DRIFT ${pinned.name}: tool no longer listed`);
      drifted++;
      continue;
    }
    const liveHash = schemaHash((current.inputSchema ?? {}) as Record<string, unknown>);
    if (liveHash !== pinned.schemaHash) {
      console.log(`DRIFT ${pinned.name}: inputSchema hash changed`);
      drifted++;
    }
  }
  if (drifted === 0) {
    console.log(`no drift across ${snapshot.tools.length} pinned tool(s).`);
  } else {
    console.log(`${drifted} drifted tool(s) — re-run capture, re-review the catalog, regenerate.`);
    process.exitCode = 1;
  }
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
  const [command, provider] = process.argv.slice(2);
  if (!command || !provider) {
    console.log("usage: npm run mcp:import -- <generate|capture|check|rehash> <provider>");
    process.exitCode = 2;
    return;
  }
  if (command === "generate") return generate(provider);
  if (command === "capture") return capture(provider);
  if (command === "check") return check(provider);
  if (command === "rehash") return rehash(provider);
  throw new Error(`unknown command '${command}'.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
