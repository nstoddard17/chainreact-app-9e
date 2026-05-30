import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { ownersList } from "../../_shared/hubspot/api/owners";
import { GetOwnersConfigSchema } from "./getOwners.schema";

/**
 * HubSpot `get_owners` action handler — Slice 13 Batch 2.
 *
 * GETs `/crm/v3/owners` with optional email + limit + after.
 *
 * Output:
 *   { owners, count, nextCursor, hasMore }
 *
 *   `owners` is an array of `{ id, email, firstName, lastName, userId,
 *   createdAt, updatedAt }`. Workflows use `id` (the owner id, NOT
 *   `userId`) as `hubspot_owner_id` on contacts / companies / deals /
 *   tickets / engagements.
 */
export const getOwners: ActionHandler = async (input) => {
  const config = GetOwnersConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "hubspot"
      ? input.triggerEvent.providerAccountId
      : null;

  const response = await refreshAndRetry({
    accountId: input.accountId,
    provider: "hubspot",
    providerAccountId,
    apiCall: (accessToken) =>
      ownersList({
        accessToken,
        limit: config.limit ?? 100,
        ...(config.email ? { email: config.email } : {}),
        ...(config.after ? { after: config.after } : {}),
      }),
  });

  const owners = response.results.map((o) => ({
    id: o.id,
    email: o.email ?? null,
    firstName: o.firstName ?? null,
    lastName: o.lastName ?? null,
    userId: o.userId ?? null,
    createdAt: o.createdAt ?? null,
    updatedAt: o.updatedAt ?? null,
  }));
  const nextCursor = response.paging?.next?.after ?? null;
  return {
    output: {
      owners,
      count: owners.length,
      nextCursor,
      hasMore: nextCursor !== null,
    },
  };
};
