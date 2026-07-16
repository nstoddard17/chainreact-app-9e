import {
  InsufficientScopeError,
  IntegrationActionRequiredError,
  refreshAndRetry,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import {
  OptionsResolverError,
  type OptionsResolver,
} from "@/services/options/types";
import { listMasterCategories } from "@/integrations/microsoft-outlook/api/listMasterCategories";

/**
 * `microsoft-outlook:categories` options resolver — RESOLVERS-1.
 *
 * Backs the per-chip category picker on
 * `microsoft-outlook:add_categories.categories` (string-array +
 * optionsSource). Lists the connected mailbox's master categories via
 * Graph `GET /me/outlook/masterCategories`.
 *
 * Docs: https://learn.microsoft.com/en-us/graph/api/outlookuser-list-mastercategories
 *
 * VALUE = the category **displayName**, NOT the Graph category id:
 * `add_categories` PATCHes `categories: string[]` of display-name strings
 * onto the message (Graph's message `categories[]` is name-keyed — no id
 * translation exists on the message resource). The label is the same
 * displayName; no id is surfaced (it adds nothing for disambiguation —
 * category names are unique per mailbox).
 *
 * SCOPE / RECONNECT: masterCategories requires `MailboxSettings.Read`,
 * ADDED to the manifest's OPTIONAL scopes in this slice (Marcus-approved,
 * same posture as CONFIG-FIELD-UX-SWEEP-4's calendar.readonly /
 * mpim:read adds). A token that predates the addition gets HTTP 403 →
 * `InsufficientScopeError` → `PROVIDER_REAUTH_REQUIRED` (the client
 * renders a Reconnect prompt). Refresh can't fix it — only re-consent
 * grants the new scope. Manual entry on the field keeps it usable
 * meanwhile (typed category names Outlook doesn't know yet are ALSO
 * valid — Graph auto-creates them on the message with a default color).
 *
 * Behavior mirrors `microsoft-outlook:folders`:
 *   - `requiresIntegration: true`; personal provider, no workflow-context
 *     credential logic in the resolver.
 *   - Refreshable → `refreshAndRetry({provider: "microsoft-outlook",
 *     providerAccountId: null})`.
 *   - Single bounded page (top=100); `hasMore` = Graph returned a
 *     nextLink (the provider URL itself is never surfaced).
 *   - Client-side case-insensitive `q` substring filter on the name.
 *
 * PRIVACY: only category id + displayName are read — never a message,
 * subject, or address. Labels are category names only.
 *
 * Needs live smoke: coded against Microsoft's official Graph docs; no
 * live Graph call was possible in this session.
 */

const PAGE_CAP = 100;

export const outlookCategoriesResolver: OptionsResolver = {
  source: "microsoft-outlook:categories",
  provider: "microsoft-outlook",
  requiresIntegration: true,
  async resolve(ctx) {
    if (!ctx.integration) {
      throw new OptionsResolverError(
        "INTEGRATION_DISCONNECTED",
        "Connect Outlook to pick categories.",
      );
    }
    const integration = ctx.integration;

    let result;
    try {
      result = await refreshAndRetry({
        accountId: integration.accountId,
        provider: "microsoft-outlook",
        providerAccountId: null,
        apiCall: (accessToken) => listMasterCategories({ accessToken, top: PAGE_CAP }),
      });
    } catch (err) {
      if (err instanceof InsufficientScopeError) {
        // Old token missing MailboxSettings.Read — reconnect to grant it.
        throw new OptionsResolverError(
          "PROVIDER_REAUTH_REQUIRED",
          "Reconnect Outlook to allow listing your categories.",
        );
      }
      if (
        err instanceof IntegrationActionRequiredError ||
        err instanceof Unauthorized401Error
      ) {
        throw new OptionsResolverError(
          "INTEGRATION_DISCONNECTED",
          "Reconnect Outlook and try again.",
        );
      }
      console.warn(
        JSON.stringify({
          event: "options.outlook_categories.provider_error",
          source: "microsoft-outlook:categories",
        }),
      );
      throw new OptionsResolverError(
        "PROVIDER_ERROR",
        "Couldn't load your Outlook categories. Try again.",
      );
    }

    const lowerQ = ctx.q.toLowerCase();
    const items = result.value
      .filter(
        (c) => typeof c.displayName === "string" && c.displayName.length > 0,
      )
      // value = displayName — the exact string add_categories PATCHes.
      .map((c) => ({
        value: c.displayName as string,
        label: c.displayName as string,
      }))
      .filter(
        (item) => lowerQ.length === 0 || item.label.toLowerCase().includes(lowerQ),
      )
      .slice(0, PAGE_CAP);

    return { items, hasMore: result.nextLink !== null };
  },
};
