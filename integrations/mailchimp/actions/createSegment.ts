import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { segmentCreate } from "../../_shared/mailchimp/api/segments";
import { resolveDc } from "./_resolveDc";
import { CreateSegmentConfigSchema } from "./createSegment.schema";

/**
 * Mailchimp `create_segment` action handler — Slice 14 Commit 3.
 *
 * POSTs `/lists/{audienceId}/segments` with either a `static_segment`
 * email array (mode='static') OR an `options.conditions` filter
 * (mode='saved').
 *
 * Output shape: { segmentId, name, audienceId, mode, memberCount,
 * createdAt }.
 */
export const createSegment: ActionHandler = async (input) => {
  const config = CreateSegmentConfigSchema.parse(input.config);

  const { dc, providerAccountId } = await resolveDc({
    accountId: input.accountId,
    userId: input.userId,
    triggerEvent: input.triggerEvent,
  });

  const segment = await refreshAndRetry({
    accountId: input.accountId,
    provider: "mailchimp",
    providerAccountId,
    apiCall: (accessToken) =>
      config.mode === "static"
        ? segmentCreate({
            accessToken,
            dc,
            audienceId: config.audience_id,
            name: config.name,
            staticSegment: config.static_emails ?? [],
          })
        : segmentCreate({
            accessToken,
            dc,
            audienceId: config.audience_id,
            name: config.name,
            conditions: config.conditions,
            ...(config.match !== undefined ? { match: config.match } : {}),
          }),
  });

  return {
    output: {
      segmentId: String(segment.id),
      name: segment.name,
      audienceId: config.audience_id,
      mode: config.mode,
      memberCount: segment.member_count ?? 0,
      createdAt: segment.created_at ?? new Date().toISOString(),
    },
  };
};
