import {
  IntegrationActionRequiredError,
  Unauthorized401Error,
  refreshAndRetry,
} from "@/services/oauth/refreshAndRetry";
import {
  OptionsResolverError,
  type OptionsResolver,
} from "@/services/options/types";
import { usersLabelsList } from "@/integrations/gmail/api/usersLabelsList";

/**
 * `gmail:labels` options resolver — Slice ANALYTICS-SOURCES-GMAIL-1.
 *
 * Backs the label picker on the Gmail analytics `label_message_count` widget.
 * Lists the EDITOR'S OWN Gmail labels (system + user) so the author picks a label
 * by name instead of guessing an id.
 *
 * Behavior (mirrors the Google Docs / Calendar resolvers — refreshable provider):
 *   - `requiresIntegration: true` — the route loads the caller's active Gmail
 *     integration and short-circuits with `INTEGRATION_DISCONNECTED` when none.
 *   - Gmail is PERSONAL, and the analytics options call carries NO workflow
 *     context, so the route resolves the caller's OWN connection (credentialPolicy
 *     → "legacy"). The picker lists the EDITOR'S labels only; at render each viewer
 *     still queries with their own token, so a co-member never receives another
 *     member's labels or result.
 *   - Refreshable → `refreshAndRetry({provider: "gmail", providerAccountId: null})`
 *     so a stale access token refreshes once. Uses only the granted
 *     `gmail.readonly` scope — no reconnect required.
 *   - Maps each label to `{ value: id, label: name }`. `q` filters client-side
 *     (case-insensitive substring on the name).
 *
 * PRIVACY: only label id + name are read — never a message, subject, or address.
 *
 * Error sanitization — leak-free, never marks another provider broken:
 *   - refresh failed / 401 → `INTEGRATION_DISCONNECTED` (reconnect).
 *   - anything else → generic `PROVIDER_ERROR`. The raw Gmail error body / token
 *     is never placed in the message; a safe, token-free event is logged.
 */

const PAGE_CAP = 200;

export const gmailLabelsResolver: OptionsResolver = {
  source: "gmail:labels",
  provider: "gmail",
  requiresIntegration: true,
  async resolve(ctx) {
    if (!ctx.integration) {
      throw new OptionsResolverError(
        "INTEGRATION_DISCONNECTED",
        "Connect Gmail to pick a label.",
      );
    }
    const integration = ctx.integration;

    let result;
    try {
      result = await refreshAndRetry({
        accountId: integration.accountId,
        provider: "gmail",
        providerAccountId: null,
        apiCall: (accessToken) => usersLabelsList({ accessToken }),
      });
    } catch (err) {
      if (err instanceof IntegrationActionRequiredError || err instanceof Unauthorized401Error) {
        throw new OptionsResolverError(
          "INTEGRATION_DISCONNECTED",
          "Reconnect Gmail and try again.",
        );
      }
      console.warn(
        JSON.stringify({ event: "options.gmail_labels.provider_error", source: "gmail:labels" }),
      );
      throw new OptionsResolverError(
        "PROVIDER_ERROR",
        "Couldn't load your Gmail labels. Try again.",
      );
    }

    const lowerQ = ctx.q.toLowerCase();
    const items = result.labels
      .filter((l) => typeof l.id === "string" && l.id.length > 0 && typeof l.name === "string")
      .map((l) => ({ value: l.id, label: l.name }))
      .filter((item) => lowerQ.length === 0 || item.label.toLowerCase().includes(lowerQ))
      .slice(0, PAGE_CAP);

    return { items, hasMore: result.labels.length > PAGE_CAP };
  },
};
