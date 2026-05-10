import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { gistsCreate } from "../../_shared/github/api/gists";
import { CreateGistConfigSchema } from "./createGist.schema";

/**
 * `create_gist` GitHub action handler — Slice 14b Batch 1.
 *
 * POSTs `/gists` with the user's access token. Single-file gists
 * (V1 same; multi-file deferred). Requires the `gist` OAuth scope
 * (declared in `integrations/github/manifest.ts:scopes.required`).
 *
 * **`isPublic` is required at the schema layer (no default).**
 * Public gists are world-readable; the workflow author must choose
 * explicitly. Mirrors Slice 12's Q11 `send_receipt` pattern.
 *
 * Output shape (downstream variable refs):
 *   { gistId, url, description, public, files }
 */
export const createGist: ActionHandler = async (input) => {
  const config = CreateGistConfigSchema.parse(input.config);

  const accountId =
    input.triggerEvent.provider === "github"
      ? input.triggerEvent.accountId
      : null;

  const gist = await refreshAndRetry({
    userId: input.userId,
    provider: "github",
    accountId,
    apiCall: (accessToken) =>
      gistsCreate({
        accessToken,
        filename: config.filename,
        content: config.content,
        description: config.description,
        public: config.isPublic,
      }),
  });

  return {
    output: {
      gistId: gist.id,
      url: gist.html_url,
      description: gist.description ?? null,
      public: gist.public,
      files: Object.keys(gist.files),
      createdAt: gist.created_at ?? null,
    },
  };
};
