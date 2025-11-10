import { NodeComponent } from "../../../types"
import { Users, FileText, GitBranch } from "lucide-react"

/**
 * Get Owners Action
 */
export const hubspotActionGetOwners: NodeComponent = {
  type: "hubspot_action_get_owners",
  title: "Get Owners",
  description: "Retrieve HubSpot users/owners",
  icon: Users,
  providerId: "hubspot",
  requiredScopes: ["crm.objects.owners.read"],
  category: "Utilities",
  isTrigger: false,
  configSchema: [
    {
      name: "limit",
      label: "Limit",
      type: "number",
      required: false,
      defaultValue: 100,
      placeholder: "100",
      description: "Maximum number of owners to retrieve"
    },
    {
      name: "email",
      label: "Filter by Email",
      type: "text",
      required: false,
      placeholder: "owner@example.com",
      description: "Filter owners by email address (optional)"
    }
  ],
  producesOutput: true,
  outputSchema: [
    {
      name: "owners",
      label: "Owners",
      type: "array",
      description: "Array of owners from HubSpot"
    },
    {
      name: "count",
      label: "Count",
      type: "number",
      description: "Number of owners retrieved"
    },
    {
      name: "total",
      label: "Total",
      type: "number",
      description: "Total number of owners"
    }
  ]
}

/**
 * Get Forms Action
 */
export const hubspotActionGetForms: NodeComponent = {
  type: "hubspot_action_get_forms",
  title: "Get Forms",
  description: "Retrieve HubSpot forms",
  icon: FileText,
  providerId: "hubspot",
  requiredScopes: ["forms"],
  category: "Utilities",
  isTrigger: false,
  configSchema: [
    {
      name: "limit",
      label: "Limit",
      type: "number",
      required: false,
      defaultValue: 100,
      placeholder: "100",
      description: "Maximum number of forms to retrieve"
    }
  ],
  producesOutput: true,
  outputSchema: [
    {
      name: "forms",
      label: "Forms",
      type: "array",
      description: "Array of forms from HubSpot"
    },
    {
      name: "count",
      label: "Count",
      type: "number",
      description: "Number of forms retrieved"
    },
    {
      name: "total",
      label: "Total",
      type: "number",
      description: "Total number of forms"
    }
  ]
}

/**
 * Get Deal Pipelines Action
 */
export const hubspotActionGetDealPipelines: NodeComponent = {
  type: "hubspot_action_get_deal_pipelines",
  title: "Get Deal Pipelines",
  description: "Retrieve deal pipelines and their stages",
  icon: GitBranch,
  providerId: "hubspot",
  requiredScopes: ["crm.schemas.deals.read"],
  category: "Utilities",
  isTrigger: false,
  configSchema: [],
  producesOutput: true,
  outputSchema: [
    {
      name: "pipelines",
      label: "Pipelines",
      type: "array",
      description: "Array of pipelines with their stages"
    },
    {
      name: "count",
      label: "Count",
      type: "number",
      description: "Number of pipelines"
    }
  ]
}

export const utilityActions = [
  hubspotActionGetOwners,
  hubspotActionGetForms,
  hubspotActionGetDealPipelines
]
