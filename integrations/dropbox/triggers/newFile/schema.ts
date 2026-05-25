import { z } from "zod";

/**
 * Zod schema for the `dropbox:new_file` trigger config — Slice 3.DROPBOX-5.
 *
 * User-set fields:
 *   - `path` — the folder to watch. Root is the empty string `""`. A
 *     Dropbox path is either `""` (root) or starts with `/`.
 *   - `recursive` — also watch files in subfolders (the cursor bakes this
 *     in at activation).
 *
 * Server-managed state (set by the activation hook, advanced by the
 * reconciler — mirrors Gmail's `snapshot.historyId` convention):
 *   - `snapshot.cursor` — the Dropbox `list_folder` cursor (advanced after
 *     each webhook reconciliation via `/continue`).
 *   - `snapshot.accountId` — the Dropbox `account_id` (`dbid:…`) seeded at
 *     activation. The webhook fan-out matches inbound changed-account ids
 *     against this so a notification only reconciles the right rows. (The
 *     `trigger_resources.account_id` column stays NULL by design — see
 *     `services/triggers/lifecycle.ts`; this lives in JSONB config.)
 *   - `snapshot.capturedAt` — when the cursor was seeded / last reset.
 *
 * NOT strict — the lifecycle may merge additional fields and forward
 * compatibility shouldn't break a parse at the reconcile boundary
 * (mirrors `GmailNewEmailConfigSchema`).
 */
export const DropboxNewFileConfigSchema = z.object({
  path: z
    .string()
    .default("")
    .refine((p) => p === "" || p.startsWith("/"), {
      message: "Dropbox folder path must be empty (root) or start with '/'.",
    }),
  recursive: z.boolean().default(false),
  snapshot: z
    .object({
      cursor: z.string().min(1),
      accountId: z.string().min(1),
      capturedAt: z.string().min(1),
    })
    .optional(),
});

export type DropboxNewFileConfig = z.infer<typeof DropboxNewFileConfigSchema>;
