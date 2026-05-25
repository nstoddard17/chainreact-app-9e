import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { sharingCreateSharedLink } from "@/integrations/_shared/dropbox/api/sharingCreateSharedLink";
import { sharingListSharedLinks } from "@/integrations/_shared/dropbox/api/sharingListSharedLinks";
import { DropboxConflictError } from "@/integrations/_shared/dropbox/errors";
import { CreateSharedLinkConfigSchema } from "./createSharedLink.schema";

/**
 * Dropbox `create_shared_link` — Slice 3.DROPBOX-2. Creates a shared link
 * for `path` (needs `sharing.write`).
 *
 * D-DB8 — REUSE existing link on conflict: when Dropbox returns HTTP 409
 * `shared_link_already_exists`, the shared request layer raises
 * `DropboxConflictError`. This handler catches that specific tag and
 * falls back to `list_shared_links` (needs `sharing.read`) to return the
 * existing link instead of failing. Any other conflict re-throws.
 *
 * The `sharedUrl` is sensitive (a publicly-accessible link) — marked
 * sensitive in the DROPBOX-4 metadata; never logged here.
 *
 * Output: `{ sharedUrl, path, id, linkExisted }`.
 */
export const createSharedLink: ActionHandler = async (input) => {
  const config = CreateSharedLinkConfigSchema.parse(input.config);

  const accountId =
    input.triggerEvent.provider === "dropbox"
      ? input.triggerEvent.accountId
      : null;

  let url: string | null = null;
  let id: string | null = null;
  let linkExisted = false;

  try {
    const link = await refreshAndRetry({
      userId: input.userId,
      provider: "dropbox",
      accountId,
      apiCall: (accessToken) =>
        sharingCreateSharedLink({ accessToken, path: config.path }),
    });
    url = link.url ?? null;
    id = link.id ?? null;
  } catch (err) {
    if (
      err instanceof DropboxConflictError &&
      err.summary.startsWith("shared_link_already_exists")
    ) {
      // D-DB8 — recover the existing link rather than failing.
      const existing = await refreshAndRetry({
        userId: input.userId,
        provider: "dropbox",
        accountId,
        apiCall: (accessToken) =>
          sharingListSharedLinks({ accessToken, path: config.path }),
      });
      const first = existing[0];
      if (!first || !first.url) {
        throw new Error(
          "Dropbox reported an existing shared link but none was returned by list_shared_links.",
        );
      }
      url = first.url;
      id = first.id ?? null;
      linkExisted = true;
    } else {
      throw err;
    }
  }

  return {
    output: {
      sharedUrl: url,
      path: config.path,
      id,
      linkExisted,
    },
  };
};
