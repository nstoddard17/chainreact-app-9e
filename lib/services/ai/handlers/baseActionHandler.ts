import { IntentAnalysisResult, Integration } from "../aiIntentAnalysisService"
import { ActionExecutionResult } from "../aiActionExecutionService"

export abstract class BaseActionHandler {
  abstract handleQuery(
    intent: IntentAnalysisResult,
    integrations: Integration[],
    userId: string,
    supabaseAdmin: any
  ): Promise<ActionExecutionResult>

  abstract handleAction(
    intent: IntentAnalysisResult,
    integrations: Integration[],
    userId: string,
    supabaseAdmin: any
  ): Promise<ActionExecutionResult>

  protected getNoIntegrationsResponse(integrationType: string, integrationName: string): ActionExecutionResult {
    return {
      content: `You don't have any ${integrationType} integrations connected. Please connect ${integrationName} to use this feature. You can do this by visiting the [Integrations page](/integrations).`,
      metadata: { type: "no_integrations", integrationType }
    }
  }

  protected getErrorResponse(message: string, errorType: string = "general_error"): ActionExecutionResult {
    return {
      content: message,
      metadata: { type: "error", errorType }
    }
  }

  protected getSuccessResponse(content: string, data: any = {}): ActionExecutionResult {
    return {
      content,
      metadata: { type: "success", ...data }
    }
  }

  protected filterIntegrationsByProvider(integrations: Integration[], providers: string[]): Integration[] {
    return integrations.filter(i => providers.includes(i.provider))
  }

  protected findIntegrationByProvider(integrations: Integration[], provider: string): Integration | undefined {
    return integrations.find(i => i.provider === provider)
  }

  protected hasValidToken(integration: Integration): boolean {
    return !!(integration.access_token || integration.refresh_token)
  }

  protected logHandlerStart(handlerType: string, intent: IntentAnalysisResult): void {
    console.log(`🎯 ${handlerType} handler - ${intent.intent}:${intent.action}`, {
      specifiedIntegration: intent.specifiedIntegration,
      parameters: intent.parameters
    })
  }

  protected logIntegrationsFound(handlerType: string, integrations: Integration[]): void {
    console.log(`🔌 ${handlerType} integrations found:`, integrations.map(i => ({
      provider: i.provider,
      hasToken: this.hasValidToken(i)
    })))
  }
}