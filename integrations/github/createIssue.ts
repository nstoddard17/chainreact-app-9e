/**
 * GitHub Create Issue Action Handler
 * 
 * Creates a new issue in a GitHub repository using the GitHub API
 */

import { getIntegrationCredentials } from "@/lib/integrations/getDecryptedAccessToken"
import { resolveValue } from "@/lib/integrations/resolveValue"

import { logger } from '@/lib/utils/logger'

/**
 * Action metadata for UI display and reference
 */
export const ACTION_METADATA = {
  key: "github_action_create_issue",
  name: "Create GitHub Issue",
  description: "Create a new issue in a GitHub repository",
  icon: "git-pull-request"
};

/**
 * Standard interface for action parameters
 */
export interface ActionParams {
  userId: string
  config: Record<string, any>
  input: Record<string, any>
}

/**
 * Standard interface for action results
 */
export interface ActionResult {
  success: boolean
  output?: Record<string, any>
  message?: string
  error?: string
}

/**
 * Creates a new GitHub issue
 * 
 * @param params - Standard action parameters
 * @returns Action result with success/failure and any outputs
 */
export async function createGitHubIssue(params: ActionParams): Promise<ActionResult> {
  try {
    const { userId, config, input } = params
    
    // 1. Get GitHub OAuth token
    const credentials = await getIntegrationCredentials(userId, "github")
    
    // 2. Resolve any templated values in the config
    const resolvedConfig = resolveValue(config, {
      input,
    })
    
    // 3. Extract required parameters
    const { 
      owner,
      repo,
      title,
      body,
      assignees = [],
      labels = [],
      milestone
    } = resolvedConfig
    
    // 4. Validate required parameters
    if (!owner || !repo) {
      return {
        success: false,
        error: "Missing required parameters: owner and repo"
      }
    }
    
    if (!title) {
      return {
        success: false,
        error: "Missing required parameter: title"
      }
    }
    
    // 5. Prepare the request payload
    const payload: any = {
      title,
      body: body || ""
    }
    
    // Add optional parameters if provided
    if (assignees.length > 0) payload.assignees = assignees
    if (labels.length > 0) payload.labels = labels
    if (milestone) payload.milestone = milestone
    
    // 6. Make GitHub API request
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${credentials.accessToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'User-Agent': 'ChainReact-App'
      },
      body: JSON.stringify(payload)
    })
    
    // 7. Handle API response
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`GitHub API error (${response.status}): ${errorText}`)
    }
    
    const data = await response.json()
    
    // 8. Return success result with any outputs
    return {
      success: true,
      output: {
        issueId: data.id,
        issueNumber: data.number,
        title: data.title,
        body: data.body,
        state: data.state,
        url: data.html_url,
        apiUrl: data.url,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
        closedAt: data.closed_at,
        assignees: data.assignees,
        labels: data.labels,
        milestone: data.milestone
      },
      message: `Issue "${title}" created successfully in ${owner}/${repo}`
    }
    
  } catch (error: any) {
    // 9. Handle errors and return failure result
    logger.error("GitHub create issue failed:", error)
    return {
      success: false,
      error: error.message || "Failed to create GitHub issue"
    }
  }
} 