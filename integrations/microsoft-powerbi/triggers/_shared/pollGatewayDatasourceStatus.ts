import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { gatewayDatasourceStatusGet } from "../../api/gateways/gatewayDatasourceStatusGet";
import { PowerBiGatewayDatasourceStatusChangedConfigSchema } from "../gatewayDatasourceStatusChanged/schema";
import {
  emitEvent,
  persistSnapshot,
  warnMissingSnapshot,
  type PowerBiPollInput,
} from "./pollShared";

/**
 * The gateway-datasource domain: the single
 * `gateway_datasource_status_changed` trigger, which diffs connectivity
 * state rather than a list of provider entities.
 *
 * It is its own module because it is the only trigger whose "state" is a
 * two-field status read — it shares no fetch, predicate, or snapshot shape
 * with the DAX or workspace diffs.
 *
 * Shared invariants (mirroring `integrations/microsoft-excel/triggers/_shared`):
 *   - The snapshot MUST already exist (activation seeded it). A missing
 *     snapshot logs + skips — never re-seeds silently, which would swallow
 *     every transition since activation.
 *   - The dedup key is derived from durable state, never a timestamp, so
 *     two identical ticks dedup at the engine boundary.
 *   - The payload carries a fixed key set: short error codes only, never a
 *     raw provider body.
 */

/**
 * Fires on a connectivity transition. `gatewayDatasourceStatusGet` treats
 * "unreachable" as a RESULT (`{online:false, errorCode}`), not a throw, so
 * the diff is a plain state comparison:
 *   - `online` flipped → fire.
 *   - still offline but the error code changed → fire (the failure mode
 *     itself changed, e.g. gateway-unreachable → credentials-invalid).
 *   - still online (errorCode always null) → no event.
 */
export async function pollGatewayDatasourceStatusChanged(
  input: PowerBiPollInput,
): Promise<void> {
  const { trigger, providerAccountId, now } = input;
  const config = PowerBiGatewayDatasourceStatusChangedConfigSchema.parse(
    trigger.config,
  );

  if (!config.snapshot) {
    warnMissingSnapshot(trigger, "gateway_datasource_status_changed");
    return;
  }

  const status = await refreshAndRetry({
    accountId: trigger.workflowAccountId!,
    provider: "microsoft-powerbi",
    providerAccountId,
    apiCall: (accessToken) =>
      gatewayDatasourceStatusGet({
        accessToken,
        gatewayId: config.gatewayId,
        datasourceId: config.datasourceId,
      }),
  });

  const previous = config.snapshot;
  const changed =
    status.online !== previous.online ||
    (!status.online && status.errorCode !== previous.errorCode);

  if (changed) {
    await emitEvent({
      trigger,
      providerAccountId,
      eventType: "gateway_datasource_status_changed",
      key: `${status.online}:${status.errorCode ?? "none"}`,
      payload: {
        gatewayId: config.gatewayId,
        datasourceId: config.datasourceId,
        online: status.online,
        errorCode: status.errorCode,
        previousOnline: previous.online,
      },
    });
  }

  await persistSnapshot({
    triggerId: trigger.id,
    config,
    snapshot: {
      online: status.online,
      errorCode: status.errorCode,
      updatedAt: new Date().toISOString(),
    },
    now,
  });
}
