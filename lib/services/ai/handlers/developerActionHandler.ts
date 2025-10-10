import { BaseActionHandler } from "./baseActionHandler"
import { IntentAnalysisResult, Integration } from "../aiIntentAnalysisService"
import { ActionExecutionResult } from "../aiActionExecutionService"
import { runWorkflowAction } from "../utils/runWorkflowAction"

export class DeveloperActionHandler extends BaseActionHandler {
  constructor(private readonly executeAction = runWorkflowAction) {
    super()
  }

  async handleQuery(
    intent: IntentAnalysisResult,
    integrations: Integration[],
    userId: string,
    supabaseAdmin: any
  ): Promise<ActionExecutionResult> {
    this.logHandlerStart("Developer", intent)

    const developerIntegrations = this.filterIntegrationsByProvider(integrations, [
      "github", "gitlab"
    ])
    this.logIntegrationsFound("Developer", developerIntegrations)

    if (developerIntegrations.length === 0) {
      return this.getNoIntegrationsResponse("developer", "GitHub or GitLab")
    }

    return this.getErrorResponse("Developer queries are not yet supported. Try asking to create an issue or PR.", "unsupported")
  }

  async handleAction(
    intent: IntentAnalysisResult,
    integrations: Integration[],
    userId: string,
    supabaseAdmin: any
  ): Promise<ActionExecutionResult> {
    this.logHandlerStart("Developer Action", intent)

    const developerIntegrations = this.filterIntegrationsByProvider(integrations, [
      "github", "gitlab"
    ])
    this.logIntegrationsFound("Developer", developerIntegrations)

    if (developerIntegrations.length === 0) {
      return this.getNoIntegrationsResponse("developer", "GitHub or GitLab")
    }

    try {
      const action = intent.action || "create_issue"
      const parameters = intent.parameters || {}

      switch (action) {
        case "create_issue":
          return this.handleCreateIssue(parameters, developerIntegrations, userId)
        case "create_pull_request":
          return this.handleCreatePR(parameters, developerIntegrations, userId)
        case "create_repository":
          return this.handleCreateRepo(parameters, developerIntegrations, userId)
        default:
          return this.getErrorResponse(`Developer action "${action}" is not supported yet.`)
      }
    } catch (error: any) {
      console.error("❌ Developer action error:", error)
      return this.getErrorResponse("Failed to perform the developer action.")
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
    return integrations.find(i => i.provider === "github") || integrations[0] || null
  }

  private async handleCreateIssue(
    parameters: any,
    integrations: Integration[],
    userId: string
  ): Promise<ActionExecutionResult> {
    const integration = this.getPreferredIntegration(integrations, parameters.provider)
    if (!integration || integration.provider !== "github") {
      return this.getErrorResponse("Creating issues currently requires a GitHub integration.")
    }

    const owner = parameters.owner || parameters.organization
    const repo = parameters.repo || parameters.repository
    const title = parameters.title || parameters.summary
    const body = parameters.body || parameters.description || parameters.content

    if (!owner || !repo || !title) {
      return this.getErrorResponse("Provide repository owner, repo name, and issue title.")
    }

    const result = await this.executeAction(
      userId,
      "github_action_create_issue",
      { owner, repo, title, body }
    )

    if (!result.success) {
      return this.getErrorResponse(result.message || "Failed to create the GitHub issue.")
    }

    return this.getSuccessResponse(
      `Created GitHub issue in ${owner}/${repo}.`,
      {
        type: "developer_action",
        provider: "github",
        issue: result.output?.issue || {}
      }
    )
  }

  private async handleCreatePR(
    parameters: any,
    integrations: Integration[],
    userId: string
  ): Promise<ActionExecutionResult> {
    const integration = this.getPreferredIntegration(integrations, parameters.provider)
    if (!integration || integration.provider !== "github") {
      return this.getErrorResponse("Creating pull requests currently requires a GitHub integration.")
    }

    const owner = parameters.owner || parameters.organization
    const repo = parameters.repo || parameters.repository
    const title = parameters.title || parameters.summary
    const head = parameters.head || parameters.sourceBranch
    const base = parameters.base || parameters.targetBranch
    const body = parameters.body || parameters.description

    if (!owner || !repo || !title || !head || !base) {
      return this.getErrorResponse("Provide repository owner, repo, title, source branch, and target branch.")
    }

    const result = await this.executeAction(
      userId,
      "github_action_create_pull_request",
      { owner, repo, title, head, base, body }
    )

    if (!result.success) {
      return this.getErrorResponse(result.message || "Failed to create the pull request.")
    }

    return this.getSuccessResponse(
      `Opened PR ${result.output?.pullRequest?.number || ""} on ${owner}/${repo}.`,
      {
        type: "developer_action",
        provider: "github",
        pullRequest: result.output?.pullRequest || {}
      }
    )
  }

  private async handleCreateRepo(
    parameters: any,
    integrations: Integration[],
    userId: string
  ): Promise<ActionExecutionResult> {
    const integration = this.getPreferredIntegration(integrations, parameters.provider)
    if (!integration || integration.provider !== "github") {
      return this.getErrorResponse("Creating repositories currently requires a GitHub integration.")
    }

    const name = parameters.name || parameters.repo || parameters.repository
    if (!name) {
      return this.getErrorResponse("Provide a name for the repository.")
    }

    const result = await this.executeAction(
      userId,
      "github_action_create_repository",
      {
        name,
        private: Boolean(parameters.private),
        description: parameters.description
      }
    )

    if (!result.success) {
      return this.getErrorResponse(result.message || "Failed to create the repository.")
    }

    return this.getSuccessResponse(
      `Created GitHub repository ${name}.`,
      {
        type: "developer_action",
        provider: "github",
        repository: result.output?.repository || {}
      }
    )
  }
}
