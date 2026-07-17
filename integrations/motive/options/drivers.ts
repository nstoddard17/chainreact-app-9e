import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import type { OptionItem, OptionsResolver } from "@/services/options/types";
import { driverList } from "@/integrations/_shared/motive/api/drivers";
import {
  filterAndSortByLabel,
  mapMotiveOptionsError,
  requireMotiveIntegration,
} from "./_shared";

/**
 * `motive:drivers` options resolver — MOTIVE-1.
 *
 * Backs the driver pickers on the driver actions/triggers. One bounded page
 * of drivers; the V2 posture for ≤100-row catalogs is local `ctx.q` filtering
 * (Calendly/QuickBooks precedent). Values are Motive driver ids. Labels are
 * the driver's name, with the email appended in parentheses to disambiguate
 * duplicate names — email in a driver label is the account-provider posture
 * (same as other account resolvers) and never leaks tokens/owner-ids.
 */
const PAGE_SIZE = 100;

export const motiveDriversResolver: OptionsResolver = {
  source: "motive:drivers",
  provider: "motive",
  requiresIntegration: true,
  async resolve(ctx) {
    const integration = requireMotiveIntegration(ctx);

    let drivers;
    try {
      drivers = await refreshAndRetry({
        accountId: integration.accountId,
        provider: "motive",
        providerAccountId: integration.providerAccountId,
        apiCall: (accessToken) => driverList({ accessToken, perPage: PAGE_SIZE }),
      });
    } catch (err) {
      mapMotiveOptionsError(err, "drivers");
    }

    const items: OptionItem[] = [];
    for (const driver of drivers) {
      if (!driver.driverId) continue;
      const name = [driver.firstName?.trim(), driver.lastName?.trim()]
        .filter((part): part is string => !!part && part.length > 0)
        .join(" ")
        .trim();
      const email = driver.email?.trim();
      let label: string;
      if (name.length > 0) {
        label = email ? `${name} (${email})` : name;
      } else {
        label = email || driver.username?.trim() || driver.driverId;
      }
      items.push({ value: driver.driverId, label });
    }

    return {
      items: filterAndSortByLabel(items, ctx.q),
      hasMore: drivers.length === PAGE_SIZE,
    };
  },
};
