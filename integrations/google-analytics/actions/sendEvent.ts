import type { ActionHandler } from "@/services/execution/handlers/types";
import { measurementProtocolCollect } from "@/integrations/_shared/google/api/analytics/measurementProtocolCollect";
import { SendEventConfigSchema } from "./sendEvent.schema";

/**
 * Google Analytics `send_event` action handler — Slice 3.GOOGLE-ANALYTICS-2.
 *
 * Ingests a GA4 event via the Measurement Protocol (`mp/collect`). Medium
 * risk (writes an analytics event). The Measurement Protocol authenticates
 * with `apiSecret` + `measurementId` — NOT the OAuth bearer — so this handler
 * does NOT use `refreshAndRetry` (there's no OAuth token to refresh on the
 * MP call).
 *
 * **Security:** `apiSecret`, `clientId`, `userId`, and `eventParams` are
 * sensitive inputs and are NEVER included in the output or any error. The
 * output is structural only: `{ success, eventName, sentAt }`.
 */
export const sendEvent: ActionHandler = async (input) => {
  const config = SendEventConfigSchema.parse(input.config);

  // eventParams may arrive as a JSON string (textarea) or an object
  // (keyvalue). Normalize to an object; a non-JSON string is treated as no
  // params rather than failing the send.
  let eventParams: Record<string, unknown> = {};
  if (typeof config.eventParams === "string") {
    try {
      const parsed = JSON.parse(config.eventParams);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        eventParams = parsed as Record<string, unknown>;
      }
    } catch {
      // not JSON — send no params (do NOT echo the raw string anywhere).
      eventParams = {};
    }
  } else if (config.eventParams && typeof config.eventParams === "object") {
    eventParams = config.eventParams;
  }

  await measurementProtocolCollect({
    measurementId: config.measurementId,
    apiSecret: config.apiSecret,
    clientId: config.clientId,
    eventName: config.eventName,
    eventParams,
    ...(config.userId !== undefined && { userId: config.userId }),
  });

  // Structural-only output — NEVER echo apiSecret / clientId / userId /
  // eventParams.
  return {
    output: {
      success: true,
      eventName: config.eventName,
      sentAt: new Date().toISOString(),
    },
  };
};
