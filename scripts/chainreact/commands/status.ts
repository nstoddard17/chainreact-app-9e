/**
 * Internal ChainReact CLI — `status` command.
 *
 * Prints a concise, network-free, secret-free snapshot of the local repo/tooling
 * state. The data-collection step (`collectStatus`) is pure over injected deps so
 * it is fully deterministic in tests; the real entrypoint wires the live runtime
 * + filesystem.
 */
import type { FsDeps } from "../repo";

/** Runtime facts the status report needs (injected → deterministic in tests). */
export interface StatusRuntime {
  readonly nodeVersion: string;
  readonly platform: string;
  readonly cwd: string;
  readonly repoRoot: string;
}

export interface KeyFileCheck {
  readonly path: string;
  readonly present: boolean;
}

export interface StatusReport {
  readonly repoRoot: string;
  readonly cwdInsideRepo: boolean;
  readonly nodeVersion: string;
  readonly platform: string;
  readonly packageManager: string;
  readonly keyFiles: readonly KeyFileCheck[];
  readonly providerManifestCount: number;
  readonly ruleDocCount: number;
}

/** Key project files/docs whose presence indicates a healthy V2 checkout. */
const KEY_FILES: readonly string[] = [
  "package.json",
  "tsconfig.json",
  "jest.config.mjs",
  "CLAUDE.md",
  "docs/PROJECT_MEMORY.md",
  "docs/rules",
  "integrations",
  "services/discovery",
  "scripts/mcp",
];

/** Infer the package manager from the lockfile present (defaults to npm). */
export function inferPackageManager(fs: FsDeps): string {
  if (fs.exists("pnpm-lock.yaml")) return "pnpm";
  if (fs.exists("yarn.lock")) return "yarn";
  if (fs.exists("package-lock.json")) return "npm";
  return "npm (assumed — no lockfile found)";
}

/** Count provider manifests: integrations/<id>/manifest.ts. */
export function countProviderManifests(fs: FsDeps): number {
  let count = 0;
  for (const entry of fs.listDir("integrations")) {
    if (fs.isDirectory(`integrations/${entry}`) && fs.exists(`integrations/${entry}/manifest.ts`)) {
      count += 1;
    }
  }
  return count;
}

/** Count rule docs: docs/rules/*.md. */
export function countRuleDocs(fs: FsDeps): number {
  return fs.listDir("docs/rules").filter((name) => name.endsWith(".md")).length;
}

/** Collect the full status report. Pure over injected deps. */
export function collectStatus(runtime: StatusRuntime, fs: FsDeps): StatusReport {
  const normalizedCwd = runtime.cwd.split("\\").join("/");
  const normalizedRoot = runtime.repoRoot.split("\\").join("/");
  return {
    repoRoot: runtime.repoRoot,
    cwdInsideRepo: normalizedCwd === normalizedRoot || normalizedCwd.startsWith(`${normalizedRoot}/`),
    nodeVersion: runtime.nodeVersion,
    platform: runtime.platform,
    packageManager: inferPackageManager(fs),
    keyFiles: KEY_FILES.map((path) => ({ path, present: fs.exists(path) })),
    providerManifestCount: countProviderManifests(fs),
    ruleDocCount: countRuleDocs(fs),
  };
}

/** Render the report as concise, stable text. Pure. */
export function renderStatus(report: StatusReport): string {
  const lines: string[] = [
    "ChainReact — local status",
    `  repo root:         ${report.repoRoot}`,
    `  cwd inside repo:   ${report.cwdInsideRepo ? "yes" : "NO — run inside the ChainReactV2 repo"}`,
    `  node:              ${report.nodeVersion}`,
    `  platform:          ${report.platform}`,
    `  package manager:   ${report.packageManager}`,
    `  provider manifests: ${report.providerManifestCount}`,
    `  rule docs:         ${report.ruleDocCount}`,
    "  key files:",
  ];
  for (const f of report.keyFiles) {
    lines.push(`    [${f.present ? "ok " : "MISS"}] ${f.path}`);
  }
  const missing = report.keyFiles.filter((f) => !f.present);
  lines.push(
    "",
    missing.length === 0
      ? "All key project files present."
      : `Missing ${missing.length} key file(s): ${missing.map((f) => f.path).join(", ")}`,
  );
  return lines.join("\n");
}
