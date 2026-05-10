import { z } from "zod";

/**
 * `add_note` action schema — Slice 14 Commit 3.
 *
 * V1 reference: [`lib/workflows/actions/mailchimp/addNote.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/mailchimp/addNote.ts).
 *
 * Adds a free-text note to a subscriber's profile. Notes are
 * visible in Mailchimp's UI on the subscriber's profile page; not
 * sent to the subscriber. Used for CRM-style annotation.
 *
 * Mailchimp's note size limit per current docs: 1000 characters.
 * Schema enforces.
 *
 * Schema is strict — unknown fields throw.
 */
export const AddNoteConfigSchema = z
  .object({
    audience_id: z.string().min(1),
    email: z.string().email(),
    note: z.string().min(1).max(1000),
  })
  .strict();

export type AddNoteConfig = z.infer<typeof AddNoteConfigSchema>;
