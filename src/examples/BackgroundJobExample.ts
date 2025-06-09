import type { TokenManagerService } from "../services/TokenManagerService"
import type { JobQueue } from "./JobQueue" // This would be your job queue implementation

interface WorkflowJobData {
  workflowId: string
  userId: string
  integrations: string[]
  input?: Record<string, any>
}

export class WorkflowExecutionService {
  constructor(
    private tokenManager: TokenManagerService,
    private jobQueue: JobQueue,
  ) {}

  /**
   * Schedule a workflow execution
   */
  async scheduleWorkflow(data: WorkflowJobData): Promise<string> {
    // Add the job to the queue
    const jobId = await this.jobQueue.add("workflow:execute", data, {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 5000, // 5 seconds
      },
    })

    return jobId
  }

  /**
   * Execute a workflow with token validation
   */
  async executeWorkflow(data: WorkflowJobData): Promise<any> {
    try {
      console.log(`Executing workflow ${data.workflowId} for user ${data.userId}`)

      // Validate all required integrations
      const tokenResults = await Promise.all(
        data.integrations.map((provider) => this.tokenManager.getValidAccessToken(data.userId, provider)),
      )

      // Check if any tokens are invalid
      const invalidTokens = tokenResults.filter((result) => !result.valid)

      if (invalidTokens.length > 0) {
        // Some tokens are invalid, handle the error
        const requiresReauth = invalidTokens.some((token) => token.requiresReauth)

        if (requiresReauth) {
          // Mark the workflow as paused and requiring reauth
          await this.markWorkflowPaused(data.workflowId, "requires_reauth", {
            invalidIntegrations: invalidTokens.map((t) => t.provider),
          })

          throw new Error(`Workflow requires re-authentication for: ${invalidTokens.map((t) => t.provider).join(", ")}`)
        } else {
          // Other token errors, retry later
          throw new Error(`Invalid tokens for: ${invalidTokens.map((t) => t.provider).join(", ")}`)
        }
      }

      // All tokens are valid, create a map of provider -> accessToken
      const accessTokens = tokenResults.reduce(
        (acc, result) => {
          acc[result.provider] = result.accessToken
          return acc
        },
        {} as Record<string, string>,
      )

      // Execute the workflow with the valid tokens
      const result = await this.executeWorkflowWithTokens(data.workflowId, data.userId, accessTokens, data.input)

      return result
    } catch (error: any) {
      console.error(`Error executing workflow ${data.workflowId}:`, error)
      throw error
    }
  }

  /**
   * Mark a workflow as paused
   */
  private async markWorkflowPaused(workflowId: string, reason: string, metadata?: Record<string, any>): Promise<void> {
    // This would update your workflow status in the database
    console.log(`Marking workflow ${workflowId} as paused: ${reason}`, metadata)
  }

  /**
   * Execute a workflow with valid tokens
   */
  private async executeWorkflowWithTokens(
    workflowId: string,
    userId: string,
    accessTokens: Record<string, string>,
    input?: Record<string, any>,
  ): Promise<any> {
    // This would be your actual workflow execution logic
    console.log(`Executing workflow ${workflowId} with tokens:`, Object.keys(accessTokens))

    // Simulate workflow execution
    return {
      success: true,
      workflowId,
      userId,
      executedAt: new Date().toISOString(),
      result: {
        message: "Workflow executed successfully",
        input,
      },
    }
  }
}
