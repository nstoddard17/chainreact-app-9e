import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { memberAddNote } from "../../_shared/mailchimp/api/members";
import { resolveDc } from "./_resolveDc";
import { AddNoteConfigSchema } from "./addNote.schema";

/**
 * Mailchimp `add_note` action handler — Slice 14 Commit 3.
 *
 * POSTs `/lists/{audienceId}/members/{subscriberHash}/notes` with the
 * note body. Returns the created note record with the assigned id.
 *
 * Output shape: { noteId, email, audienceId, note, createdAt }.
 */
export const addNote: ActionHandler = async (input) => {
  const config = AddNoteConfigSchema.parse(input.config);

  const { dc, providerAccountId } = await resolveDc({
    accountId: input.accountId,
    userId: input.userId,
    triggerEvent: input.triggerEvent,
  });

  const created = await refreshAndRetry({
    accountId: input.accountId,
    provider: "mailchimp",
    providerAccountId,
    apiCall: (accessToken) =>
      memberAddNote({
        accessToken,
        dc,
        audienceId: config.audience_id,
        email: config.email,
        note: config.note,
      }),
  });

  return {
    output: {
      noteId: String(created.id),
      email: config.email,
      audienceId: config.audience_id,
      note: created.note,
      createdAt: created.created_at ?? new Date().toISOString(),
    },
  };
};
