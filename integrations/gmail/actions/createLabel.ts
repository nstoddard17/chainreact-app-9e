import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import type { ActionHandler } from "@/services/execution/handlers/types";
import { usersLabelsCreate } from "../api/usersLabelsCreate";
import { CreateLabelConfigSchema } from "./createLabel.schema";

/**
 * Gmail `users.labels.create` action handler.
 *
 * Creates a user-defined label. Optional fields (`labelListVisibility`,
 * `messageListVisibility`, `color`) are forwarded only when provided
 * — V2 does NOT supply a silent default; if a workflow author wants
 * a specific visibility they specify it explicitly, otherwise
 * Gmail's server-side default applies (V1's G-R5 silent default is
 * NOT replicated).
 *
 * Output exposes the canonical Gmail Label fields that downstream
 * actions can reference: `{ labelId, name, type, labelListVisibility,
 * messageListVisibility, color }`. The wrapper's response shape is
 * already aligned; the handler just renames `id` to `labelId` for
 * clarity (matches `create_draft`'s `draftId` / `messageId` naming
 * convention so workflow-builder variable references are explicit
 * about which kind of id is which).
 *
 * No 409-idempotent recovery: if Gmail returns 409 because the name
 * already exists, the wrapper throws and the handler surfaces the
 * error honestly (parity-gmail.md §7 — drop V1 silent recovery).
 *
 * Scope requirement: `gmail.modify` (shipped in Gmail 2.1 Commit 1).
 */
export const createLabel: ActionHandler = async (input) => {
  const config = CreateLabelConfigSchema.parse(input.config);

  const accountId =
    input.triggerEvent.provider === "gmail"
      ? input.triggerEvent.accountId
      : null;

  const result = await refreshAndRetry({
    userId: input.userId,
    provider: "gmail",
    accountId,
    apiCall: async (accessToken) =>
      usersLabelsCreate({
        accessToken,
        name: config.name,
        labelListVisibility: config.labelListVisibility,
        messageListVisibility: config.messageListVisibility,
        color: config.color,
      }),
  });

  return {
    output: {
      labelId: result.id,
      name: result.name,
      type: result.type,
      labelListVisibility: result.labelListVisibility,
      messageListVisibility: result.messageListVisibility,
      color: result.color,
    },
  };
};
