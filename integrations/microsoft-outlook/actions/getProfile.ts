import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { getMailboxProfile } from "../api/getMailboxProfile";
import { GetProfileConfigSchema } from "./getProfile.schema";

/**
 * Microsoft Outlook `get_profile` action handler (Slice 4.OUTLOOK-READ-1).
 *
 * Read-only. Calls the provider-local `getMailboxProfile` wrapper (proper
 * 401 -> Unauthorized401Error) behind `refreshAndRetry` (Q3); GET-shaped so
 * no idempotency concern.
 *
 * Output is bounded and explicitly projected — the raw Graph envelope is
 * never spread. `mail` / `userPrincipalName` / `displayName` are the
 * connected account's own identity (PII) and are marked sensitive in the
 * meta so the run-detail API redacts them. `id` is the immutable Azure
 * object GUID (structural). No mailbox contents are read.
 */
export const getProfile: ActionHandler = async (input) => {
  GetProfileConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "microsoft-outlook"
      ? input.triggerEvent.providerAccountId
      : null;

  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "microsoft-outlook",
    providerAccountId,
    apiCall: (accessToken) => getMailboxProfile({ accessToken }),
  });

  return {
    output: {
      id: result.id ?? null,
      mail: result.mail ?? null,
      userPrincipalName: result.userPrincipalName ?? null,
      displayName: result.displayName ?? null,
    },
  };
};
