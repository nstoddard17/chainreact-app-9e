#!/usr/bin/env node
/**
 * Internal ChainReact CLI — entry point + command dispatch.
 *
 * Local developer/operator tooling only. No auth/login, no workflow execution, no
 * production network calls, no database writes, no push/deploy/db:push. Every side
 * effect (shelling out to npm scripts) is funneled through an injectable runner;
 * filesystem + runtime are injectable too, so `run()` is unit-testable end-to-end
 * without touching disk or spawning processes.
 *
 * Built to runnable CommonJS via scripts/chainreact/tsconfig.json (→ dist/, gitignored).
 */
import { parseArgs, wantsHelp } from "./args";
import { renderValidation, validateProvider } from "./commands/appValidate";
import { renderMcpSmoke, runMcpSmoke } from "./commands/mcpSmoke";
import { collectStatus, renderStatus } from "./commands/status";
import { buildVerifyPlan, executeVerify, renderVerify } from "./commands/verify";
import { helpText } from "./help";
import { defaultFsDeps, findRepoRoot, type FsDeps } from "./repo";
import { type CommandRunner, defaultRunner } from "./runner";

export interface CliDeps {
  readonly fs?: FsDeps;
  readonly runner?: CommandRunner;
  readonly runtime?: { nodeVersion: string; platform: string; cwd: string; repoRoot: string };
  readonly availableScripts?: ReadonlySet<string>;
  readonly log?: (line: string) => void;
}

function loadAvailableScripts(fs: FsDeps): ReadonlySet<string> {
  try {
    const pkg = JSON.parse(fs.readText("package.json")) as { scripts?: Record<string, string> };
    return new Set(Object.keys(pkg.scripts ?? {}));
  } catch {
    return new Set();
  }
}

/** Dispatch the CLI. Returns a process exit code. Pure-ish (effects via deps). */
export function run(argv: readonly string[], deps: CliDeps = {}): number {
  const log = deps.log ?? ((s: string) => console.log(s));
  const parsed = parseArgs(argv);

  if (wantsHelp(parsed)) {
    log(helpText());
    return 0;
  }

  const repoRoot = deps.runtime?.repoRoot ?? findRepoRoot(process.cwd());
  const fs = deps.fs ?? defaultFsDeps(repoRoot);
  const runner = deps.runner ?? defaultRunner;
  const availableScripts = deps.availableScripts ?? loadAvailableScripts(fs);

  switch (parsed.command) {
    case "status": {
      const runtime = deps.runtime ?? { nodeVersion: process.version, platform: process.platform, cwd: process.cwd(), repoRoot };
      log(renderStatus(collectStatus(runtime, fs)));
      return 0;
    }

    case "verify": {
      const flags = { run: parsed.flags.run === true, withTests: parsed.flags["with-tests"] === true };
      const plan = buildVerifyPlan(flags);
      const outcome = plan.mode === "run" ? executeVerify(plan, runner, availableScripts) : null;
      log(renderVerify(plan, outcome));
      return outcome && !outcome.allPassed ? 1 : 0;
    }

    case "mcp": {
      if (parsed.subcommand !== "smoke") {
        log(`Unknown 'mcp' subcommand: '${parsed.subcommand ?? ""}'. Try: chainreact mcp smoke`);
        return 2;
      }
      const result = runMcpSmoke({ dryRun: parsed.flags["dry-run"] === true }, runner, availableScripts);
      log(renderMcpSmoke(result));
      return result.status === 0 ? 0 : 1;
    }

    case "app": {
      if (parsed.subcommand !== "validate") {
        log(`Unknown 'app' subcommand: '${parsed.subcommand ?? ""}'. Try: chainreact app validate <provider>`);
        return 2;
      }
      const result = validateProvider(parsed.positionals[0] ?? "", fs);
      log(renderValidation(result));
      return result.ok ? 0 : 1;
    }

    default:
      log(`Unknown command: '${parsed.command}'.\n\n${helpText()}`);
      return 2;
  }
}

if (require.main === module) {
  process.exit(run(process.argv.slice(2)));
}
