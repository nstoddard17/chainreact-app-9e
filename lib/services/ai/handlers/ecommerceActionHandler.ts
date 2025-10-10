import { BaseActionHandler } from "./baseActionHandler"
import { IntentAnalysisResult, Integration } from "../aiIntentAnalysisService"
import { ActionExecutionResult } from "../aiActionExecutionService"
import { runWorkflowAction } from "../utils/runWorkflowAction"

export class EcommerceActionHandler extends BaseActionHandler {
  constructor(private readonly executeAction = runWorkflowAction) {
    super()
  }

  async handleQuery(
    intent: IntentAnalysisResult,
    integrations: Integration[],
    userId: string,
    supabaseAdmin: any
  ): Promise<ActionExecutionResult> {
    this.logHandlerStart("Ecommerce", intent)

    const ecommerceIntegrations = this.filterIntegrationsByProvider(integrations, [
      "shopify", "stripe", "paypal", "gumroad", "kit"
    ])
    this.logIntegrationsFound("Ecommerce", ecommerceIntegrations)

    if (ecommerceIntegrations.length === 0) {
      return this.getNoIntegrationsResponse("e-commerce", "Shopify, Stripe, PayPal, Gumroad, or Kit")
    }

    try {
      const action = intent.action || "get_payments"
      const parameters = intent.parameters || {}

      switch (action) {
        case "get_payments":
          return this.handleGetPayments(parameters, ecommerceIntegrations, userId)
        case "get_customers":
          return this.handleGetCustomers(parameters, ecommerceIntegrations, userId)
        default:
          return this.getErrorResponse(`E-commerce query "${action}" is not supported yet.`)
      }
    } catch (error: any) {
      console.error("❌ E-commerce query error:", error)
      return this.getErrorResponse("Failed to fetch e-commerce data.")
    }
  }

  async handleAction(
    intent: IntentAnalysisResult,
    integrations: Integration[],
    userId: string,
    supabaseAdmin: any
  ): Promise<ActionExecutionResult> {
    this.logHandlerStart("Ecommerce Action", intent)

    const ecommerceIntegrations = this.filterIntegrationsByProvider(integrations, [
      "shopify", "stripe", "paypal", "gumroad", "kit"
    ])
    this.logIntegrationsFound("Ecommerce", ecommerceIntegrations)

    if (ecommerceIntegrations.length === 0) {
      return this.getNoIntegrationsResponse("e-commerce", "Shopify, Stripe, PayPal, Gumroad, or Kit")
    }

    try {
      const action = intent.action || "create_invoice"
      const parameters = intent.parameters || {}

      switch (action) {
        default:
          return this.getErrorResponse(`E-commerce action "${action}" is not supported yet.`)
      }
    } catch (error: any) {
      console.error("❌ E-commerce action error:", error)
      return this.getErrorResponse("Failed to perform the e-commerce action.")
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
    return integrations.find(i => i.provider === "stripe") || integrations[0] || null
  }

  private async handleGetPayments(
    parameters: any,
    integrations: Integration[],
    userId: string
  ): Promise<ActionExecutionResult> {
    const integration = this.getPreferredIntegration(integrations, parameters.provider)
    if (!integration || integration.provider !== "stripe") {
      return this.getErrorResponse("Payment search currently supports Stripe accounts.")
    }

    const result = await this.executeAction(
      userId,
      "stripe_action_get_payments",
      {
        limit: Math.min(Number(parameters.limit || 25), 200)
      }
    )

    if (!result.success) {
      return this.getErrorResponse(result.message || "Failed to fetch Stripe payments.")
    }

    return this.getSuccessResponse(
      `Fetched ${result.output?.payments?.length || 0} payment${(result.output?.payments?.length || 0) === 1 ? "" : "s"}.`,
      {
        type: "ecommerce_query",
        provider: "stripe",
        payments: result.output?.payments || []
      }
    )
  }

  private async handleGetCustomers(
    parameters: any,
    integrations: Integration[],
    userId: string
  ): Promise<ActionExecutionResult> {
    const integration = this.getPreferredIntegration(integrations, parameters.provider)
    if (!integration || integration.provider !== "stripe") {
      return this.getErrorResponse("Customer lookups currently support Stripe accounts.")
    }

    const result = await this.executeAction(
      userId,
      "stripe_action_get_customers",
      {
        limit: Math.min(Number(parameters.limit || 25), 200)
      }
    )

    if (!result.success) {
      return this.getErrorResponse(result.message || "Failed to fetch customers.")
    }

    return this.getSuccessResponse(
      `Fetched ${result.output?.customers?.length || 0} customer${(result.output?.customers?.length || 0) === 1 ? "" : "s"}.`,
      {
        type: "ecommerce_query",
        provider: "stripe",
        customers: result.output?.customers || []
      }
    )
  }
}
