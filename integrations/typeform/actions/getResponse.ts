import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { responsesList } from "@/integrations/_shared/typeform/api/responses";
import { projectResponse } from "./_shared";
import { GetResponseConfigSchema } from "./getResponse.schema";

/**
 * Typeform `get_response` action handler — TYPEFORM-2.
 *
 * Typeform has NO dedicated GET-one-response endpoint. This is honestly
 * implemented as `GET /forms/{id}/responses?included_response_ids={token}`
 * (scope `responses:read`) with `page_size: 1`, via the shared
 * `responsesList` wrapper wrapped in `refreshAndRetry`.
 *
 * Friendly not-found: an unknown / non-matching token returns
 * `{ found: false, … }` with null fields — it does NOT throw (Stripe
 * find_* precedent), so workflows can branch on `found`. Only COMPLETED
 * responses are returned (API default `response_type`; partials are
 * plan-gated and out of scope). A 404 on the FORM itself (bad formId)
 * still propagates as a provider error.
 *
 * Output (bounded — never the raw record): { found, responseToken,
 * submittedAt, landedAt, answers, hidden, score }
 */
export const getResponse: ActionHandler = async (input) => {
  const config = GetResponseConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "typeform"
      ? input.triggerEvent.providerAccountId
      : null;

  const page = await refreshAndRetry({
    accountId: input.accountId,
    provider: "typeform",
    providerAccountId,
    apiCall: (accessToken) =>
      responsesList({
        accessToken,
        formId: config.formId,
        pageSize: 1,
        includedResponseIds: config.responseToken,
      }),
  });

  // Defensive: only accept an item whose token actually matches the
  // requested one — never "the first thing the filter returned".
  const item =
    page.items.find((i) => i.token === config.responseToken) ?? null;

  if (item === null) {
    return {
      output: {
        found: false,
        responseToken: null,
        submittedAt: null,
        landedAt: null,
        answers: null,
        hidden: null,
        score: null,
      },
    };
  }

  const projected = projectResponse(item);
  return {
    output: {
      found: true,
      ...projected,
    },
  };
};
