/**
 * Internal ChainReact CLI — `app list` command.
 *
 * Lists every discovered provider with text/file-derived fields only (no provider
 * code is imported): id, display name, enabled state, and action triad + trigger
 * meta counts. Pure over the shared discovery module → deterministic for tests.
 */
import { inventoryAllProviders, type ProviderInfo } from "../providers";
import type { FsDeps } from "../repo";

/** Collect the inventory (sorted by id). Pure over injected deps. */
export function listProviders(fs: FsDeps): ProviderInfo[] {
  return inventoryAllProviders(fs);
}

const enabledLabel = (enabled: boolean | null): string => (enabled === null ? "?" : enabled ? "yes" : "no");

/** registered/unregistered/unknown → yes/no/? (matches the enabled column style). */
const registeredLabel = (status: ProviderInfo["registered"]): string =>
  status === "registered" ? "yes" : status === "unregistered" ? "no" : "?";

/** Render a deterministic, aligned table. Pure. */
export function renderProviderList(infos: readonly ProviderInfo[]): string {
  if (infos.length === 0) {
    return "ChainReact — app list\n\nNo providers discovered under integrations/.";
  }

  const idW = Math.max(2, ...infos.map((i) => i.id.length));
  const nameW = Math.max(12, ...infos.map((i) => (i.displayName ?? "-").length));

  const header = `  ${"id".padEnd(idW)}  ${"displayName".padEnd(nameW)}  enabled  registered  actions  meta  schema  trigMeta`;
  const lines: string[] = [`ChainReact — app list (${infos.length} provider(s))`, "", header];
  for (const i of infos) {
    lines.push(
      `  ${i.id.padEnd(idW)}  ${(i.displayName ?? "-").padEnd(nameW)}  ${enabledLabel(i.enabled).padEnd(7)}  ${registeredLabel(i.registered).padEnd(10)}  ${String(i.counts.actionHandlers).padStart(7)}  ${String(i.counts.actionMetas).padStart(4)}  ${String(i.counts.actionSchemas).padStart(6)}  ${String(i.counts.triggerMetas).padStart(8)}`,
    );
  }
  return lines.join("\n");
}
