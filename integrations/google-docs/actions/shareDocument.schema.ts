import { z } from "zod";

/**
 * Resolved-config schema for the Google Docs `share_document` action —
 * Slice 3.GDOCS-2.
 *
 * Field names preserve V1 verbatim per GDOCS-1 §8.1.
 * Permission enum values are Drive's CANONICAL set per GDOCS-1 §3.6:
 *   - `reader`, `commenter`, `writer`, `owner`.
 *   (V1's create_document used `viewer / commenter / editor` — those
 *    are NOT the Drive API canonical names; share_document already
 *    used the canonical set. V2 standardizes on Drive canonical for
 *    every Docs share field.)
 *
 * **Q11 — `sendNotification` is REQUIRED EXPLICIT.** V2 will NOT
 * silently default. The handler checks `requireExplicitField` BEFORE
 * the wire call.
 *
 * `shareWith` is a STRING-ARRAY of email addresses. V1 accepted a
 * comma-separated string and split client-side; V2 standardizes on
 * array shape (mirrors Gmail's to/cc/bcc + Mailchimp's audience
 * patterns). The schema accepts an empty array (workflow may share
 * publicly only via `makePublic: true` with no specific recipients).
 *
 * `transferOwnership` requires `permission === "owner"` AND
 * `shareWith.length === 1` AND Drive enforces additional rules at
 * the API layer (the source account must own the file at request
 * time). The schema enforces the two client-side preconditions via
 * `.superRefine` so an obviously-misconfigured invocation fails at
 * the resolver boundary; Drive's own rules surface as runtime errors.
 *
 * Strict mode rejects unknown fields.
 */

export const ShareDocumentPermissionSchema = z.enum([
  "reader",
  "commenter",
  "writer",
  "owner",
]);
export type ShareDocumentPermission = z.infer<
  typeof ShareDocumentPermissionSchema
>;

export const ShareDocumentConfigSchema = z
  .object({
    documentId: z.string().min(1, "documentId is required."),
    /**
     * Email addresses to share with. Empty array means "no per-user
     * shares this run" — `makePublic: true` is still a valid
     * standalone path (share only via anyone-link).
     */
    shareWith: z.array(z.string().min(1)).default([]),
    permission: ShareDocumentPermissionSchema.default("reader"),
    /**
     * Q11 — REQUIRED EXPLICIT. NO default. Handler enforces with
     * `requireExplicitField` before the wire call.
     */
    sendNotification: z.boolean().optional(),
    message: z.string().min(1).optional(),
    makePublic: z.boolean().default(false),
    publicPermission: ShareDocumentPermissionSchema.default("reader"),
    allowDiscovery: z.boolean().default(false),
    transferOwnership: z.boolean().default(false),
  })
  .strict()
  .superRefine((config, ctx) => {
    if (config.transferOwnership) {
      if (config.permission !== "owner") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["permission"],
          message:
            "transferOwnership: true requires permission='owner'. Drive rejects ownership transfers with any other role.",
        });
      }
      if (config.shareWith.length !== 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["shareWith"],
          message:
            "transferOwnership: true requires exactly one shareWith email. Drive transfers ownership to a single user.",
        });
      }
    }
  });

export type ShareDocumentConfig = z.infer<typeof ShareDocumentConfigSchema>;
