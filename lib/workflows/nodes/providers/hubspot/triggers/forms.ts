import { NodeComponent } from "../../../types"
import { FileText } from "lucide-react"

/**
 * Form Submission Trigger
 *
 * Triggers when a form is submitted in HubSpot
 * API: Webhook subscription to form submissions
 * Scopes: forms
 */
export const hubspotTriggerFormSubmission: NodeComponent = {
  type: "hubspot_trigger_form_submission",
  title: "Form Submission",
  description: "Triggers when a form is submitted in HubSpot",
  icon: FileText,
  providerId: "hubspot",
  requiredScopes: ["forms"],
  category: "Forms",
  isTrigger: true,
  producesOutput: true,
  configSchema: [
    {
      name: "formId",
      label: "Form (Optional)",
      type: "combobox",
      required: false,
      dynamic: "hubspot_forms",
      loadOnMount: true,
      searchable: true,
      placeholder: "All forms",
      description: "Filter to a specific form, or leave empty to trigger on all form submissions"
    }
  ],
  outputSchema: [
    {
      name: "submissionId",
      label: "Submission ID",
      type: "string",
      description: "Unique ID of the form submission"
    },
    {
      name: "formId",
      label: "Form ID",
      type: "string",
      description: "ID of the submitted form"
    },
    {
      name: "formName",
      label: "Form Name",
      type: "string",
      description: "Name of the submitted form"
    },
    {
      name: "portalId",
      label: "Portal ID",
      type: "string",
      description: "HubSpot portal ID"
    },
    {
      name: "submittedAt",
      label: "Submitted At",
      type: "string",
      description: "When the form was submitted (ISO 8601)"
    },
    {
      name: "pageUrl",
      label: "Page URL",
      type: "string",
      description: "URL of the page where the form was submitted"
    },
    {
      name: "pageTitle",
      label: "Page Title",
      type: "string",
      description: "Title of the page where the form was submitted"
    },
    {
      name: "contactEmail",
      label: "Contact Email",
      type: "string",
      description: "Email address from the form submission"
    },
    {
      name: "contactId",
      label: "Contact ID",
      type: "string",
      description: "HubSpot contact ID (if contact was created/matched)"
    },
    {
      name: "fields",
      label: "Form Fields",
      type: "object",
      description: "Object containing all submitted form field values"
    },
    {
      name: "fieldValues",
      label: "Field Values",
      type: "object",
      description: "Flattened map of field names to values for quick mapping"
    },
    {
      name: "submissionValues",
      label: "Submission Values",
      type: "array",
      description: "Array of field name/value pairs from the submission"
    }
  ]
}

export const formTriggers = [
  hubspotTriggerFormSubmission
]
