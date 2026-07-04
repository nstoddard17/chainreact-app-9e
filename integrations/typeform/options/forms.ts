import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import type { OptionItem, OptionsResolver } from "@/services/options/types";
import { formsList } from "@/integrations/_shared/typeform/api/forms";
import {
  filterAndSortByLabel,
  mapTypeformOptionsError,
  requireTypeformIntegration,
} from "./_shared";

/**
 * `typeform:forms` options resolver — Slice 5.TYPEFORM-1.
 *
 * Backs the `formId` field on the `new_response_in_form` trigger. No
 * deps (the forms list is top-level). One page of 200 (Typeform's max
 * page_size) with `hasMore` from `page_count`; `ctx.q` is ALSO passed as
 * Typeform's server-side `search` param, so accounts with more than one
 * page refine via the picker's search box.
 */
const PAGE_SIZE = 200;

export const typeformFormsResolver: OptionsResolver = {
  source: "typeform:forms",
  provider: "typeform",
  requiresIntegration: true,
  async resolve(ctx) {
    const integration = requireTypeformIntegration(ctx);

    let page;
    try {
      page = await refreshAndRetry({
        accountId: integration.accountId,
        provider: "typeform",
        providerAccountId: integration.providerAccountId,
        apiCall: (accessToken) =>
          formsList({ accessToken, search: ctx.q, pageSize: PAGE_SIZE }),
      });
    } catch (err) {
      mapTypeformOptionsError(err, "forms");
    }

    const items: OptionItem[] = [];
    for (const form of page.items) {
      if (typeof form.id !== "string" || form.id.length === 0) continue;
      const label =
        typeof form.title === "string" && form.title.length > 0
          ? form.title
          : form.id;
      items.push({ value: form.id, label });
    }

    return { items: filterAndSortByLabel(items, ctx.q), hasMore: page.hasMore };
  },
};
