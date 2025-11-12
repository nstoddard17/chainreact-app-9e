import { NodeComponent } from "../../../types"
import { UserMinus } from "lucide-react"

/**
 * Remove Contact from List Action
 */
export const hubspotActionRemoveFromList: NodeComponent = {
  type: "hubspot_action_remove_from_list",
  title: "Remove Contact from List",
  description: "Remove a contact from a HubSpot list",
  icon: UserMinus,
  providerId: "hubspot",
  requiredScopes: ["contacts"],
  category: "Lists",
  isTrigger: false,
  configSchema: [
    {
      name: "listId",
      label: "List",
      type: "combobox",
      dynamic: "hubspot_lists",
      required: true,
      loadOnMount: true,
      searchable: true,
      placeholder: "Select list",
      description: "Choose the list to remove the contact from"
    },
    {
      name: "contactId",
      label: "Contact",
      type: "combobox",
      dynamic: "hubspot_contacts",
      loadOnMount: true,
      searchable: true,
      creatable: true,
      required: true,
      placeholder: "Select or type contact",
      description: "Choose the contact to remove (or type an email manually)"
    }
  ],
  producesOutput: true,
  outputSchema: [
    { name: "success", label: "Success", type: "boolean", description: "Whether the removal succeeded" },
    { name: "listId", label: "List ID", type: "string", description: "The list ID" },
    { name: "contactId", label: "Contact ID", type: "string", description: "The removed contact's ID" },
    { name: "removedAt", label: "Removed At", type: "string", description: "When the contact was removed (ISO 8601)" }
  ]
}

export const listManagementActions = [
  hubspotActionRemoveFromList
]
