import { NodeComponent } from "../../../types"
import { RefreshCw, PauseCircle } from "lucide-react"

/**
 * Add Contact to Workflow Action
 */
export const hubspotActionAddToWorkflow: NodeComponent = {
  type: "hubspot_action_add_to_workflow",
  title: "Add Contact to Workflow",
  description: "Enroll a contact in a HubSpot workflow",
  icon: RefreshCw,
  providerId: "hubspot",
  requiredScopes: ["automation"],
  category: "CRM",
  isTrigger: false,
  configSchema: [
    {
      name: "workflowId",
      label: "Workflow",
      type: "combobox",
      dynamic: "hubspot_workflows",
      required: true,
      loadOnMount: true,
      searchable: true,
      placeholder: "Select or enter workflow ID",
      description: "Choose the workflow to enroll the contact in"
    },
    {
      name: "contactEmail",
      label: "Contact Email",
      type: "text",
      required: true,
      placeholder: "contact@example.com",
      description: "Email address of the contact to enroll"
    }
  ],
  producesOutput: true,
  outputSchema: [
    { name: "success", label: "Success", type: "boolean", description: "Whether the enrollment succeeded" },
    { name: "workflowId", label: "Workflow ID", type: "string", description: "The workflow ID" },
    { name: "contactEmail", label: "Contact Email", type: "string", description: "The enrolled contact's email" },
    { name: "enrolledAt", label: "Enrolled At", type: "string", description: "When the contact was enrolled (ISO 8601)" }
  ]
}

/**
 * Remove Contact from Workflow Action
 */
export const hubspotActionRemoveFromWorkflow: NodeComponent = {
  type: "hubspot_action_remove_from_workflow",
  title: "Remove Contact from Workflow",
  description: "Unenroll a contact from a HubSpot workflow",
  icon: PauseCircle,
  providerId: "hubspot",
  requiredScopes: ["automation"],
  category: "CRM",
  isTrigger: false,
  configSchema: [
    {
      name: "workflowId",
      label: "Workflow",
      type: "combobox",
      dynamic: "hubspot_workflows",
      required: true,
      loadOnMount: true,
      searchable: true,
      placeholder: "Select or enter workflow ID",
      description: "Choose the workflow to unenroll the contact from"
    },
    {
      name: "contactEmail",
      label: "Contact Email",
      type: "text",
      required: true,
      placeholder: "contact@example.com",
      description: "Email address of the contact to unenroll"
    }
  ],
  producesOutput: true,
  outputSchema: [
    { name: "success", label: "Success", type: "boolean", description: "Whether the unenrollment succeeded" },
    { name: "workflowId", label: "Workflow ID", type: "string", description: "The workflow ID" },
    { name: "contactEmail", label: "Contact Email", type: "string", description: "The unenrolled contact's email" },
    { name: "unenrolledAt", label: "Unenrolled At", type: "string", description: "When the contact was unenrolled (ISO 8601)" }
  ]
}

export const workflowManagementActions = [
  hubspotActionAddToWorkflow,
  hubspotActionRemoveFromWorkflow
]
