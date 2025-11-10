import { NodeComponent } from "../../../types"
import { Ticket, Edit as TicketEdit, X as TicketDelete } from "lucide-react"

/**
 * Ticket Created Trigger
 * Triggers when a new ticket is created in HubSpot
 *
 * API Verification:
 * - Webhook: contact.creation for ticket object type
 * - Endpoint: POST /webhooks/v3/subscriptions
 * - Subscription Type: ticket.creation
 * - Docs: https://developers.hubspot.com/docs/api/webhooks
 */
export const hubspotTriggerTicketCreated: NodeComponent = {
  type: "hubspot_trigger_ticket_created",
  title: "Ticket Created",
  description: "Triggers when a new ticket is created in HubSpot",
  icon: Ticket,
  providerId: "hubspot",
  category: "CRM",
  isTrigger: true,
  producesOutput: true,
  configSchema: [
    {
      name: "filterByPipeline",
      label: "Filter by Pipeline (Optional)",
      type: "combobox",
      required: false,
      dynamic: "hubspot_ticket_pipelines",
      loadOnMount: true,
      placeholder: "All tickets",
      description: "Only trigger for tickets in a specific pipeline"
    },
    {
      name: "filterByPriority",
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
      description: "Only trigger for tickets with specific priority"
    }
  ],
  outputSchema: [
    {
      name: "ticketId",
      label: "Ticket ID",
      type: "string",
      description: "The unique ID of the created ticket"
    },
    {
      name: "subject",
      label: "Subject",
      type: "string",
      description: "The ticket subject"
    },
    {
      name: "content",
      label: "Description",
      type: "string",
      description: "The ticket description"
    },
    {
      name: "hs_pipeline",
      label: "Pipeline",
      type: "string",
      description: "The ticket's pipeline"
    },
    {
      name: "hs_pipeline_stage",
      label: "Stage",
      type: "string",
      description: "The ticket's stage"
    },
    {
      name: "hs_ticket_priority",
      label: "Priority",
      type: "string",
      description: "The ticket's priority (LOW, MEDIUM, HIGH)"
    },
    {
      name: "hs_ticket_category",
      label: "Category",
      type: "string",
      description: "The ticket's category"
    },
    {
      name: "hubspot_owner_id",
      label: "Owner ID",
      type: "string",
      description: "The ID of the assigned owner"
    },
    {
      name: "source_type",
      label: "Source Type",
      type: "string",
      description: "How the ticket was created"
    },
    {
      name: "createDate",
      label: "Create Date",
      type: "string",
      description: "When the ticket was created"
    },
    {
      name: "portalId",
      label: "Portal ID",
      type: "string",
      description: "The HubSpot portal ID"
    }
  ],
}

/**
 * Ticket Property Updated Trigger
 * Triggers when a ticket property is updated in HubSpot
 *
 * API Verification:
 * - Webhook: ticket.propertyChange
 * - Subscription Type: ticket.propertyChange
 * - Payload includes: objectId, propertyName, propertyValue, changeSource
 */
export const hubspotTriggerTicketUpdated: NodeComponent = {
  type: "hubspot_trigger_ticket_updated",
  title: "Ticket Property Updated",
  description: "Triggers when a ticket property is updated in HubSpot",
  icon: TicketEdit,
  providerId: "hubspot",
  category: "CRM",
  isTrigger: true,
  producesOutput: true,
  configSchema: [
    {
      name: "propertyName",
      label: "Property Name",
      type: "text",
      required: false,
      placeholder: "e.g., subject, hs_pipeline_stage, hs_ticket_priority",
      description: "Optional: Filter to a specific property. Leave empty to listen to all property updates."
    },
    {
      name: "filterByPipeline",
      label: "Filter by Pipeline (Optional)",
      type: "combobox",
      required: false,
      dynamic: "hubspot_ticket_pipelines",
      loadOnMount: true,
      placeholder: "All tickets",
      description: "Only trigger for tickets in a specific pipeline"
    }
  ],
  outputSchema: [
    {
      name: "ticketId",
      label: "Ticket ID",
      type: "string",
      description: "The unique ID of the updated ticket"
    },
    {
      name: "propertyName",
      label: "Property Name",
      type: "string",
      description: "The name of the property that was updated"
    },
    {
      name: "propertyValue",
      label: "New Property Value",
      type: "string",
      description: "The new value of the updated property"
    },
    {
      name: "previousValue",
      label: "Previous Value",
      type: "string",
      description: "The previous value of the property"
    },
    {
      name: "subject",
      label: "Subject",
      type: "string",
      description: "The ticket subject"
    },
    {
      name: "content",
      label: "Description",
      type: "string",
      description: "The ticket description"
    },
    {
      name: "hs_pipeline",
      label: "Pipeline",
      type: "string",
      description: "The ticket's pipeline"
    },
    {
      name: "hs_pipeline_stage",
      label: "Stage",
      type: "string",
      description: "The ticket's stage"
    },
    {
      name: "hs_ticket_priority",
      label: "Priority",
      type: "string",
      description: "The ticket's priority"
    },
    {
      name: "updateTimestamp",
      label: "Update Timestamp",
      type: "string",
      description: "When the property was updated"
    },
    {
      name: "portalId",
      label: "Portal ID",
      type: "string",
      description: "The HubSpot portal ID"
    }
  ],
}

/**
 * Ticket Deleted Trigger
 * Triggers when a ticket is deleted from HubSpot
 *
 * API Verification:
 * - Webhook: ticket.deletion
 * - Subscription Type: ticket.deletion
 * - Note: Deleted objects have limited property data available
 */
export const hubspotTriggerTicketDeleted: NodeComponent = {
  type: "hubspot_trigger_ticket_deleted",
  title: "Ticket Deleted",
  description: "Triggers when a ticket is deleted from HubSpot",
  icon: TicketDelete,
  providerId: "hubspot",
  category: "CRM",
  isTrigger: true,
  producesOutput: true,
  configSchema: [
    {
      name: "filterByPipeline",
      label: "Filter by Pipeline (Optional)",
      type: "combobox",
      required: false,
      dynamic: "hubspot_ticket_pipelines",
      loadOnMount: true,
      placeholder: "All tickets",
      description: "Only trigger for tickets in a specific pipeline"
    }
  ],
  outputSchema: [
    {
      name: "ticketId",
      label: "Ticket ID",
      type: "string",
      description: "The unique ID of the deleted ticket"
    },
    {
      name: "subject",
      label: "Subject",
      type: "string",
      description: "The ticket subject (if available)"
    },
    {
      name: "hs_pipeline",
      label: "Pipeline",
      type: "string",
      description: "The ticket's pipeline (if available)"
    },
    {
      name: "hs_pipeline_stage",
      label: "Stage",
      type: "string",
      description: "The ticket's stage (if available)"
    },
    {
      name: "deleteTimestamp",
      label: "Delete Timestamp",
      type: "string",
      description: "When the ticket was deleted"
    },
    {
      name: "portalId",
      label: "Portal ID",
      type: "string",
      description: "The HubSpot portal ID"
    }
  ],
}

// Export all ticket triggers
export const ticketTriggers = [
  hubspotTriggerTicketCreated,
  hubspotTriggerTicketUpdated,
  hubspotTriggerTicketDeleted
]
