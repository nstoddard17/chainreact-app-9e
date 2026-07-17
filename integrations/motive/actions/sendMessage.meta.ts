import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Motive `send_message` ActionMeta — MOTIVE-1.
 *
 * Sends an in-app message to a driver. The driver is an account-aware picker;
 * the message body is free text. External send (recoverable) → riskLevel
 * medium.
 */
export const motiveSendMessageMeta: ActionMeta = {
  key: "motive:send_message",
  provider: "motive",
  type: "send_message",
  displayName: "Send Message",
  description:
    "Send an in-app message to a driver in Motive — for dispatch notes, reminders, and alerts.",
  category: "messaging",
  requiresIntegration: true,
  fields: [
    {
      name: "driverId",
      label: "Driver",
      type: "combobox",
      optionsSource: "motive:drivers",
      allowManualEntry: true,
      required: true,
      placeholder: "Search drivers…",
      description: "The driver to message. Pick one, or map it from an earlier step.",
    },
    {
      name: "message",
      label: "Message",
      type: "textarea",
      required: true,
      description: "The message body sent to the driver's Motive app.",
    },
  ],
  outputs: [
    { name: "messageId", type: "string", description: "Motive message id.", nullable: true },
    { name: "createdAt", type: "string", description: "When the message was sent (ISO-8601).", nullable: true },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 60,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription: "Sends an in-app message to a driver.",
};
