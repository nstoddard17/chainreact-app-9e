import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { driveItemsList } from "../api/driveItemsList";
import { ListItemsConfigSchema } from "./listItems.schema";

/**
 * OneDrive `list_items` action handler.
 *
 * Lists children of a folder (or the drive root). Returns one page +
 * `nextLink` for forward-compat. Does NOT auto-paginate.
 *
 * Each item is normalized to a stable shape for downstream variable
 * references — only the fields V2 callers reliably consume.
 *
 * Output shape (downstream variable refs):
 *   { items: [{ itemId, name, kind, size, mimeType, webUrl,
 *               downloadUrl, createdDateTime, lastModifiedDateTime }],
 *     count, hasMore, nextLink }
 */
export const listItems: ActionHandler = async (input) => {
  const config = ListItemsConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "microsoft-onedrive"
      ? input.triggerEvent.providerAccountId
      : null;

  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "microsoft-onedrive",
    providerAccountId,
    apiCall: (accessToken) =>
      driveItemsList({
        accessToken,
        parentItemId: config.parentItemId,
        top: config.top,
        orderBy: config.orderBy,
      }),
  });

  return {
    output: {
      items: result.items.map((i) => ({
        itemId: i.id,
        name: i.name ?? "",
        kind: i.folder ? "folder" : i.file ? "file" : "file",
        size: i.size ?? null,
        mimeType: i.file?.mimeType ?? null,
        webUrl: i.webUrl ?? null,
        downloadUrl: i["@microsoft.graph.downloadUrl"] ?? null,
        createdDateTime: i.createdDateTime ?? null,
        lastModifiedDateTime: i.lastModifiedDateTime ?? null,
      })),
      count: result.items.length,
      hasMore: result.nextLink !== null,
      nextLink: result.nextLink,
    },
  };
};
