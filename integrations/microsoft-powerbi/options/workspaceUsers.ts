import {
  IntegrationActionRequiredError,
  refreshAndRetry,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import {
  OptionsResolverError,
  type OptionsResolver,
} from "@/services/options/types";
import { NotFoundError } from "@/integrations/microsoft-powerbi/api/errors";
import { groupUsersList } from "@/integrations/microsoft-powerbi/api/groups/groupUsersList";

/**
 * `microsoft-powerbi:workspace_users` options resolver.
 *
 * Backs the `principalIdentifier` field on `remove_workspace_user`.
 * **Dep name `workspaceId` is pinned verbatim** to the runtime Zod
 * schemas (camelCase) — meta fields wire `dependsOn: "workspaceId"`.
 *
 * Value = `identifier ?? emailAddress` — whichever the row carries; that
 * exact string is what the provider's DELETE path segment accepts. Label
 * = `<displayName ?? email> · <accessRight>`. No principal metadata
 * beyond what the label needs is surfaced. Cascade fallback: a deleted
 * parent workspace throws `NotFoundError` → empty items (not an error).
 */
export const microsoftPowerBiWorkspaceUsersResolver: OptionsResolver = {
  source: "microsoft-powerbi:workspace_users",
  provider: "microsoft-powerbi",
  requiresIntegration: true,
  requiredDeps: ["workspaceId"],
  async resolve(ctx) {
    if (!ctx.integration) {
      throw new OptionsResolverError(
        "INTEGRATION_DISCONNECTED",
        "No active Microsoft Power BI integration. Connect Power BI first.",
      );
    }
    const integration = ctx.integration;

    const workspaceId = ctx.deps.workspaceId;
    if (typeof workspaceId !== "string" || workspaceId.length === 0) {
      throw new OptionsResolverError(
        "MISSING_DEPENDENCY",
        "Select a workspace first.",
      );
    }

    let users;
    try {
      users = await refreshAndRetry({
        accountId: integration.accountId,
        provider: "microsoft-powerbi",
        providerAccountId: integration.providerAccountId,
        apiCall: (accessToken) =>
          groupUsersList({ accessToken, groupId: workspaceId }),
      });
    } catch (err) {
      if (
        err instanceof IntegrationActionRequiredError ||
        err instanceof Unauthorized401Error
      ) {
        throw new OptionsResolverError(
          "INTEGRATION_DISCONNECTED",
          "Reconnect Microsoft Power BI and try again.",
        );
      }
      if (err instanceof NotFoundError) {
        // Parent workspace no longer exists — empty picker, not an error.
        return { items: [], hasMore: false };
      }
      throw new OptionsResolverError(
        "PROVIDER_ERROR",
        "Couldn't load Power BI workspace users. Try again.",
      );
    }

    const items: Array<{ value: string; label: string }> = [];
    for (const u of users) {
      const value = u.identifier ?? u.emailAddress;
      if (value === null) continue;
      const name = u.displayName ?? u.emailAddress ?? value;
      items.push({
        value,
        label: `${name} · ${u.groupUserAccessRight ?? "Unknown"}`,
      });
    }
    const lowerQ = ctx.q.toLowerCase();
    const filtered =
      lowerQ.length > 0
        ? items.filter((item) => item.label.toLowerCase().includes(lowerQ))
        : items;

    return { items: filtered, hasMore: false };
  },
};
