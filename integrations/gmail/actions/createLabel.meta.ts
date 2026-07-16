import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `gmail:create_label`.
 *
 * Mirrors `createLabel.schema.ts`. The `color` config field — a nested
 * object requiring both `backgroundColor` and `textColor` when present
 * — is intentionally NOT exposed in the builder today: the FieldMeta
 * contract has no field type for "object with sub-fields," and the
 * Gmail color API additionally requires specific hex values from a
 * fixed palette (workflow authors would need a color-picker UI that
 * doesn't exist yet). Workflow authors who need a colored label can
 * set the field via direct JSON edit; the runtime schema validates.
 *
 * V1 idempotency (silently swallowing 409 "already exists") was
 * dropped at the schema layer — surface honest 409s. Workflow authors
 * who want create-or-get semantics will compose a search step
 * upstream when a `list_labels` action lands (future slice).
 *
 * Required scope: `gmail.modify`.
 *
 * Outputs match `createLabel.ts:52-61` exactly.
 */
export const createLabelMeta: ActionMeta = {
  key: "gmail:create_label",
  provider: "gmail",
  type: "create_label",
  displayName: "Create Label",
  description:
    "Create a new Gmail label. Returns the label id for use in Add Label / Remove Label / Send Email's labels field. Color is an advanced option not yet exposed in the builder — set via direct workflow JSON if needed. Requires the gmail.modify scope.",
  category: "email",
  requiresIntegration: true,
  fields: [
    {
      name: "name",
      label: "Name",
      description: "Display name for the new label.",
      type: "text",
      required: true,
      placeholder: "Invoices",
    },
    {
      name: "labelListVisibility",
      label: "Label list visibility",
      description:
        "Controls visibility in the Gmail sidebar. Leave unset to use Gmail's server-side default (V2 does NOT silently substitute).",
      type: "select",
      required: false,
      advanced: true,
      options: [
        { value: "labelShow", label: "Show in label list" },
        { value: "labelShowIfUnread", label: "Show if unread" },
        { value: "labelHide", label: "Hide from label list" },
      ],
    },
    {
      name: "messageListVisibility",
      label: "Message list visibility",
      description:
        "Controls visibility in the message list. Leave unset to use Gmail's server-side default.",
      type: "select",
      required: false,
      advanced: true,
      options: [
        { value: "show", label: "Show in message list" },
        { value: "hide", label: "Hide from message list" },
      ],
    },
  ],
  outputs: [
    { name: "labelId", type: "string", description: "Newly created Gmail label id (e.g. 'Label_12345')." },
    { name: "name", type: "string", description: "Echoes the input name." },
    { name: "type", type: "string", description: "Gmail label type — 'system' or 'user' (will be 'user' for created labels)." },
    { name: "labelListVisibility", type: "string", description: "Gmail's final value for this setting (may be the server default)." },
    { name: "messageListVisibility", type: "string", description: "Gmail's final value for this setting (may be the server default)." },
    { name: "color", type: "object", description: "Gmail's color object on the label — { backgroundColor, textColor } when set, absent otherwise." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 90,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};
