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
  resolve: boolean;
  sourceEmail: string | null;
  destEmail: string | null;
  configPath: string;
  dryRun: boolean;
  apply: boolean;
  dryRunReportPath: string | null;
  validateReportPath: string | null;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    init: false,
    resolve: false,
    sourceEmail: null,
    destEmail: null,
    configPath: DEFAULT_CONFIG_PATH,
    dryRun: false,
    apply: false,
    dryRunReportPath: null,
    validateReportPath: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--init") args.init = true;
    else if (a === "--resolve") args.resolve = true;
    else if (a === "--source-email") args.sourceEmail = argv[++i] ?? null;
    else if (a === "--dest-email") args.destEmail = argv[++i] ?? null;
    else if (a === "--dry-run") args.dryRun = true;
    else if (a === "--apply") args.apply = true;
    else if (a === "--config") args.configPath = argv[++i] ?? args.configPath;
    else if (a === "--dry-run-report") args.dryRunReportPath = argv[++i] ?? null;
    else if (a === "--validate") args.validateReportPath = argv[++i] ?? null;
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

  if (args.resolve) {
    // READ-ONLY endpoint discovery (see resolveEndpoints.ts) — no config file
    // needed; prints ids/names/roles/providers only, never credentials.
    if (!args.sourceEmail || !args.destEmail) {
      console.error("--resolve requires --source-email <email> and --dest-email <email>.");
      return 1;
    }
    const { resolveEndpoints } = await import("./resolveEndpoints");
    const resolved = await resolveEndpoints(
      {
        resolveDbTarget,
        parseRefFromSupabaseUrl,
        productionRef: PRODUCTION_PROJECT_REF,
        protectedRefs: PROTECTED_REFS,
      },
      mergedEnv(),
      { sourceEmail: args.sourceEmail, destEmail: args.destEmail },
    );
    console.log(`SOURCE user id: ${resolved.sourceUserId}`);
    for (const account of resolved.sourceAccounts) {
      console.log(`SOURCE account: ${JSON.stringify(account)}`);
    }
    if (resolved.sourceAccounts.length === 0) {
      console.log("SOURCE: user belongs to no accounts.");
    }
    console.log(`DEST user id: ${resolved.destUserId}`);
    for (const account of resolved.destPersonalAccounts) {
      console.log(`DEST personal account: ${JSON.stringify(account)}`);
    }
    return 0;
  }

  if (args.validateReportPath) {
    // READ-ONLY post-apply validation of an apply artifact. Requires the same
    // fail-closed environment preflight as every other mode (run below).
    if (args.dryRun || args.apply) {
      console.error("--validate cannot be combined with --dry-run or --apply.");
      return 1;
    }
  } else if (args.dryRun === args.apply) {
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

  // Provider-probe configuration. A few read-only identity probes need
  // DEPLOYMENT-level provider config in addition to the integration's own
  // credential — Trello authenticates every API call as a (API key, user
  // token) PAIR, so its probe needs the same TRELLO_CLIENT_ID the dev runtime
  // uses. Narrow, explicit allowlist sourced ONLY from the merged
  // transplant/development env files (the production env file is never
  // loaded), never logged, and absent values are left unset so the probe fails
  // closed rather than authenticating with a wrong key.
  const PROBE_CONFIG_VARS = ["TRELLO_CLIENT_ID"] as const;
  for (const name of PROBE_CONFIG_VARS) {
    const value = env[name];
    if (value) process.env[name] = value;
  }

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

  if (args.validateReportPath) {
    const applyArtifact = JSON.parse(readFileSync(args.validateReportPath, "utf8")) as {
      mode?: string;
      items?: Array<{
        provider: string;
        sourceIntegrationId: string;
        destinationIntegrationId?: string;
        status: string;
      }>;
    };
    if (applyArtifact.mode !== "apply" || !Array.isArray(applyArtifact.items)) {
      console.error("--validate expects an apply artifact.");
      return 1;
    }
    const expected = applyArtifact.items
      .filter((i) => i.status === "verified" && i.destinationIntegrationId)
      .map((i) => ({
        provider: i.provider,
        sourceIntegrationId: i.sourceIntegrationId,
        destinationIntegrationId: i.destinationIntegrationId!,
      }));
    // Snapshot the source rows now; the apply already proved byte-equality at
    // write time, this re-proves it AFTER the whole batch.
    const before = new Map<string, string>();
    for (const row of await source.getIntegrationsByIds(
      expected.map((e) => e.sourceIntegrationId),
    )) {
      before.set(row.id, JSON.stringify(row));
    }
    const { validateBatch } = await import("./validateBatch");
    const result = await validateBatch({
      source,
      destAccountId: config.destAccountId,
      destConnectedByUserId: config.destConnectedByUserId,
      expected,
      sourceBefore: before,
    });
    for (const row of result.rows) console.log(JSON.stringify(row));
    console.log(
      `active integrations in destination account: ${result.activeInDestAccount}`,
    );
    return 0;
  }

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
