import { z } from "zod";

/**
 * Resolved-config schema for the OneDrive move_item action.
 *
 * `move_item` covers both move (parentReference change) and rename
 * (name change). At least one of `targetParentItemId` / `newName`
 * MUST be supplied — enforced by a cross-field refine; both supplied
 * is allowed (Graph atomically moves + renames in one PATCH).
 *
 * V1's separate `rename_item` action is collapsed into this schema —
 * `move_item` with only `newName` is a rename in place. Documented in
 * the slice plan §"Final in-scope action list".
 */
export const MoveItemConfigSchema = z
  .object({
    // UI-scope `parentItemId` (ONEDRIVE-META-3) — NOT used by the handler.
    // Present so the `itemId` picker cascades off this SOURCE-folder field
    // (distinct from `targetParentItemId`, the destination). Handler-ignored;
    // NOT counted by the cross-field refine below — a config with only
    // `parentItemId` set still fails the "at least one of targetParentItemId
    // or newName" rule. Mirrors the Trello `boardId` UI-scope pattern.
    parentItemId: z.string().optional(),
    itemId: z.string().min(1, "itemId is required."),
    /** New parent folder DriveItem id; omit to keep current parent. */
    targetParentItemId: z.string().optional(),
    /** New name; omit to keep current name. */
    newName: z.string().optional(),
  })
  .strict()
  .refine(
    (cfg) =>
      cfg.targetParentItemId !== undefined || cfg.newName !== undefined,
    {
      message:
        "At least one of targetParentItemId or newName is required (Q11 — no implicit no-op).",
      path: ["targetParentItemId"],
    },
  );

export type MoveItemConfig = z.infer<typeof MoveItemConfigSchema>;
