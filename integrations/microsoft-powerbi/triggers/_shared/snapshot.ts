/**
 * Shared snapshot helpers for the Power BI polling triggers.
 *
 * Two families live here because the provider's two trigger shapes need
 * different diff semantics:
 *
 *   1. SEEN-ID snapshots (refresh / job-lifecycle triggers). The provider
 *      exposes a bounded, newest-first job history (refreshes, dataflow
 *      transactions, imports, pipeline operations). A trigger watches for
 *      entries that reached ONE terminal status (`Completed` / `Failed` /
 *      `Cancelled` / `Succeeded`) and remembers the ids it has already
 *      accounted for. The snapshot deliberately stores only the ids that
 *      ALREADY MATCHED the trigger's target status — an in-flight job is
 *      never seeded, so it still fires when it later reaches that status
 *      (that is the whole point of the trigger). Each trigger names its
 *      own snapshot key (`seenRequestIds` / `seenTransactionIds` /
 *      `seenImportIds` / `seenOperationIds`) so a config blob is
 *      self-describing; the helpers below operate on the bare id arrays.
 *
 *   2. ID-SET snapshots (state/diff triggers). A flat membership set where
 *      both additions and removals are meaningful (workspace items,
 *      workspace access). `buildIdSetSnapshot` / `findNewIds` /
 *      `findRemovedIds` back those.
 *
 * Dedup note: none of these snapshots key on a timestamp. Every diff is
 * set-difference over DURABLE provider ids, so a re-poll of the same
 * window emits nothing and a snapshot regression still dedupes at the
 * engine boundary via the synthetic event id (see `emitEvent`).
 */

/**
 * Upper bound on a seen-id list. The provider histories we poll are far
 * smaller than this (refreshes ≤60 / 7 days, pipeline operations ≤20), so
 * the cap is a config-size guard rather than a functional window.
 */
export const SEEN_ID_CAP = 200;

export interface IdSetSnapshot {
  ids: string[];
  updatedAt: string;
}

/**
 * Merge the ids observed on this tick into the previously-seen list.
 *
 * `currentNewestFirst` is expected in the provider's own newest-first
 * order; it is placed ahead of the carried-over ids so the `SEEN_ID_CAP`
 * slice drops the OLDEST entries first. Duplicates collapse.
 *
 * NOTE: only the refresh-history endpoint documents its ordering. Imports
 * document no ordering at all, so for that source "newest" means "as the
 * provider returned it" — acceptable because the cap is a size guard, not
 * a correctness boundary (an id that falls out of the provider's own
 * response can never reappear in it).
 */
export function mergeSeenIds(
  previous: readonly string[],
  currentNewestFirst: readonly string[],
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of [...currentNewestFirst, ...previous]) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= SEEN_ID_CAP) break;
  }
  return out;
}

/** Returns the subset of `currentIds` absent from the seen list, order preserved. */
export function selectUnseenIds(
  seen: readonly string[],
  currentIds: readonly string[],
): string[] {
  const known = new Set(seen);
  return currentIds.filter((id) => !known.has(id));
}

/** Build a fresh membership snapshot from an id list. */
export function buildIdSetSnapshot(ids: readonly string[]): IdSetSnapshot {
  return {
    ids: [...ids],
    updatedAt: new Date().toISOString(),
  };
}

/** Ids present in `currentIds` but absent from the previous snapshot. */
export function findNewIds(
  previous: { ids: string[] },
  currentIds: readonly string[],
): string[] {
  const known = new Set(previous.ids);
  const out: string[] = [];
  const emitted = new Set<string>();
  for (const id of currentIds) {
    if (known.has(id) || emitted.has(id)) continue;
    emitted.add(id);
    out.push(id);
  }
  return out;
}

/** Ids present in the previous snapshot but absent from `currentIds`. */
export function findRemovedIds(
  previous: { ids: string[] },
  currentIds: readonly string[],
): string[] {
  const present = new Set(currentIds);
  const out: string[] = [];
  const emitted = new Set<string>();
  for (const id of previous.ids) {
    if (present.has(id) || emitted.has(id)) continue;
    emitted.add(id);
    out.push(id);
  }
  return out;
}
