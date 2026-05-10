import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { attachAssociations } from "../../_shared/hubspot/api/associations";
import { notesCreate } from "../../_shared/hubspot/api/engagements";
import { resolveTimestampMs } from "./_resolveTimestamp";
import { CreateNoteConfigSchema } from "./createNote.schema";

/**
 * HubSpot `create_note` action handler — Slice 13 Batch 2.
 *
 * POSTs `/crm/v3/objects/notes`. Optional associations to contact /
 * company / deal / ticket via v4 default-typed PUTs after create.
 * Failed associations surface as `associationWarnings` (parent note
 * not rolled back).
 *
 * Timestamp handling:
 *   - Workflow author provides ISO 8601 OR epoch-ms string OR omits.
 *   - Handler resolves to epoch-ms-string (HubSpot's wire format).
 *   - Omitted → `Date.now()` (V1 pattern; safe default — "now" matches
 *     the note-taking UX of every CRM).
 */
export const createNote: ActionHandler = async (input) => {
  const config = CreateNoteConfigSchema.parse(input.config);

  const accountId =
    input.triggerEvent.provider === "hubspot"
      ? input.triggerEvent.accountId
      : null;

  const properties: Record<string, string> = {
    hs_note_body: config.hs_note_body,
    hs_timestamp: resolveTimestampMs(config.hs_timestamp) ?? Date.now().toString(),
  };
  if (config.hubspot_owner_id) {
    properties.hubspot_owner_id = config.hubspot_owner_id;
  }

  const note = await refreshAndRetry({
    userId: input.userId,
    provider: "hubspot",
    accountId,
    apiCall: (accessToken) =>
      notesCreate({ accessToken, properties }),
  });

  const assoc = await refreshAndRetry({
    userId: input.userId,
    provider: "hubspot",
    accountId,
    apiCall: (accessToken) =>
      attachAssociations({
        accessToken,
        fromType: "notes",
        fromId: note.id,
        toIds: {
          contacts: config.associatedContactId,
          companies: config.associatedCompanyId,
          deals: config.associatedDealId,
          tickets: config.associatedTicketId,
        },
      }),
  });

  return {
    output: {
      noteId: note.id,
      body: note.properties.hs_note_body ?? config.hs_note_body,
      timestamp: note.properties.hs_timestamp ?? null,
      createdAt: note.createdAt ?? null,
      properties: note.properties,
      associationsAttached: assoc.attached,
      associationWarnings: assoc.warnings,
    },
  };
};
