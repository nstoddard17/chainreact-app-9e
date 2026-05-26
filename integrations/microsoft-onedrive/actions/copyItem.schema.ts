import { z } from "zod";

/**
 * Resolved-config schema for the OneDrive copy_item action.
 *
 * Async-by-design: Slice 8 returns `{ status: "pending", monitorUrl }`
 * synchronously and does NOT poll Graph for completion. V1's polling
 * loop is the V1 rot we explicitly fix (Slice 8 plan §"V1 rot fixes"
 * #10 — long-running waits exceed serverless timeouts for big copies).
 *
 * `targetParentItemId` is REQUIRED — Graph's /copy mandates a
 * `parentReference`. Schema rejects empty / missing.
 *
 * `newName` optional — when omitted, the copy keeps the source name.
 * Graph's conflictBehavior defaults to "fail" at the wrapper layer
 * (Q11): if the destination already has an item of that name, the
 * action fails with a clear error.
 */
export const CopyItemConfigSchema = z
  .object({
    // UI-scope `parentItemId` (ONEDRIVE-META-3) — NOT used by the handler.
    // Present so the `itemId` picker cascades off this SOURCE-folder field
    // (distinct from `targetParentItemId`, the required destination).
    // Handler-ignored; mirrors the Trello `boardId` UI-scope pattern.
    parentItemId: z.string().optional(),
    itemId: z.string().min(1, "itemId is required."),
    targetParentItemId: z
      .string()
      .min(1, "targetParentItemId is required (Graph /copy mandates a destination)."),
    newName: z.string().optional(),
  })
  .strict();

export type CopyItemConfig = z.infer<typeof CopyItemConfigSchema>;
