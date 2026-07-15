import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { listWorkspaceItems } from "@/integrations/_shared/eden/api/items";
import { ListNotesConfigSchema } from "./listNotes.schema";

/** `eden:list_notes` — note items in a workspace (one page + cursor). */
export const edenListNotes: ActionHandler = async (input) => {
  const config = ListNotesConfigSchema.parse(input.config);
  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "eden",
    providerAccountId: null,
    apiCall: (accessToken) =>
      listWorkspaceItems({
        accessToken,
        ...(config.workspaceId ? { workspaceId: config.workspaceId } : {}),
        // LIVE-CERT (EDEN-5): Eden notes are workspace items of type `markdown` (verified
        // 2026-07-14 — workspace item types are `canvas` for boards, `markdown` for notes).
        type: "markdown",
        ...(typeof config.limit === "number" ? { limit: config.limit } : {}),
        ...(config.cursor ? { cursor: config.cursor } : {}),
      }),
  });
  return {
    output: {
      notes: result.items,
      count: result.count,
      totalCount: result.totalCount,
      nextCursor: result.nextCursor,
      hasMore: result.nextCursor !== null,
    },
  };
};
