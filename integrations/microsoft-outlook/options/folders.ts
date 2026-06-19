import {
  IntegrationActionRequiredError,
  Unauthorized401Error,
  refreshAndRetry,
} from "@/services/oauth/refreshAndRetry";
import {
  OptionsResolverError,
  type OptionsResolver,
} from "@/services/options/types";
import { listMailFolders } from "@/integrations/microsoft-outlook/api/listMailFolders";

/**
 * `microsoft-outlook:folders` options resolver — Slice ANALYTICS-SOURCES-OUTLOOK-1.
 *
 * Backs the folder picker on the Outlook analytics `folder_message_count` widget.
 * Lists the EDITOR'S OWN top-level mail folders so the author picks a folder by
 * name instead of guessing an id.
 *
 * Behavior mirrors the `gmail:labels` resolver (refreshable personal provider):
 *   - `requiresIntegration: true` — the route loads the caller's active Outlook
 *     integration and short-circuits with `INTEGRATION_DISCONNECTED` when none.
 *   - Outlook is PERSONAL, and the analytics options call carries NO workflow
 *     context, so the route resolves the caller's OWN connection. The picker lists
 *     the EDITOR'S folders only; at render each viewer still queries with their own
 *     token, so a co-member never receives another member's folders or result.
 *   - Refreshable → `refreshAndRetry({provider: "microsoft-outlook", providerAccountId: null})`.
 *     Uses only the granted `Mail.Read` scope — no reconnect required.
 *   - Maps each folder to `{ value: id, label: displayName }`. `q` filters
 *     client-side (case-insensitive substring on the name).
 *
 * PRIVACY: only folder id + display name are read — never a message, subject, or
 * address.
 *
 * Error sanitization — leak-free, never marks another provider broken:
 *   - refresh failed / 401 → `INTEGRATION_DISCONNECTED` (reconnect).
 *   - anything else → generic `PROVIDER_ERROR`. The raw Graph error body / token is
 *     never placed in the message; a safe, token-free event is logged.
 */

const PAGE_CAP = 100;

export const outlookFoldersResolver: OptionsResolver = {
  source: "microsoft-outlook:folders",
  provider: "microsoft-outlook",
  requiresIntegration: true,
  async resolve(ctx) {
    if (!ctx.integration) {
      throw new OptionsResolverError(
        "INTEGRATION_DISCONNECTED",
        "Connect Outlook to pick a folder.",
      );
    }
    const integration = ctx.integration;

    let result;
    try {
      result = await refreshAndRetry({
        accountId: integration.accountId,
        provider: "microsoft-outlook",
        providerAccountId: null,
        apiCall: (accessToken) => listMailFolders({ accessToken }),
      });
    } catch (err) {
      if (err instanceof IntegrationActionRequiredError || err instanceof Unauthorized401Error) {
        throw new OptionsResolverError(
          "INTEGRATION_DISCONNECTED",
          "Reconnect Outlook and try again.",
        );
      }
      console.warn(
        JSON.stringify({ event: "options.outlook_folders.provider_error", source: "microsoft-outlook:folders" }),
      );
      throw new OptionsResolverError(
        "PROVIDER_ERROR",
        "Couldn't load your Outlook folders. Try again.",
      );
    }

    const lowerQ = ctx.q.toLowerCase();
    const items = result.value
      .filter((f) => typeof f.id === "string" && f.id.length > 0 && typeof f.displayName === "string")
      .map((f) => ({ value: f.id, label: f.displayName as string }))
      .filter((item) => lowerQ.length === 0 || item.label.toLowerCase().includes(lowerQ))
      .slice(0, PAGE_CAP);

    return { items, hasMore: result.value.length > PAGE_CAP };
  },
};
