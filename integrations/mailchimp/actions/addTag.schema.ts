import { z } from "zod";

/**
 * `add_tag` action schema — Slice 14 Commit 3.
 *
 * V1 reference: [`lib/workflows/actions/mailchimp/addTag.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/mailchimp/addTag.ts).
 *
 * Adds one or more tags to a subscriber. Mailchimp auto-creates the
 * tag if it doesn't already exist — no separate "create tag"
 * endpoint needed.
 *
 * `tags` is an array of bare strings (V2 chose array over V1's CSV
 * format here because the V1 UI for tags is a multiselect that
 * already submits string arrays). Schema is strict — unknown fields
 * throw.
 */
export const AddTagConfigSchema = z
  .object({
    audience_id: z.string().min(1),
    email: z.string().email(),
    tags: z.array(z.string().min(1)).min(1),
  })
  .strict();

export type AddTagConfig = z.infer<typeof AddTagConfigSchema>;
