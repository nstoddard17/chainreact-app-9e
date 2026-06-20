/**
 * Internal ChainReact CLI — `smoke actions` command (OFFLINE dry-run inventory).
 *
 * Surfaces which registered provider actions have smoke fixtures, which are
 * missing, and which are skipped (and why) — WITHOUT executing anything. Real
 * execution lives in the Jest harness (`tests/integration/smoke-actions`) because
 * running a handler needs the V2 server runtime (the offline CLI never imports
 * app/server code — its standing charter).
 *
 * Pure over injected `FsDeps` + an optional changed-files reader. No execution,
 * no DB, no network.
 */
import { type ChangedFilesReader } from "../git";
import type { FsDeps } from "../repo";
import {
  buildInventory,
  renderInventoryHuman,
  renderInventoryJson,
} from "../smoke/core";
import {
  buildCertificationMatrix,
  renderCertificationHuman,
  renderCertificationJson,
} from "../smoke/certification";
import {
  changedOnlyKeys,
  readRegisteredActions,
  scanFixtures,
} from "../smoke/inventory";

export interface SmokeActionsFlags {
  readonly provider?: string | null;
  readonly all?: boolean;
  readonly json?: boolean;
  readonly changed?: boolean;
  readonly includeDestructive?: boolean;
  /** Render the certification matrix (per-action LIVE_PASS / status) instead of the inventory. */
  readonly cert?: boolean;
}

export interface SmokeActionsOutcome {
  readonly output: string;
  readonly code: number;
}

/**
 * Run the dry-run inventory. Returns the rendered output + an exit code:
 *   - 0 when there are no fixture violations,
 *   - 1 when any fixture is malformed / mis-classified (so CI / a pre-push hook
 *     can gate on it).
 * `--changed` git failure is non-fatal: it falls back to the full inventory with
 * a one-line note (mirrors `verify --changed`).
 */
export function runSmokeActions(
  flags: SmokeActionsFlags,
  fs: FsDeps,
  changedFiles: ChangedFilesReader,
): SmokeActionsOutcome {
  const registered = readRegisteredActions(fs);
  const { descriptors, errors } = scanFixtures(fs);

  const providerFilter = flags.provider && flags.provider.length > 0 ? flags.provider : null;

  // Certification matrix view — enumerate every registered action with its
  // durable certification status (LIVE_PASS = skipped by default in live runs).
  // Exit 1 only on a stale certification (a cert with no registered action).
  if (flags.cert) {
    const matrix = buildCertificationMatrix(registered, descriptors, undefined, { providerFilter });
    return {
      output: flags.json ? renderCertificationJson(matrix) : renderCertificationHuman(matrix),
      code: matrix.staleCerts.length > 0 ? 1 : 0,
    };
  }

  let onlyKeys: Set<string> | null = null;
  let changedNote: string | null = null;
  if (flags.changed) {
    const changed = changedFiles();
    if (!changed.ok) {
      changedNote = `--changed: ${changed.error ?? "git unavailable"} — showing full inventory.`;
    } else {
      onlyKeys = changedOnlyKeys(changed.files, registered);
      if (onlyKeys === null) {
        changedNote = "--changed: no action fixtures or handlers in the local diff.";
      }
    }
  }

  const report = buildInventory(registered, descriptors, {
    providerFilter,
    includeDestructive: flags.includeDestructive === true,
    onlyKeys,
  });

  // Fixture parse errors (malformed fixtures) join the inventory violations so a
  // broken fixture never silently disappears from the report.
  const allViolations = [...errors, ...report.violations].sort();
  const reportWithErrors = { ...report, violations: allViolations };

  const body = flags.json
    ? renderInventoryJson(reportWithErrors)
    : renderInventoryHuman(reportWithErrors);

  const prefix = !flags.json && changedNote ? `${changedNote}\n\n` : "";
  return {
    output: `${prefix}${body}`,
    code: allViolations.length > 0 ? 1 : 0,
  };
}
