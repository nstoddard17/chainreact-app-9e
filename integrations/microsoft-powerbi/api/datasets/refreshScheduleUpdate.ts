import { powerbiFetch } from "../_base";

/**
 * Wrapper for Power BI
 * `PATCH /v1.0/myorg/groups/{groupId}/datasets/{datasetId}/refreshSchedule`
 * (Update Refresh Schedule In Group).
 *
 * Body: `{ value: {...} }` with ONLY the provided fields. The caller must
 * be the dataset owner. `notifyOption` here is `ScheduleNotifyOption` —
 * MailOnFailure | NoNotification only (NO MailOnCompletion, unlike the
 * refresh POST). `localTimeZoneId` is a WINDOWS time-zone id ("Pacific
 * Standard Time"), not an IANA name.
 *
 * NOTE: research.md documents "a disable request (enabled: false) must
 * contain no other changes". Whether re-sending the CURRENT notifyOption
 * alongside `enabled: false` counts as a "change" is not documented —
 * this wrapper sends exactly what it is given and lets any provider
 * rejection propagate to the engine.
 */

export type PowerBiScheduleDay =
  | "Sunday"
  | "Monday"
  | "Tuesday"
  | "Wednesday"
  | "Thursday"
  | "Friday"
  | "Saturday";

export interface RefreshScheduleUpdateInput {
  accessToken: string;
  groupId: string;
  datasetId: string;
  enabled: boolean;
  notifyOption: "MailOnFailure" | "NoNotification";
  days?: PowerBiScheduleDay[];
  /** "HH:MM" local times; slot-count limit depends on capacity tier. */
  times?: string[];
  /** WINDOWS time-zone id, e.g. "Pacific Standard Time" or "UTC". */
  localTimeZoneId?: string;
}

export async function refreshScheduleUpdate(
  input: RefreshScheduleUpdateInput,
): Promise<void> {
  const value: Record<string, unknown> = {
    enabled: input.enabled,
    notifyOption: input.notifyOption,
  };
  if (input.days !== undefined) value.days = input.days;
  if (input.times !== undefined) value.times = input.times;
  if (input.localTimeZoneId !== undefined) {
    value.localTimeZoneId = input.localTimeZoneId;
  }

  await powerbiFetch({
    accessToken: input.accessToken,
    method: "PATCH",
    path: `/groups/${encodeURIComponent(input.groupId)}/datasets/${encodeURIComponent(
      input.datasetId,
    )}/refreshSchedule`,
    body: { value },
    notFoundResource: `semantic model ${input.datasetId}`,
    operation: "dataset refreshSchedule PATCH",
  });
}
