import { NodeComponent } from "../../../types"
import { Ticket, Edit, Search } from "lucide-react"

/**
 * Create Ticket Action
 * Creates a new ticket in HubSpot
 *
 * API Verification:
 * - Endpoint: POST /crm/v3/objects/tickets
 * - Docs: https://developers.hubspot.com/docs/api/crm/tickets
 * - Scopes: tickets
 * - Pipelines: Each ticket must be assigned to a pipeline and stage
 */
export const hubspotActionCreateTicket: NodeComponent = {
  type: "hubspot_action_create_ticket",
  title: "Create Ticket",
  description: "Create a new support ticket in HubSpot",
  icon: Ticket,
  providerId: "hubspot",
  requiredScopes: ["tickets", "files"],
  category: "CRM",
  isTrigger: false,
  configSchema: [
    // Required Fields
    {
      name: "subject",
      label: "Ticket Subject",
      type: "text",
      required: true,
      placeholder: "Customer needs help with...",
      description: "Brief description of the ticket"
    },
    {
      name: "content",
      label: "Ticket Description",
      type: "textarea",
      required: false,
      placeholder: "Detailed description of the issue...",
      description: "Full details about the ticket"
    },

    // Pipeline and Stage
    {
      name: "hs_pipeline",
      label: "Pipeline",
      type: "combobox",
      dynamic: "hubspot_ticket_pipelines",
      required: true,
      loadOnMount: true,
      placeholder: "Select pipeline",
      description: "Choose the ticket pipeline"
    },
    {
      name: "hs_pipeline_stage",
      label: "Ticket Stage",
      type: "combobox",
      dynamic: "hubspot_ticket_stages",
      dependsOn: "hs_pipeline",
      required: true,
      placeholder: "Select stage",
      description: "Choose the ticket stage within the pipeline"
    },

    // Priority and Status
    {
      name: "hs_ticket_priority",
      label: "Priority",
      type: "select",
      options: [
        { value: "LOW", label: "Low" },
        { value: "MEDIUM", label: "Medium" },
        { value: "HIGH", label: "High" }
      ],
      required: false,
      defaultValue: "MEDIUM",
      placeholder: "Select priority"
    },
    {
      name: "hs_ticket_status",
      label: "Status",
      type: "select",
      options: [
        { value: "NEW", label: "New" },
        { value: "WAITING_ON_CONTACT", label: "Waiting on Contact" },
        { value: "WAITING_ON_US", label: "Waiting on Us" },
        { value: "CLOSED", label: "Closed" }
      ],
      required: false,
      placeholder: "Select status"
    },
    {
      name: "hs_ticket_category",
      label: "Category",
      type: "select",
      options: [
        { value: "PRODUCT_ISSUE", label: "Product Issue" },
        { value: "SERVICE_ISSUE", label: "Service Issue" },
        { value: "BILLING_ISSUE", label: "Billing Issue" },
        { value: "FEATURE_REQUEST", label: "Feature Request" },
        { value: "QUESTION", label: "Question" },
        { value: "OTHER", label: "Other" }
      ],
      required: false,
      placeholder: "Select category"
    },

    // Associations
    {
      name: "associatedContactId",
      label: "Associated Contact",
      type: "combobox",
      dynamic: "hubspot_contacts",
      required: false,
      placeholder: "Link to a contact",
      description: "Associate this ticket with a contact"
    },
    {
      name: "associatedCompanyId",
      label: "Associated Company",
      type: "combobox",
      dynamic: "hubspot_companies",
      required: false,
      placeholder: "Link to a company",
      description: "Associate this ticket with a company"
    },
    {
      name: "associatedDealId",
      label: "Associated Deal",
      type: "combobox",
      dynamic: "hubspot_deals",
      required: false,
      placeholder: "Link to a deal",
      description: "Associate this ticket with a deal"
    },

    // Assignment
    {
      name: "hubspot_owner_id",
      label: "Assign To",
      type: "combobox",
      dynamic: "hubspot_owners",
      required: false,
      placeholder: "Assign to team member",
      description: "Assign this ticket to a specific owner"
    },

    // Additional Fields
    {
      name: "source_type",
      label: "Source Type",
      type: "select",
      options: [
        { value: "EMAIL", label: "Email" },
        { value: "PHONE", label: "Phone" },
        { value: "CHAT", label: "Chat" },
        { value: "FORM", label: "Form" },
        { value: "OTHER", label: "Other" }
      ],
      required: false,
      placeholder: "How was this ticket created?"
    },
    {
      name: "attachments",
      label: "Attachments",
      type: "file",
      required: false,
      multiple: true,
      description: "Upload files or reference files/URLs from previous workflow steps"
    },
    {
      name: "customPropertiesGroup",
      label: "Additional Properties",
      type: "field_group",
      collapsible: true,
      defaultExpanded: false,
      fields: [
        {
          name: "selectedProperties",
          label: "Select Properties to Add",
          type: "multi-select",
          dynamic: "hubspot_ticket_properties",
          required: false,
          placeholder: "Choose ticket properties"
        },
        {
          name: "customProperties",
          label: "Property Values",
          type: "dynamic_properties",
          dynamic: true,
          dependsOn: "selectedProperties",
          required: false,
          metadata: {
            objectType: "tickets",
            requiredFields: []
          }
        }
      ]
    }
  ],
  producesOutput: true,
  outputSchema: [
    { name: "ticketId", label: "Ticket ID", type: "string", description: "The unique ID of the created ticket" },
    { name: "subject", label: "Subject", type: "string", description: "The ticket subject" },
    { name: "content", label: "Description", type: "string", description: "The ticket description" },
    { name: "hs_pipeline", label: "Pipeline", type: "string", description: "The ticket's pipeline" },
    { name: "hs_pipeline_stage", label: "Stage", type: "string", description: "The ticket's stage" },
    { name: "hs_ticket_priority", label: "Priority", type: "string", description: "The ticket's priority" },
    { name: "hs_ticket_category", label: "Category", type: "string", description: "The ticket's category" },
    { name: "hubspot_owner_id", label: "Owner ID", type: "string", description: "The ID of the assigned owner" },
    { name: "source_type", label: "Source Type", type: "string", description: "How the ticket was created" },
    { name: "createdate", label: "Create Date", type: "string", description: "When the ticket was created (ISO 8601)" },
    { name: "properties", label: "All Properties", type: "object", description: "All ticket properties" }
  ]
}

/**
 * Update Ticket Action
 * Updates an existing ticket in HubSpot with cascading field pattern
 *
 * API Verification:
 * - Endpoint: PATCH /crm/v3/objects/tickets/{ticketId}
 * - Docs: https://developers.hubspot.com/docs/api/crm/tickets
 * - Scopes: tickets
 */
export const hubspotActionUpdateTicket: NodeComponent = {
  type: "hubspot_action_update_ticket",
  title: "Update Ticket",
  description: "Update an existing ticket in HubSpot",
  icon: Edit,
  providerId: "hubspot",
  requiredScopes: ["tickets"],
  category: "CRM",
  isTrigger: false,
  configSchema: [
    // Ticket Selection (Parent field - always visible)
    {
      name: "ticketId",
      label: "Ticket to Update",
      type: "combobox",
      dynamic: "hubspot_tickets",
      required: true,
      loadOnMount: true,
      searchable: true,
      placeholder: "Select or enter ticket ID",
      description: "Choose the ticket you want to update"
    },

    // All updatable fields cascade after ticket selection
    {
      name: "subject",
      label: "New Subject",
      type: "text",
      required: false,
      placeholder: "Updated ticket subject",
      dependsOn: "ticketId",
      hidden: {
        $deps: ["ticketId"],
        $condition: { ticketId: { $exists: false } }
      }
    },
    {
      name: "content",
      label: "New Description",
      type: "textarea",
      required: false,
      placeholder: "Updated ticket description",
      dependsOn: "ticketId",
      hidden: {
        $deps: ["ticketId"],
        $condition: { ticketId: { $exists: false } }
      }
    },

    // Pipeline and Stage
    {
      name: "hs_pipeline_stage",
      label: "New Stage",
      type: "combobox",
      dynamic: "hubspot_ticket_stages",
      required: false,
      placeholder: "Move to stage",
      description: "Update the ticket stage",
      dependsOn: "ticketId",
      hidden: {
        $deps: ["ticketId"],
        $condition: { ticketId: { $exists: false } }
      }
    },

    // Priority and Status
    {
      name: "hs_ticket_priority",
      label: "New Priority",
      type: "select",
      options: [
        { value: "", label: "Keep Current Priority" },
        { value: "LOW", label: "Low" },
        { value: "MEDIUM", label: "Medium" },
        { value: "HIGH", label: "High" }
      ],
      required: false,
      placeholder: "Update priority",
      dependsOn: "ticketId",
      hidden: {
        $deps: ["ticketId"],
        $condition: { ticketId: { $exists: false } }
      }
    },
    {
      name: "hs_ticket_category",
      label: "New Category",
      type: "select",
      options: [
        { value: "", label: "Keep Current Category" },
        { value: "PRODUCT_ISSUE", label: "Product Issue" },
        { value: "SERVICE_ISSUE", label: "Service Issue" },
        { value: "BILLING_ISSUE", label: "Billing Issue" },
        { value: "FEATURE_REQUEST", label: "Feature Request" },
        { value: "QUESTION", label: "Question" },
        { value: "OTHER", label: "Other" }
      ],
      required: false,
      placeholder: "Update category",
      dependsOn: "ticketId",
      hidden: {
        $deps: ["ticketId"],
        $condition: { ticketId: { $exists: false } }
      }
    },

    // Resolution
    {
      name: "hs_resolution",
      label: "Resolution",
      type: "textarea",
      required: false,
      placeholder: "How was this ticket resolved?",
      description: "Add resolution details",
      dependsOn: "ticketId",
      hidden: {
        $deps: ["ticketId"],
        $condition: { ticketId: { $exists: false } }
      }
    },

    // Assignment
    {
      name: "hubspot_owner_id",
      label: "Reassign To",
      type: "combobox",
      dynamic: "hubspot_owners",
      required: false,
      placeholder: "Reassign ticket",
      description: "Change the ticket owner",
      dependsOn: "ticketId",
      hidden: {
        $deps: ["ticketId"],
        $condition: { ticketId: { $exists: false } }
      }
    }
  ],
  producesOutput: true,
  outputSchema: [
    { name: "ticketId", label: "Ticket ID", type: "string", description: "The unique ID of the updated ticket" },
    { name: "subject", label: "Subject", type: "string", description: "The updated ticket subject" },
    { name: "content", label: "Description", type: "string", description: "The updated ticket description" },
    { name: "hs_pipeline_stage", label: "Stage", type: "string", description: "The updated ticket stage" },
    { name: "hs_ticket_priority", label: "Priority", type: "string", description: "The updated ticket priority" },
    { name: "hs_ticket_category", label: "Category", type: "string", description: "The updated ticket category" },
    { name: "hs_resolution", label: "Resolution", type: "string", description: "The ticket resolution" },
    { name: "hubspot_owner_id", label: "Owner ID", type: "string", description: "The ID of the assigned owner" },
    { name: "lastmodifieddate", label: "Last Modified", type: "string", description: "When the ticket was last modified (ISO 8601)" },
    { name: "properties", label: "All Properties", type: "object", description: "All ticket properties after update" }
  ]
}

/**
 * Get Tickets Action
 * Search and retrieve tickets from HubSpot
 *
 * API Verification:
 * - Endpoint: POST /crm/v3/objects/tickets/search
 * - Docs: https://developers.hubspot.com/docs/api/crm/search
 * - Scopes: tickets
 */
export const hubspotActionGetTickets: NodeComponent = {
  type: "hubspot_action_get_tickets",
  title: "Get Tickets",
  description: "Retrieve tickets from HubSpot with optional filtering",
  icon: Search,
  providerId: "hubspot",
  requiredScopes: ["tickets"],
  category: "CRM",
  isTrigger: false,
  configSchema: [
    {
      name: "limit",
      label: "Maximum Results",
      type: "number",
      required: false,
      defaultValue: 100,
      placeholder: "Number of tickets to retrieve (max 100)",
      description: "How many tickets to return"
    },
    {
      name: "after",
      label: "Start After Cursor",
      type: "text",
      required: false,
      placeholder: "Paste cursor from previous run",
      description: "Use the paging cursor returned in a previous run to continue where you left off.",
      uiTab: "advanced"
    },
    {
      name: "filterProperty",
      label: "Filter by Property (Optional)",
      type: "multi-select",
      dynamic: "hubspot_ticket_properties",
      required: false,
      placeholder: "Select ticket properties (e.g., subject, hs_ticket_priority)",
      description: "Choose one or more ticket properties to filter on"
    },
    {
      name: "filterValue",
      label: "Filter Value",
      type: "text",
      required: false,
      placeholder: "Value to match",
      description: "Enter the value to match. For multiple properties, provide an array or object (e.g., {\"subject\": \"Bug\", \"hs_ticket_priority\": \"HIGH\"})."
    },
    {
      name: "filterPipeline",
      label: "Filter by Pipeline (Optional)",
      type: "combobox",
      dynamic: "hubspot_ticket_pipelines",
      required: false,
      placeholder: "All pipelines",
      description: "Only return tickets from a specific pipeline"
    },
    {
      name: "filterStage",
      label: "Filter by Stage (Optional)",
      type: "combobox",
      dynamic: "hubspot_ticket_stages",
      dependsOn: "filterPipeline",
      required: false,
      placeholder: "All stages",
      description: "Only return tickets in a specific stage"
    },
    {
      name: "filterPriority",
      label: "Filter by Priority (Optional)",
      type: "select",
      options: [
        { value: "", label: "All Priorities" },
        { value: "LOW", label: "Low" },
        { value: "MEDIUM", label: "Medium" },
        { value: "HIGH", label: "High" }
      ],
      required: false,
      placeholder: "All priorities",
      description: "Only return tickets with specific priority"
    },
    {
      name: "properties",
      label: "Properties to Retrieve (Optional)",
      type: "multi-select",
      dynamic: "hubspot_ticket_properties",
      required: false,
      placeholder: "Select ticket properties to include",
      description: "Choose specific properties to return. Leave empty for defaults."
    }
  ],
  outputSchema: [
    {
      name: "tickets",
      label: "Tickets",
      type: "array",
      description: "Array of tickets from HubSpot"
    },
    {
      name: "count",
      label: "Count",
      type: "number",
      description: "Number of tickets retrieved"
    },
    {
      name: "total",
      label: "Total Matches",
      type: "number",
      description: "Total number of tickets that match the filters"
    },
    {
      name: "nextCursor",
      label: "Next Cursor",
      type: "string",
      description: "Cursor to use in the next request for pagination"
    },
    {
      name: "hasMore",
      label: "Has More",
      type: "boolean",
      description: "Indicates if additional pages are available"
    }
  ]
}

// Export all ticket actions
export const ticketActions = [
  hubspotActionCreateTicket,
  hubspotActionUpdateTicket,
  hubspotActionGetTickets
]
