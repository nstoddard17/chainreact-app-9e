import type { TriggerEvent } from "@/contracts/triggerEvent";
import { getActiveForExecution } from "@/repositories/integrations";
import * as triggerResourcesRepo from "@/repositories/triggerResources";
import type { TriggerResourceRecord } from "@/repositories/triggerResources";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { spreadsheetsGet } from "../../api/spreadsheetsGet";
import {
  buildWorksheetListSnapshot,
  findNewWorksheets,
  type WorksheetListSnapshot,
} from "../_shared/snapshot";
import { normalize } from "./normalize";

/**
 * Pull the worksheet-list delta for an inbound notification.
 *
 * The receive route fires this when a Drive `files.watch`
 * notification arrives on the channel registered for a
 * `new_worksheet` trigger. The cron renewal cron and dedup
 * infrastructure are shared with `row_changed`.
 *
 * Algorithm:
 *   1. Read `spreadsheets.get` (includeGridData=false).
 *   2. Diff current worksheet names against the persisted snapshot.
 *   3. Emit one event per new name. Rename = `{remove old, add new}`
 *      and fires one event for the new name (matches V1 + Excel).
 *   4. Persist updated snapshot. Failure propagates — receive route
 *      returns 5xx and Google retries; the snapshot is unchanged so
 *      the next attempt re-detects the same news.
 */
export interface PullResult {
  events: TriggerEvent[];
  resyncRequired: boolean;
}

interface NewWorksheetTriggerConfig {
  spreadsheetId?: string;
  worksheetSnapshot?: WorksheetListSnapshot;
}

export async function pull(
  trigger: TriggerResourceRecord,
): Promise<PullResult> {
  const config = trigger.config as NewWorksheetTriggerConfig;

  if (!config.spreadsheetId) {
    return { events: [], resyncRequired: true };
  }
  // Absent baseline means activate didn't run or persisted partial
  // state — treat as resync rather than emit events for every
  // existing sheet.
  if (!config.worksheetSnapshot) {
    console.warn(
      JSON.stringify({
        event: "sheets.pull.no_worksheet_snapshot",
        triggerId: trigger.id,
        workflowId: trigger.workflowId,
      }),
    );
    return { events: [], resyncRequired: true };
  }

  const integration = await getActiveForExecution(
    trigger.userId,
    trigger.provider,
    trigger.accountId,
  );
  if (!integration) {
    return { events: [], resyncRequired: false };
  }

  const metadata = await refreshAndRetry({
    userId: integration.userId,
    provider: "google-sheets",
    accountId: integration.providerAccountId,
    apiCall: (accessToken) =>
      spreadsheetsGet({
        accessToken,
        spreadsheetId: config.spreadsheetId!,
        fields: "sheets(properties(sheetId,title,index,sheetType))",
      }),
  });

  const currentSheets = (metadata.sheets ?? [])
    .map((s) => s.properties)
    .filter((p): p is NonNullable<typeof p> => Boolean(p))
    .filter((p): p is typeof p & { title: string } =>
      typeof p.title === "string" && p.title.length > 0,
    );
  const currentNames = currentSheets.map((p) => p.title);

  const previousSnapshot = config.worksheetSnapshot;
  const newNames = findNewWorksheets(previousSnapshot, currentNames);

  const occurredAt = new Date().toISOString();
  const events: TriggerEvent[] = [];
  for (const name of newNames) {
    const props = currentSheets.find((p) => p.title === name);
    if (!props) continue; // Defensive: name in newNames but properties missing.
    if (props.sheetId === undefined || props.sheetId === null) {
      // Sheets API ALWAYS returns a sheetId per sheet; absence is a
      // canary for a malformed response. Skip + log so the workflow
      // doesn't fire with a degenerate eventId.
      console.warn(
        JSON.stringify({
          event: "sheets.pull.worksheet_missing_sheet_id",
          triggerId: trigger.id,
          workflowId: trigger.workflowId,
          worksheetName: name,
        }),
      );
      continue;
    }
    events.push(
      normalize(
        {
          sheetId: props.sheetId,
          worksheetName: name,
          index: typeof props.index === "number" ? props.index : null,
          sheetType: typeof props.sheetType === "string" ? props.sheetType : null,
          occurredAt,
        },
        {
          accountId: integration.providerAccountId,
          spreadsheetId: config.spreadsheetId!,
        },
      ),
    );
  }

  // Always persist the new snapshot — even when zero events emitted
  // (set-difference handled re-orderings + deletions; persisting
  // keeps the baseline aligned with reality so the next pull doesn't
  // re-diff against stale state).
  await triggerResourcesRepo.updateConfig(trigger.id, {
    ...config,
    worksheetSnapshot: buildWorksheetListSnapshot({ names: currentNames }),
  });

  return { events, resyncRequired: false };
}
