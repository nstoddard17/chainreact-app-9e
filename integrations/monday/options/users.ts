import {
  IntegrationActionRequiredError,
  refreshAndRetry,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import {
  OptionsResolverError,
  type OptionsResolver,
} from "@/services/options/types";
import { usersList } from "@/integrations/_shared/monday/api/usersList";

/**
 * `monday:users` options resolver — Slice 3.MONDAY-3.
 *
 * Account-scoped Monday picker. Backs future column-aware payloads
 * (assignee picker for `person` columns, mention pickers) — MONDAY-N
 * polish. Landing the resolver now means MONDAY-4 metas can reference
 * the cascade without a follow-up resolver-registry churn.
 *
 * Architecture mirrors `monday:boards`:
 *   - `requiresIntegration: true`.
 *   - No `requiredDeps` — users are account-scoped.
 *   - Single page of 100. `hasMore: false` (resolver-default; Monday
 *     workspaces rarely have >100 users).
 *
 * Mapping (Monday user → OptionItem):
 *   - `value`: `id` (numeric Monday user id).
 *   - `label`: `name` when non-empty, else email, else id.
 *   - `description`: `email` when present.
 *
 * Sort: alphabetical by label client-side. Monday returns users in
 * registration order; alphabetical is the natural picker UX.
 */

const PAGE_SIZE = 100;

export const mondayUsersResolver: OptionsResolver = {
  source: "monday:users",
  provider: "monday",
  requiresIntegration: true,
  async resolve(ctx) {
    if (!ctx.integration) {
      throw new OptionsResolverError(
        "INTEGRATION_DISCONNECTED",
        "No active Monday integration. Connect Monday first.",
      );
    }

    const accountId = ctx.integration.providerAccountId;

    let result;
    try {
      result = await refreshAndRetry({
        userId: ctx.userId,
        provider: "monday",
        accountId,
        apiCall: (accessToken) =>
          usersList({ accessToken, limit: PAGE_SIZE, kind: "all" }),
      });
    } catch (err) {
      if (err instanceof IntegrationActionRequiredError) {
        throw new OptionsResolverError(
          "INTEGRATION_DISCONNECTED",
          "Reconnect Monday and try again.",
        );
      }
      if (err instanceof Unauthorized401Error) {
        throw new OptionsResolverError(
          "INTEGRATION_DISCONNECTED",
          "Reconnect Monday and try again.",
        );
      }
      throw new OptionsResolverError(
        "PROVIDER_ERROR",
        "Couldn't load Monday users. Try again.",
      );
    }

    const mapped: Array<{
      value: string;
      label: string;
      description?: string;
    }> = [];
    for (const u of result.users) {
      if (typeof u.id !== "string" || u.id.length === 0) continue;
      const label =
        typeof u.name === "string" && u.name.length > 0
          ? u.name
          : typeof u.email === "string" && u.email.length > 0
            ? u.email
            : u.id;
      const description =
        typeof u.email === "string" && u.email.length > 0 ? u.email : undefined;
      mapped.push(
        description !== undefined
          ? { value: u.id, label, description }
          : { value: u.id, label },
      );
    }

    const lowerQ = ctx.q.toLowerCase();
    const filtered =
      lowerQ.length > 0
        ? mapped.filter((item) => item.label.toLowerCase().includes(lowerQ))
        : mapped;

    const sorted = [...filtered].sort((a, b) =>
      a.label.toLowerCase() < b.label.toLowerCase()
        ? -1
        : a.label.toLowerCase() > b.label.toLowerCase()
          ? 1
          : 0,
    );

    return {
      items: sorted,
      hasMore: false,
    };
  },
};
