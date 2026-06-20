import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { usersLabelsList } from "../api/usersLabelsList";
import { ListLabelsConfigSchema } from "./listLabels.schema";

/**
 * Gmail `list_labels` action handler (Slice 4.GMAIL-READ-1).
 *
 * Read-only. Reuses the shared `usersLabelsList` wrapper (also used by the
 * `gmail:labels` options resolver) behind `refreshAndRetry` (Q3); GET-shaped
 * so no idempotency concern.
 *
 * Output is bounded and explicitly projected to `{ id, name, type }` per
 * label — the raw provider resource is never spread, and the endpoint
 * carries no message content / bodies / attachments. `count` mirrors
 * `labels.length` for branch-on-empty workflows.
 */
export const listLabels: ActionHandler = async (input) => {
  ListLabelsConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "gmail"
      ? input.triggerEvent.providerAccountId
      : null;

  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "gmail",
    providerAccountId,
    apiCall: (accessToken) => usersLabelsList({ accessToken }),
  });

  const labels = result.labels.map((l) => ({
    id: l.id,
    name: l.name,
    type: l.type ?? null,
  }));

  return {
    output: {
      labels,
      count: labels.length,
    },
  };
};
