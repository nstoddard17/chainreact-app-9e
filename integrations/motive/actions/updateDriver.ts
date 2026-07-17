import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import {
  driverUpdate,
  type DriverUpdateFields,
} from "@/integrations/_shared/motive/api/drivers";
import { resolveCompany } from "./_resolveCompany";
import { UpdateDriverConfigSchema } from "./updateDriver.schema";

/**
 * Motive `update_driver` action handler — MOTIVE-1.
 *
 * `PUT /v1/users/{id}` via the typed wrapper under `refreshAndRetry`.
 * `driverId` is a URL path id — passed as a string, NOT coerced. Only the
 * provided fields are sent (the wrapper omits `undefined`). Output is the shared
 * bounded driver projection — never the raw record.
 */
export const updateDriver: ActionHandler = async (input) => {
  const config = UpdateDriverConfigSchema.parse(input.config);
  const { providerAccountId } = await resolveCompany(input);

  const fields: DriverUpdateFields = {};
  if (config.firstName !== undefined) fields.firstName = config.firstName;
  if (config.lastName !== undefined) fields.lastName = config.lastName;
  if (config.phone !== undefined) fields.phone = config.phone;
  if (config.email !== undefined) fields.email = config.email;
  if (config.status !== undefined) fields.status = config.status;

  const driver = await refreshAndRetry({
    accountId: input.accountId,
    provider: "motive",
    providerAccountId,
    apiCall: (accessToken) =>
      driverUpdate({ accessToken, driverId: config.driverId, fields }),
  });

  return { output: { ...driver } };
};
