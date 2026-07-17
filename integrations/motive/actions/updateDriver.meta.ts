import type { ActionMeta } from "@/contracts/actionMeta";
import { MOTIVE_DRIVER_OUTPUTS } from "./_sharedOutputs";

/**
 * Motive `update_driver` ActionMeta — MOTIVE-1.
 *
 * Updates an existing driver record. The driver is an account-aware picker;
 * any subset of name/phone/email/status can be changed. Email is a
 * recipient/PII value (sensitivity: recipient). External write (recoverable) →
 * riskLevel medium.
 */
export const motiveUpdateDriverMeta: ActionMeta = {
  key: "motive:update_driver",
  provider: "motive",
  type: "update_driver",
  displayName: "Update Driver",
  description:
    "Update an existing driver in the company's Motive account — their name, phone, email, or status.",
  category: "data",
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
      description: "The driver to update. Pick one, or map it from an earlier step.",
    },
    {
      name: "firstName",
      label: "First name",
      type: "text",
      required: false,
      description: "Optional. New first name.",
    },
    {
      name: "lastName",
      label: "Last name",
      type: "text",
      required: false,
      description: "Optional. New last name.",
    },
    {
      name: "phone",
      label: "Phone",
      type: "text",
      required: false,
      description: "Optional. New phone number.",
    },
    {
      name: "email",
      label: "Email",
      type: "text",
      required: false,
      sensitivity: "recipient",
      description: "Optional. New email address.",
    },
    {
      name: "status",
      label: "Status",
      type: "select",
      required: false,
      options: [
        { value: "active", label: "Active" },
        { value: "deactivated", label: "Deactivated" },
      ],
      description: "Optional. Whether the driver is active or deactivated.",
    },
  ],
  outputs: [...MOTIVE_DRIVER_OUTPUTS],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 90,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription: "Updates a driver record in the company's Motive account.",
};
