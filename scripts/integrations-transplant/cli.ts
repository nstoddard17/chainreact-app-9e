/**
 * DEV-CONNECTION-TRANSPLANT-UTILITY-1 — owner-operated CLI entry point.
 *
 *   npm run integrations:transplant -- --init [--config <path>]
 *   CHAINREACT_DB_TARGET=development npm run integrations:transplant -- --config <path> --dry-run
 *   CHAINREACT_DB_TARGET=development npm run integrations:transplant -- --config <path> --apply --dry-run-report <path>
 *
 * Env sources (merged; process env wins — no value ever comes from argv):
 *   - .env.development.local  → SUPABASE_DEV_URL / SUPABASE_DEV_SERVICE_ROLE_KEY /
 *                               SUPABASE_DEV_PROJECT_REF (+ optionally the
 *                               TRANSPLANT_* vars below)
 *   - .env.transplant.local   → TRANSPLANT_SOURCE_SUPABASE_URL /
 *                               TRANSPLANT_SOURCE_SERVICE_ROLE_KEY /
 *                               TRANSPLANT_SOURCE_TOKEN_ENCRYPTION_KEY /
 *                               TRANSPLANT_DEST_TOKEN_ENCRYPTION_KEY
 *   - .env.local is deliberately NEVER loaded (it points at production).
 *
 * After the pure-env preflight passes, the process-global Supabase env is
 * pinned ONCE to the verified development project (URL, service-role key,
 * TOKEN_ENCRYPTION_KEY = the DEV key). From that point the canonical
 * repositories — the only write path — can only reach the dev project, and
 * the canonical `decryptToken` proves the dev runtime can read what we wrote.
 * Production is reachable solely through the read-only source adapter.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  PRODUCTION_PROJECT_REF,
  PROTECTED_REFS,
  resolveDbTarget,
} from "../lib/env-target.mjs";
import { loadEnvFile, parseRefFromSupabaseUrl } from "../lib/db-target.mjs";
import {
  decryptToken,
  decryptTokenWithKey,
  encryptTokenWithKey,
} from "@/core/encryption/tokens";
import { parseConfig, CONFIG_TEMPLATE } from "./config";
import { classifyProvider } from "./classification";
import { getProbe } from "./verificationProbes";
import { createSourceReader } from "./sourceReader";
import { runEnvPreflight, runDataPreflight } from "./preflight";
import { runDryRun, runApply, type OrchestratorDeps } from "./orchestrator";
import { TransplantRefusalError, type TransplantConfig } from "./types";

const DEFAULT_CONFIG_PATH = "scripts/integrations-transplant/transplant.config.local.json";
const ARTIFACT_DIR = path.join("artifacts", "transplant");

interface CliArgs {
  init: boolean;
  configPath: string;
  dryRun: boolean;
  apply: boolean;
  dryRunReportPath: string | null;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    init: false,
    configPath: DEFAULT_CONFIG_PATH,
    dryRun: false,
    apply: false,
    dryRunReportPath: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--init") args.init = true;
    else if (a === "--dry-run") args.dryRun = true;
    else if (a === "--apply") args.apply = true;
    else if (a === "--config") args.configPath = argv[++i] ?? args.configPath;
    else if (a === "--dry-run-report") args.dryRunReportPath = argv[++i] ?? null;
    else {
      throw new Error(`unknown argument '${a}'. Secrets are never accepted as arguments.`);
    }
  }
  return args;
}

function mergedEnv(): Record<string, string | undefined> {
  let fileEnv: Record<string, string> = {};
  for (const file of [".env.development.local", ".env.transplant.local"]) {
    if (existsSync(file)) {
      fileEnv = { ...fileEnv, ...loadEnvFile(readFileSync as never, file) };
    }
  }
  return { ...fileEnv, ...process.env };
}

/** Preload manifest facts for the allowlisted providers (light modules only). */
async function loadProviderInfo(
  providers: readonly string[],
): Promise<Map<string, { registered: boolean; enabled: boolean; requiredScopes: readonly string[] }>> {
  const map = new Map<
    string,
    { registered: boolean; enabled: boolean; requiredScopes: readonly string[] }
  >();
  for (const provider of providers) {
    if (!/^[a-z0-9-]+$/.test(provider)) {
      map.set(provider, { registered: false, enabled: false, requiredScopes: [] });
      continue;
    }
    try {
      const mod = (await import(`@/integrations/${provider}/manifest`)) as Record<string, unknown>;
      const manifest = Object.values(mod).find(
        (v): v is { id: string; isEnabled: boolean; scopes?: { required?: string[] } } =>
          typeof v === "object" && v !== null && (v as { id?: unknown }).id === provider,
      );
      if (!manifest) {
        map.set(provider, { registered: false, enabled: false, requiredScopes: [] });
      } else {
        map.set(provider, {
          registered: true,
          enabled: manifest.isEnabled === true,
          requiredScopes: manifest.scopes?.required ?? [],
        });
      }
    } catch {
      map.set(provider, { registered: false, enabled: false, requiredScopes: [] });
    }
  }
  return map;
}

function printSummary(reportSerialized: string): void {
  const report = JSON.parse(reportSerialized) as {
    mode: string;
    fingerprint: string;
    counts: Record<string, number>;
    items: Array<{ provider: string; status: string; reason: string }>;
  };
  console.log(`mode: ${report.mode}`);
  console.log(`fingerprint: ${report.fingerprint}`);
  for (const item of report.items) {
    console.log(`  ${item.provider}: ${item.status} (${item.reason})`);
  }
  console.log(`counts: ${JSON.stringify(report.counts)}`);
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));

  if (args.init) {
    if (existsSync(args.configPath)) {
      console.error(`refusing to overwrite existing config at ${args.configPath}`);
      return 1;
    }
    writeFileSync(args.configPath, CONFIG_TEMPLATE, "utf8");
    console.log(`wrote placeholder config to ${args.configPath} (gitignored).`);
    return 0;
  }

  if (args.dryRun === args.apply) {
    console.error("pass exactly one of --dry-run or --apply.");
    return 1;
  }

  if (!existsSync(args.configPath)) {
    console.error(`config file not found: ${args.configPath} (run --init to create a template).`);
    return 1;
  }
  const config: TransplantConfig = parseConfig(readFileSync(args.configPath, "utf8"));

  const env = mergedEnv();

  // Stage 1 — pure environment identity (no clients, no network).
  const envResult = runEnvPreflight(
    {
      resolveDbTarget,
      parseRefFromSupabaseUrl,
      productionRef: PRODUCTION_PROJECT_REF,
      protectedRefs: PROTECTED_REFS,
    },
    config,
    env,
  );

  // Stage 2 — pin the process-global Supabase env to the VERIFIED dev project
  // (set once, never flipped back). The canonical repositories and the
  // canonical decryptToken now target dev and only dev.
  process.env.NEXT_PUBLIC_SUPABASE_URL = envResult.devUrl;
  process.env.SUPABASE_SERVICE_ROLE_KEY = envResult.devServiceRoleKey;
  process.env.TOKEN_ENCRYPTION_KEY = env.TRANSPLANT_DEST_TOKEN_ENCRYPTION_KEY;
  delete process.env.SUPABASE_ACCESS_TOKEN;

  // Deferred import so the canonical repositories are first evaluated AFTER
  // the global env is pinned (their service-role client is constructed on
  // first call either way; this keeps the ordering obvious and testable).
  const { createDestinationStore } = await import("./destination");

  const source = createSourceReader({
    url: envResult.sourceUrl,
    serviceRoleKey: envResult.sourceServiceRoleKey,
  });
  const dest = createDestinationStore({
    devRef: envResult.devRef,
    parseRefFromSupabaseUrl,
    protectedRefs: PROTECTED_REFS,
  });

  // Stage 3 — data-dependent identity checks (existence, membership, roles).
  await runDataPreflight({ source, dest }, config);

  const providerInfoMap = await loadProviderInfo(config.providerAllowlist);
  const deps: OrchestratorDeps = {
    source,
    dest,
    crypto: {
      decryptSource: (ct) => decryptTokenWithKey(ct, envResult.sourceEncryptionKey),
      encryptDest: (pt) => encryptTokenWithKey(pt, envResult.destEncryptionKey),
      // Canonical env-bound decrypt = the exact path the dev runtime uses.
      decryptDestRuntime: (ct) => decryptToken(ct),
    },
    getProbe,
    classify: classifyProvider,
    providerInfo: (provider) =>
      providerInfoMap.get(provider) ?? { registered: false, enabled: false, requiredScopes: [] },
    log: (line) => console.log(line),
    now: () => Date.now(),
  };

  mkdirSync(ARTIFACT_DIR, { recursive: true });
  const operationId = `transplant-${Date.now().toString(36)}`;

  if (args.dryRun) {
    const { report, serialized } = await runDryRun(deps, config, operationId);
    const artifactPath = path.join(ARTIFACT_DIR, `dryrun-${report.fingerprint.slice(0, 16)}.json`);
    writeFileSync(artifactPath, serialized, "utf8");
    printSummary(serialized);
    console.log(`dry-run artifact: ${artifactPath}`);
    console.log("no destination writes were performed.");
    return 0;
  }

  // --apply
  if (!args.dryRunReportPath) {
    console.error("--apply requires --dry-run-report <path to the reviewed dry-run artifact>.");
    return 1;
  }
  if (!existsSync(args.dryRunReportPath)) {
    throw new TransplantRefusalError(
      "dry_run_artifact_missing",
      "the referenced dry-run artifact does not exist; run --dry-run first.",
    );
  }
  const dryRunArtifact = JSON.parse(readFileSync(args.dryRunReportPath, "utf8")) as {
    mode?: string;
    fingerprint?: string;
  };
  if (dryRunArtifact.mode !== "dry-run" || typeof dryRunArtifact.fingerprint !== "string") {
    throw new TransplantRefusalError(
      "dry_run_artifact_missing",
      "the referenced file is not a dry-run artifact.",
    );
  }

  const { report, serialized } = await runApply(
    deps,
    config,
    operationId,
    dryRunArtifact.fingerprint,
  );
  const artifactPath = path.join(ARTIFACT_DIR, `apply-${report.fingerprint.slice(0, 16)}.json`);
  writeFileSync(artifactPath, serialized, "utf8");
  printSummary(serialized);
  console.log(`apply artifact: ${artifactPath}`);
  return 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err) => {
    if (err instanceof TransplantRefusalError) {
      console.error(err.message);
    } else {
      // Unexpected error — print the message only (never a payload dump).
      console.error(`transplant failed: ${(err as Error).message}`);
    }
    process.exitCode = 1;
  });
