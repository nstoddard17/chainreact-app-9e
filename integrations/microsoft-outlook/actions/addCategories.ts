import type { ActionHandler } from "@/services/execution/handlers/types";
import { parseCsvList } from "@/core/integrations/parseCsvList";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { patchMessage } from "../api/patchMessage";
import { AddCategoriesConfigSchema } from "./addCategories.schema";

/**
 * Microsoft Outlook add_categories action.
 *
 * Outlook Mail 2.2 Commit 2. PATCH-replaces the message's `categories[]`
 * with the resolved list:
 *   - Schema parse first.
 *   - parseCsvList flattens CSV-string-or-array input into a flat
 *     trimmed-non-empty string list (shared helper with Q7 parsing).
 *   - At-least-one-category guard post-parse — whitespace-only CSV
 *     ("   ,  ") passes schema but yields `[]` here.
 *   - Wrap the principal PATCH call in `refreshAndRetry` (Q3).
 *
 * IMPORTANT — PATCH-replace semantics (V1-parity):
 *   `categories` in Graph is a collection-valued property; PATCH
 *   REPLACES the full list. If the message already had
 *   `["Work", "Important"]` and the workflow patches `["Follow-up"]`,
 *   the message ends with `["Follow-up"]` — NOT `["Work", "Important",
 *   "Follow-up"]`. The action name "add_categories" matches V1 for
 *   workflow-author legibility; semantically it's "set_categories." If
 *   future user feedback demands additive semantics, ship a sibling
 *   `append_categories` action that does a read-merge-PATCH round trip.
 *
 * Scope: requires `Mail.ReadWrite` (P-O1).
 *
 * Output shape (load-bearing fields only):
 *   { categorized: true, emailId, categories: string[] }
 *
 * `categories` echoes the Graph PATCH response's categories[] when
 * present (the new authoritative list); falls back to the parsed input
 * list if Graph's response omits it (defensive — shouldn't happen, but
 * keeps the downstream variable ref stable).
 *
 * Account resolution mirrors 2.1 actions.
 */
export const addCategories: ActionHandler = async (input) => {
  const config = AddCategoriesConfigSchema.parse(input.config);

  const parsedCategories = parseCsvList(config.categories);
  if (parsedCategories.length === 0) {
    throw new Error(
      "add_categories: at least one category is required (after parsing CSV / array).",
    );
  }

  const providerAccountId =
    input.triggerEvent.provider === "microsoft-outlook"
      ? input.triggerEvent.providerAccountId
      : null;

  const patched = await refreshAndRetry({
    accountId: input.accountId,
    provider: "microsoft-outlook",
    providerAccountId,
    apiCall: (accessToken) =>
      patchMessage({
        accessToken,
        messageId: config.emailId,
        patch: { categories: parsedCategories },
      }),
  });

  return {
    output: {
      categorized: true,
      emailId: config.emailId,
      categories: patched.categories ?? parsedCategories,
    },
  };
};
