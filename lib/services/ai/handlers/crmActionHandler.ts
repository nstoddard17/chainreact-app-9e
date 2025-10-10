import { BaseActionHandler } from "./baseActionHandler"
import { IntentAnalysisResult, Integration } from "../aiIntentAnalysisService"
import { ActionExecutionResult } from "../aiActionExecutionService"
import { runWorkflowAction } from "../utils/runWorkflowAction"

export class CRMActionHandler extends BaseActionHandler {
  constructor(private readonly executeAction = runWorkflowAction) {
    super()
  }

  async handleQuery(
    intent: IntentAnalysisResult,
    integrations: Integration[],
    userId: string,
    supabaseAdmin: any
  ): Promise<ActionExecutionResult> {
    this.logHandlerStart("CRM", intent)

    const crmIntegrations = this.filterIntegrationsByProvider(integrations, [
      "hubspot", "salesforce", "blackbaud"
    ])
    this.logIntegrationsFound("CRM", crmIntegrations)

    if (crmIntegrations.length === 0) {
      return this.getNoIntegrationsResponse("CRM", "HubSpot, Salesforce, or Blackbaud")
    }

    try {
      const action = intent.action || "get_contacts"
      const parameters = intent.parameters || {}

      switch (action) {
        case "get_contacts":
          return this.handleGetContacts(parameters, crmIntegrations, userId)
        case "get_deals":
          return this.handleGetDeals(parameters, crmIntegrations, userId)
        case "get_companies":
          return this.handleGetCompanies(parameters, crmIntegrations, userId)
        default:
          return this.getErrorResponse(`CRM query "${action}" is not supported yet.`)
      }
    } catch (error: any) {
      console.error("❌ CRM query error:", error)
      return this.getErrorResponse("Failed to fetch CRM data.")
    }
  }

  async handleAction(
    intent: IntentAnalysisResult,
    integrations: Integration[],
    userId: string,
    supabaseAdmin: any
  ): Promise<ActionExecutionResult> {
    this.logHandlerStart("CRM Action", intent)

    const crmIntegrations = this.filterIntegrationsByProvider(integrations, [
      "hubspot", "salesforce", "blackbaud"
    ])
    this.logIntegrationsFound("CRM", crmIntegrations)

    if (crmIntegrations.length === 0) {
      return this.getNoIntegrationsResponse("CRM", "HubSpot, Salesforce, or Blackbaud")
    }

    try {
      const action = intent.action || "create_contact"
      const parameters = intent.parameters || {}

      switch (action) {
        case "create_contact":
          return this.handleCreateContact(parameters, crmIntegrations, userId)
        case "create_deal":
          return this.handleCreateDeal(parameters, crmIntegrations, userId)
        case "update_deal":
          return this.handleUpdateDeal(parameters, crmIntegrations, userId)
        default:
          return this.getErrorResponse(`CRM action "${action}" is not supported yet.`)
      }
    } catch (error: any) {
      console.error("❌ CRM action error:", error)
      return this.getErrorResponse("Failed to complete the CRM action.")
    }
  }

  private getPreferredIntegration(
    integrations: Integration[],
    specified?: string
  ): Integration | null {
    if (specified) {
      const match = integrations.find(i => i.provider === specified)
      if (match) return match
    }
    return integrations.find(i => i.provider === "hubspot") || integrations[0] || null
  }

  private async handleGetContacts(
    parameters: any,
    integrations: Integration[],
    userId: string
  ): Promise<ActionExecutionResult> {
    const integration = this.getPreferredIntegration(integrations, parameters.provider)
    if (!integration || integration.provider !== "hubspot") {
      return this.getErrorResponse("Contact lookups currently require a HubSpot integration.")
    }

    const result = await this.executeAction(
      userId,
      "hubspot_action_get_contacts",
      {
        limit: Math.min(Number(parameters.limit || 20), 100),
        properties: parameters.properties || ["firstname", "lastname", "email"]
      }
    )

    if (!result.success) {
      return this.getErrorResponse(result.message || "Failed to fetch contacts.")
    }

    return this.getSuccessResponse(
      `Fetched ${result.output?.results?.length || 0} HubSpot contact${(result.output?.results?.length || 0) === 1 ? "" : "s"}.`,
      {
        type: "crm_query",
        provider: "hubspot",
        contacts: result.output?.results || []
      }
    )
  }

  private async handleGetDeals(
    parameters: any,
    integrations: Integration[],
    userId: string
  ): Promise<ActionExecutionResult> {
    const integration = this.getPreferredIntegration(integrations, parameters.provider)
    if (!integration || integration.provider !== "hubspot") {
      return this.getErrorResponse("Deal lookups currently require a HubSpot integration.")
    }

    const result = await this.executeAction(
      userId,
      "hubspot_action_get_deals",
      {
        limit: Math.min(Number(parameters.limit || 20), 100),
        properties: parameters.properties || ["dealname", "amount", "dealstage"]
      }
    )

    if (!result.success) {
      return this.getErrorResponse(result.message || "Failed to fetch deals.")
    }

    return this.getSuccessResponse(
      `Fetched ${result.output?.results?.length || 0} deal${(result.output?.results?.length || 0) === 1 ? "" : "s"}.`,
      {
        type: "crm_query",
        provider: "hubspot",
        deals: result.output?.results || []
      }
    )
  }

  private async handleGetCompanies(
    parameters: any,
    integrations: Integration[],
    userId: string
  ): Promise<ActionExecutionResult> {
    const integration = this.getPreferredIntegration(integrations, parameters.provider)
    if (!integration || integration.provider !== "hubspot") {
      return this.getErrorResponse("Company lookups currently require a HubSpot integration.")
    }

    const result = await this.executeAction(
      userId,
      "hubspot_action_get_companies",
      {
        limit: Math.min(Number(parameters.limit || 20), 100),
        properties: parameters.properties || ["name", "domain", "industry"]
      }
    )

    if (!result.success) {
      return this.getErrorResponse(result.message || "Failed to fetch companies.")
    }

    return this.getSuccessResponse(
      `Fetched ${result.output?.results?.length || 0} compan${(result.output?.results?.length || 0) === 1 ? "y" : "ies"}.`,
      {
        type: "crm_query",
        provider: "hubspot",
        companies: result.output?.results || []
      }
    )
  }

  private async handleCreateContact(
    parameters: any,
    integrations: Integration[],
    userId: string
  ): Promise<ActionExecutionResult> {
    const integration = this.getPreferredIntegration(integrations, parameters.provider)
    if (!integration || integration.provider !== "hubspot") {
      return this.getErrorResponse("Creating contacts currently requires a HubSpot integration.")
    }

    const { email, firstName, lastName } = parameters
    if (!email) {
      return this.getErrorResponse("Provide an email address for the contact.")
    }

    const result = await this.executeAction(
      userId,
      "hubspot_action_create_contact",
      {
        email,
        firstName: firstName || parameters.firstname,
        lastName: lastName || parameters.lastname,
        phone: parameters.phone,
        company: parameters.company,
        lifecycleStage: parameters.lifecycleStage
      }
    )

    if (!result.success) {
      return this.getErrorResponse(result.message || "Failed to create the contact.")
    }

    return this.getSuccessResponse(
      `Created HubSpot contact for ${email}.`,
      {
        type: "crm_action",
        provider: "hubspot",
        contact: result.output?.contact || {}
      }
    )
  }

  private async handleCreateDeal(
    parameters: any,
    integrations: Integration[],
    userId: string
  ): Promise<ActionExecutionResult> {
    const integration = this.getPreferredIntegration(integrations, parameters.provider)
    if (!integration || integration.provider !== "hubspot") {
      return this.getErrorResponse("Creating deals currently requires a HubSpot integration.")
    }

    const name = parameters.name || parameters.dealName
    if (!name) {
      return this.getErrorResponse("Provide a name for the deal.")
    }

    const result = await this.executeAction(
      userId,
      "hubspot_action_create_deal",
      {
        dealName: name,
        amount: parameters.amount,
        pipeline: parameters.pipeline,
        stage: parameters.dealStage || parameters.stage,
        closeDate: parameters.closeDate,
        ownerId: parameters.ownerId
      }
    )

    if (!result.success) {
      return this.getErrorResponse(result.message || "Failed to create the deal.")
    }

    return this.getSuccessResponse(
      `Created HubSpot deal "${name}".`,
      {
        type: "crm_action",
        provider: "hubspot",
        deal: result.output?.deal || {}
      }
    )
  }

  private async handleUpdateDeal(
    parameters: any,
    integrations: Integration[],
    userId: string
  ): Promise<ActionExecutionResult> {
    const integration = this.getPreferredIntegration(integrations, parameters.provider)
    if (!integration || integration.provider !== "hubspot") {
      return this.getErrorResponse("Updating deals currently requires a HubSpot integration.")
    }

    const dealId = parameters.dealId || parameters.id
    if (!dealId) {
      return this.getErrorResponse("Provide the HubSpot deal ID to update.")
    }

    const result = await this.executeAction(
      userId,
      "hubspot_action_update_deal",
      {
        dealId,
        amount: parameters.amount,
        pipeline: parameters.pipeline,
        stage: parameters.dealStage || parameters.stage,
        closeDate: parameters.closeDate,
        ownerId: parameters.ownerId
      }
    )

    if (!result.success) {
      return this.getErrorResponse(result.message || "Failed to update the deal.")
    }

    return this.getSuccessResponse(
      `Updated HubSpot deal ${dealId}.`,
      {
        type: "crm_action",
        provider: "hubspot",
        deal: result.output?.deal || {},
        dealId
      }
    )
  }
}
