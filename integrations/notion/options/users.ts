import {
  IntegrationActionRequiredError,
  refreshAndRetry,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import {
  OptionsResolverError,
  type OptionsResolver,
} from "@/services/options/types";
import { usersList } from "@/integrations/notion/api/users";

/**
 * `notion:users` options resolver.
 *
 * Backs the `userId` picker on `notion:get_user` (the schema's id-only
 * contract explicitly tells authors to "compose list_users upstream and
 * select an id" — this is that picker). Account-scoped, no deps.
 *
 * Read-only: `GET /v1/users` (the same endpoint `list_users` uses). One
 * bounded page (100). Reuses `usersList` so there is no second transport.
 * Notion OAuth tokens refresh through `refreshAndRetry` (provider "notion").
 *
 * Mapping (Notion user → OptionItem):
 *   - `value`: `id`.
 *   - `label`: `name` when non-empty, else the bot workspace name, else id.
 *   - `description`: the user `type` ("person" / "bot") when present.
 * NO email is read or surfaced (person email is a separate Notion capability
 * and is never needed to pick a user id).
 */
export const notionUsersResolver: OptionsResolver = {
  source: "notion:users",
  provider: "notion",
  requiresIntegration: true,
  async resolve(ctx) {
    if (!ctx.integration) {
      throw new OptionsResolverError(
        "INTEGRATION_DISCONNECTED",
        "No active Notion integration. Connect Notion first.",
      );
    }
    const integration = ctx.integration;

    let response;
    try {
      response = await refreshAndRetry({
        accountId: integration.accountId,
        provider: "notion",
        providerAccountId: integration.providerAccountId,
        apiCall: (accessToken) => usersList({ accessToken, pageSize: 100 }),
      });
    } catch (err) {
      if (
        err instanceof IntegrationActionRequiredError ||
        err instanceof Unauthorized401Error
      ) {
        throw new OptionsResolverError(
          "INTEGRATION_DISCONNECTED",
          "Reconnect Notion and try again.",
        );
      }
      throw new OptionsResolverError(
        "PROVIDER_ERROR",
        "Couldn't load Notion users. Try again.",
      );
    }

    const items: Array<{ value: string; label: string; description?: string }> = [];
    for (const u of response.results) {
      if (typeof u.id !== "string" || u.id.length === 0) continue;
      const label =
        (typeof u.name === "string" && u.name.length > 0 && u.name) ||
        (typeof u.bot?.workspace_name === "string" && u.bot.workspace_name.length > 0 && u.bot.workspace_name) ||
        u.id;
      items.push(u.type ? { value: u.id, label, description: u.type } : { value: u.id, label });
    }

    const lowerQ = ctx.q.toLowerCase();
    const filtered =
      lowerQ.length > 0
        ? items.filter((item) => item.label.toLowerCase().includes(lowerQ))
        : items;

    return { items: filtered, hasMore: response.has_more };
  },
};
