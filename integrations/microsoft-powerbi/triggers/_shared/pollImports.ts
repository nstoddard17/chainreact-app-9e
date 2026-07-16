import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import {
  importsList,
  type PowerBiImportSummary,
} from "../../api/imports/importsList";
import { importGet } from "../../api/imports/importGet";
import { mergeSeenIds } from "./snapshot";
import { PowerBiImportCompletedConfigSchema } from "../importCompleted/schema";
import { PowerBiImportFailedConfigSchema } from "../importFailed/schema";
import {
  emitEvent,
  persistSnapshot,
  statusEquals,
  warnMissingSnapshot,
  type PowerBiPollInput,
} from "./pollShared";

/**
 * The workspace-import domain: the two `import_*` triggers' state predicate
 * and their single poll function.
 *
 * `matchingImports` is exported because activation and polling MUST agree
 * on what "matches this trigger" means — `activate.ts` seeds the snapshot
 * with exactly the import ids this poll function would emit for, so a
 * divergence would either replay history on the first tick or swallow it.
 *
 * Diff shape and snapshot contract mirror the sibling job-lifecycle
 * modules (see `pollSemanticModelRefreshes.ts` for the full rationale):
 * only ids that ALREADY matched the terminal state enter the snapshot, so
 * an in-flight import still fires when it settles.
 */

export type ImportEventType = "import_completed" | "import_failed";

/** Terminal `Import.importState` each import trigger watches for (research.md §2.3). */
const IMPORT_TARGET_STATE: Record<ImportEventType, string> = {
  import_completed: "Succeeded",
  import_failed: "Failed",
};

/** Workspace imports in this trigger's terminal state. */
export function matchingImports(
  imports: readonly PowerBiImportSummary[],
  eventType: ImportEventType,
): PowerBiImportSummary[] {
  const target = IMPORT_TARGET_STATE[eventType];
  return imports.filter((i) => statusEquals(i.importState, target));
}

const IMPORT_SCHEMAS = {
  import_completed: PowerBiImportCompletedConfigSchema,
  import_failed: PowerBiImportFailedConfigSchema,
} as const;

export async function pollImports(
  input: PowerBiPollInput & { eventType: ImportEventType },
): Promise<void> {
  const { trigger, providerAccountId, now, eventType } = input;
  const config = IMPORT_SCHEMAS[eventType].parse(trigger.config);

  if (!config.snapshot) {
    warnMissingSnapshot(trigger, eventType);
    return;
  }

  const imports = await refreshAndRetry({
    accountId: trigger.workflowAccountId!,
    provider: "microsoft-powerbi",
    providerAccountId,
    apiCall: (accessToken) =>
      importsList({ accessToken, groupId: config.workspaceId }),
  });

  const matching = matchingImports(imports, eventType);
  const seen = new Set(config.snapshot.seenImportIds);

  for (const summary of matching) {
    if (seen.has(summary.id)) continue;
    seen.add(summary.id);

    // NOTE: Get Imports In Group does not surface createdDateTime /
    // updatedDateTime — only Get Import In Group does (research.md §2.3).
    // Each NEWLY-matching import is therefore enriched with one extra
    // read. Bounded: this runs only for ids not already in the snapshot,
    // which is zero on a steady-state tick.
    const detail = await refreshAndRetry({
      accountId: trigger.workflowAccountId!,
      provider: "microsoft-powerbi",
      providerAccountId,
      apiCall: (accessToken) =>
        importGet({
          accessToken,
          groupId: config.workspaceId,
          importId: summary.id,
        }),
    });

    await emitEvent({
      trigger,
      providerAccountId,
      eventType,
      key: summary.id,
      payload: {
        workspaceId: config.workspaceId,
        importId: summary.id,
        name: summary.name,
        importState: summary.importState,
        createdDateTime: detail.createdDateTime,
        updatedDateTime: detail.updatedDateTime,
      },
    });
  }

  await persistSnapshot({
    triggerId: trigger.id,
    config,
    snapshot: {
      seenImportIds: mergeSeenIds(
        config.snapshot.seenImportIds,
        matching.map((i) => i.id),
      ),
      updatedAt: new Date().toISOString(),
    },
    now,
  });
}
