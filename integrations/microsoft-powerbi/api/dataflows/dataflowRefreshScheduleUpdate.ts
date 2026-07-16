import { powerbiFetch } from "../_base";

/**
 * Wrapper for Power BI
 * `PATCH /v1.0/myorg/groups/{groupId}/dataflows/{dataflowId}/refreshSchedule`
 * (Update Refresh Schedule — dataflow).
 *
 * Body is `{"value": {...}}` carrying ONLY the fields the caller
 * provided ("creates or updates" — PATCH semantics; absent fields keep
 * their provider-side values). `notifyOption` for dataflow schedules is
 * `NoNotification` | `MailOnFailure` only. `localTimeZoneId` is a
 * Windows time-zone id (e.g. `UTC`, `Pacific Standard Time`).
 *
 * Success is HTTP 200 with no meaningful body.
 */

export type DataflowScheduleDay =
  | "Sunday"
  | "Monday"
  | "Tuesday"
  | "Wednesday"
  | "Thursday"
  | "Friday"
  | "Saturday";

export interface DataflowRefreshScheduleUpdateInput {
  accessToken: string;
  groupId: string;
  dataflowId: string;
  enabled: boolean;
  notifyOption: "MailOnFailure" | "NoNotification";
  days?: DataflowScheduleDay[];
  /** "HH:MM" local times. */
  times?: string[];
  /** Windows time-zone id. */
  localTimeZoneId?: string;
}

export async function dataflowRefreshScheduleUpdate(
  input: DataflowRefreshScheduleUpdateInput,
): Promise<void> {
  const value: Record<string, unknown> = {
    enabled: input.enabled,
    notifyOption: input.notifyOption,
  };
  if (input.days !== undefined) value.days = input.days;
  if (input.times !== undefined) value.times = input.times;
  if (input.localTimeZoneId !== undefined)
    value.localTimeZoneId = input.localTimeZoneId;

  await powerbiFetch({
    accessToken: input.accessToken,
    method: "PATCH",
    path: `/groups/${encodeURIComponent(input.groupId)}/dataflows/${encodeURIComponent(
      input.dataflowId,
    )}/refreshSchedule`,
    body: { value },
    notFoundResource: `dataflow ${input.dataflowId}`,
    operation: "dataflow refresh schedule PATCH",
  });
}
