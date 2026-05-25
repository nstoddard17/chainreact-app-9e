import { z } from "zod";

/**
 * Resolved-config schema for the Gmail `create_label` action.
 *
 * Inputs:
 *   - `name` (required, non-empty string) — display name of the
 *     label.
 *   - `labelListVisibility` (optional enum) — controls visibility
 *     in the sidebar. Values: `labelShow` / `labelShowIfUnread` /
 *     `labelHide`. **Optional with no V2-side default.** When
 *     omitted, the handler does not pass the field and Gmail's
 *     server-side default applies. V1 silently substituted
 *     `'labelShow'` (G-R5 / Q11 violation) — V2 explicitly does
 *     NOT replicate that.
 *   - `messageListVisibility` (optional enum) — controls visibility
 *     in the message list. Values: `show` / `hide`. Same
 *     no-V2-default policy as above.
 *   - `color` (optional object) — when supplied, BOTH
 *     `backgroundColor` AND `textColor` are required together
 *     (Gmail API requirement). V1 silently substituted
 *     `'#434343'` / `'#ffffff'` when only one was provided — V2
 *     fails the parse instead.
 *
 * V1 idempotency dropped: V1 swallowed 409 "already exists" by
 * refetching the label list and returning the existing label with
 * `alreadyExisted: true`. V2 surfaces the 409 honestly (per the
 * usersLabelsCreate wrapper). Workflow authors who want
 * create-or-get semantics will compose a search step upstream when
 * a `list_labels` / `search_labels` action lands.
 *
 * Scope requirement: `gmail.modify` (covers `gmail.labels`).
 */

const LabelListVisibilityEnum = z.enum([
  "labelShow",
  "labelShowIfUnread",
  "labelHide",
]);
const MessageListVisibilityEnum = z.enum(["show", "hide"]);

// Color object requires BOTH fields together. Strict on the object
// rejects extra color keys (e.g., V1-style hex maps).
const ColorSchema = z
  .object({
    backgroundColor: z
      .string()
      .min(1, "color.backgroundColor is required when color is set."),
    textColor: z
      .string()
      .min(1, "color.textColor is required when color is set."),
  })
  .strict();

export const CreateLabelConfigSchema = z
  .object({
    name: z.string().min(1, "name is required."),
    labelListVisibility: LabelListVisibilityEnum.optional(),
    messageListVisibility: MessageListVisibilityEnum.optional(),
    color: ColorSchema.optional(),
  })
  .strict();

export type CreateLabelConfig = z.infer<typeof CreateLabelConfigSchema>;
