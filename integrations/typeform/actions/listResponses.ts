import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { responsesList } from "@/integrations/_shared/typeform/api/responses";
import { projectResponse } from "./_shared";
import { ListResponsesConfigSchema } from "./listResponses.schema";

/**
 * Typeform `list_responses` action handler — TYPEFORM-2.
 *
 * GET /forms/{id}/responses via the shared `responsesList` wrapper (new
 * scope `responses:read`), wrapped in `refreshAndRetry` (weekly-expiring
 * tokens). The backfill / on-demand / scheduled-digest companion for the
 * self-contained `new_response_in_form` webhook trigger.
 *
 * Completed responses only (API default `response_type` — partials are
 * plan-gated and deliberately out of scope). Filters: `since` / `until` /
 * `query`; `sort` is never sent (incompatible with cursor traversal).
 *
 * Pagination: one page per run, newest first. `nextBefore` is the last
 * item's response token when the page is full — feed it back into the
 * `before` field (e.g. from a previous run's output) to fetch the next
 * (older) page; null when the page was short (no more pages). An
 * exact-multiple collection can yield one final empty page — harmless.
 *
 * Output (bounded per response — never the raw record; `metadata`
 * fingerprint data and provider URLs are dropped at the wrapper):
 *   { responses: [{ responseToken, submittedAt, landedAt, answers,
 *     hidden, score }], count, totalItems, hasMore, nextBefore }
 */
export const listResponses: ActionHandler = async (input) => {
  const config = ListResponsesConfigSchema.parse(input.config);
  const pageSize = config.pageSize ?? 25;

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
        pageSize,
        since: config.since !== undefined && config.since.length > 0 ? config.since : undefined,
        until: config.until !== undefined && config.until.length > 0 ? config.until : undefined,
        query: config.query !== undefined && config.query.length > 0 ? config.query : undefined,
        before:
          config.before !== undefined && config.before.length > 0
            ? config.before
            : undefined,
      }),
  });

  const responses = page.items.map(projectResponse);
  const lastToken =
    responses.length > 0 ? responses[responses.length - 1]!.responseToken : null;
  const nextBefore = responses.length === pageSize ? lastToken : null;

  return {
    output: {
      responses,
      count: responses.length,
      totalItems: page.totalItems,
      hasMore: nextBefore !== null,
      nextBefore,
    },
  };
};
