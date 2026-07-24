import type { ActionHandler } from "@/services/execution/handlers/types";
import { fleetioCreateMeterEntry } from "../api/meterEntries";
import { runFleetioApiCall } from "../execute";
import { CreateMeterEntryConfigSchema } from "./createMeterEntry.schema";
import { toCreateMeterEntryOutput } from "./createMeterEntry.output";

/**
 * `fleetio:create_meter_entry` action handler (FLEETIO-4) — the keystone of the
 * trucking wedge: a telematics meter reading (e.g. a Motive odometer value)
 * becomes a Fleetio Meter Entry, which is what drives Fleetio's preventive-
 * maintenance scheduling.
 *
 * `POST /meter_entries` via the typed wrapper under `runFleetioApiCall` (the
 * shared execution seam: canonical account-scoped integration lookup +
 * two-credential decode at the immediate call boundary + non-refreshable
 * 401→reconnect). Config is already fully resolved by the engine (Q2), so
 * `vehicleId` / `value` / `readingDate` are concrete whether picked or mapped
 * from an upstream Motive or Fleetio step. The strict schema converts to
 * Fleetio's wire types ONLY after validation.
 *
 * **Write-safety.** Creating a Meter Entry is NOT idempotent — the same reading
 * posted twice creates two entries, and Fleetio publishes no idempotency key for
 * this endpoint (the 2025-05-05 schema carries `idempotency_key` on Faults only;
 * none is invented here). So: exactly ONE provider call per invocation, the
 * shared wrapper never auto-replays a POST on 429 / 5xx / timeout / network
 * failure, and the engine invokes a handler exactly once. A timeout after the
 * request was transmitted is an UNKNOWN outcome — the thrown transient error
 * deliberately does NOT claim that no meter entry was created.
 *
 * Errors are typed and propagate to the engine (no `{success:false}` envelope);
 * a malformed 2xx throws rather than fabricating a meter-entry id.
 */
export const createMeterEntry: ActionHandler = async (input) => {
  const config = CreateMeterEntryConfigSchema.parse(input.config);

  const entry = await runFleetioApiCall({
    accountId: input.accountId,
    apiCall: (credentials) =>
      fleetioCreateMeterEntry({
        apiKey: credentials.apiKey,
        accountToken: credentials.accountToken,
        // Validated positive-integer string → numeric wire type (API layer only).
        vehicleId: Number(config.vehicleId),
        value: config.value,
        date: config.readingDate,
        secondaryMeter: config.meterType === "secondary",
      }),
  });

  // Spread into a fresh literal so the bounded projection satisfies the engine's
  // Record<string, unknown> output contract (Get Vehicle / Update Status precedent).
  return { output: { ...toCreateMeterEntryOutput(entry) } };
};
