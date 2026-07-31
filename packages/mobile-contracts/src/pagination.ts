import { z } from "zod";

/**
 * Cursor pagination primitives for every mobile list endpoint.
 *
 * Cursors are OPAQUE server-minted strings — clients never construct, parse,
 * or reorder them. The response side follows the repo-wide
 * `nextCursor` + `hasMore` convention (no offsets, no provider paging links,
 * no total counts that would require full scans).
 */
export const MobileCursorSchema = z.string().min(1).max(512);
export type MobileCursor = z.infer<typeof MobileCursorSchema>;

export const MOBILE_PAGE_LIMIT_DEFAULT = 25;
export const MOBILE_PAGE_LIMIT_MAX = 100;

/** Query-side pagination input (`?cursor=…&limit=…`). */
export const MobilePageRequestSchema = z.object({
  cursor: MobileCursorSchema.optional(),
  limit: z
    .number()
    .int()
    .min(1)
    .max(MOBILE_PAGE_LIMIT_MAX)
    .optional(),
});
export type MobilePageRequest = z.infer<typeof MobilePageRequestSchema>;

/** Response-side page metadata attached beside every list payload. */
export const MobilePageInfoSchema = z.object({
  nextCursor: MobileCursorSchema.nullable(),
  hasMore: z.boolean(),
});
export type MobilePageInfo = z.infer<typeof MobilePageInfoSchema>;
