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
import { runAppActionRegister } from "./commands/appActionRegister";
import { runAppActionScaffold } from "./commands/appActionScaffold";
import { listProviders, renderProviderList } from "./commands/appList";
import { runAppRegister } from "./commands/appRegister";
import { runAppScaffold } from "./commands/appScaffold";
import {
  renderValidation,
  renderValidationSummary,
  validateAllProviders,
  validateProvider,
} from "./commands/appValidate";
import { renderMcpSmoke, runMcpSmoke } from "./commands/mcpSmoke";
import { collectStatus, renderStatus } from "./commands/status";
import { buildVerifyPlan, executeVerify, renderVerify } from "./commands/verify";
import { helpText } from "./help";
import { defaultFsDeps, defaultFsWriter, findRepoRoot, type FsDeps, type FsWriter } from "./repo";
import { type CommandRunner, defaultRunner } from "./runner";

export interface CliDeps {
  readonly fs?: FsDeps;
  readonly writer?: FsWriter;
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
  const writer = deps.writer ?? defaultFsWriter(repoRoot);
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
      if (parsed.subcommand === "list") {
        log(renderProviderList(listProviders(fs)));
        return 0;
      }
      if (parsed.subcommand === "scaffold") {
        const provider = parsed.positionals[0] ?? "";
        if (!provider) {
          log("Usage: chainreact app scaffold <provider> [--dry-run] [--register]");
          return 2;
        }
        const outcome = runAppScaffold(
          provider,
          { dryRun: parsed.flags["dry-run"] === true, register: parsed.flags.register === true },
          fs,
          writer,
        );
        log(outcome.output);
        return outcome.code;
      }
      if (parsed.subcommand === "register") {
        const provider = parsed.positionals[0] ?? "";
        if (!provider) {
          log("Usage: chainreact app register <provider> [--dry-run]");
          return 2;
        }
        const outcome = runAppRegister(provider, { dryRun: parsed.flags["dry-run"] === true }, fs, writer);
        log(outcome.output);
        return outcome.code;
      }
      if (parsed.subcommand === "action") {
        // `app action <scaffold|register> <provider> <action>` — positionals are
        // [sub, provider, action] (the parser only peels one subcommand token).
        const sub = parsed.positionals[0] ?? "";
        const provider = parsed.positionals[1] ?? "";
        const action = parsed.positionals[2] ?? "";
        const dryRun = parsed.flags["dry-run"] === true;
        if (sub === "scaffold") {
          if (!provider || !action) {
            log("Usage: chainreact app action scaffold <provider> <action> [--dry-run]");
            return 2;
          }
          const outcome = runAppActionScaffold(provider, action, { dryRun }, fs, writer);
          log(outcome.output);
          return outcome.code;
        }
        if (sub === "register") {
          if (!provider || !action) {
            log("Usage: chainreact app action register <provider> <action> [--dry-run]");
            return 2;
          }
          const outcome = runAppActionRegister(provider, action, { dryRun }, fs, writer);
          log(outcome.output);
          return outcome.code;
        }
        log(`Unknown 'app action' subcommand: '${sub}'. Try: chainreact app action scaffold <provider> <action> | chainreact app action register <provider> <action>`);
        return 2;
      }
      if (parsed.subcommand === "validate") {
        if (parsed.flags.all === true) {
          const results = validateAllProviders(fs);
          log(renderValidationSummary(results, { verbose: parsed.flags.verbose === true }));
          return results.every((r) => r.ok) ? 0 : 1;
        }
        const provider = parsed.positionals[0] ?? "";
        if (!provider) {
          log("Usage: chainreact app validate <provider> | chainreact app validate --all [--verbose]");
          return 2;
        }
        const result = validateProvider(provider, fs);
        log(renderValidation(result));
        return result.ok ? 0 : 1;
      }
      log(`Unknown 'app' subcommand: '${parsed.subcommand ?? ""}'. Try: chainreact app list | chainreact app validate <provider> | chainreact app validate --all | chainreact app scaffold <provider> [--register] | chainreact app register <provider> | chainreact app action scaffold <provider> <action>`);
      return 2;
    }

    default:
      log(`Unknown command: '${parsed.command}'.\n\n${helpText()}`);
      return 2;
  }
}

if (require.main === module) {
  process.exit(run(process.argv.slice(2)));
}
