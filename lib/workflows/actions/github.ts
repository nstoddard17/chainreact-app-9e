import { ActionResult } from './core/executeWait'
import { getDecryptedAccessToken } from './core/getDecryptedAccessToken'
import { resolveValue } from './core/resolveValue'

/**
 * Create a new GitHub issue
 */
export async function createGitHubIssue(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const resolvedConfig = resolveValue(config, { input })
    
    const {
      repository,
      title,
      body,
      labels = [],
      assignees = [],
      milestone
    } = resolvedConfig

    if (!repository || !title) {
      throw new Error("Repository and title are required")
    }

    // Get GitHub integration
    const { createSupabaseServerClient } = await import("@/utils/supabase/server")
    const supabase = await createSupabaseServerClient()
    
    const { data: integration } = await supabase
      .from("integrations")
      .select("*")
      .eq("user_id", userId)
      .eq("provider", "github")
      .eq("status", "connected")
      .single()

    if (!integration) {
      throw new Error("GitHub integration not connected")
    }

    const accessToken = await getDecryptedAccessToken(userId, "github")

    // Parse repository (format: owner/repo)
    const [owner, repo] = repository.split('/')
    if (!owner || !repo) {
      throw new Error("Repository must be in format 'owner/repo'")
    }

    // Create issue payload
    const payload: any = {
      title: title,
      body: body || ""
    }

    if (labels.length > 0) payload.labels = labels
    if (assignees.length > 0) payload.assignees = assignees
    if (milestone) payload.milestone = milestone

    // Create issue
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues`, {
      method: "POST",
      headers: {
        Authorization: `token ${accessToken}`,
        "Accept": "application/vnd.github.v3+json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(`GitHub API error: ${response.status} - ${errorData.message || response.statusText}`)
    }

    const result = await response.json()

    return {
      success: true,
      output: {
        issueId: result.id,
        issueNumber: result.number,
        title: result.title,
        body: result.body,
        state: result.state,
        url: result.html_url,
        repository: repository,
        labels: result.labels,
        assignees: result.assignees,
        githubResponse: result
      },
      message: `GitHub issue #${result.number} created successfully in ${repository}`
    }

  } catch (error: any) {
    console.error("GitHub create issue error:", error)
    return {
      success: false,
      output: {},
      message: error.message || "Failed to create GitHub issue"
    }
  }
}

/**
 * Create a new GitHub repository
 */
export async function createGitHubRepository(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const resolvedConfig = resolveValue(config, { input })
    
    const {
      name,
      description,
      private: isPrivate = true,
      autoInit = true,
      gitignoreTemplate,
      licenseTemplate,
      homepage
    } = resolvedConfig

    if (!name) {
      throw new Error("Repository name is required")
    }

    // Get GitHub integration
    const { createSupabaseServerClient } = await import("@/utils/supabase/server")
    const supabase = await createSupabaseServerClient()
    
    const { data: integration } = await supabase
      .from("integrations")
      .select("*")
      .eq("user_id", userId)
      .eq("provider", "github")
      .eq("status", "connected")
      .single()

    if (!integration) {
      throw new Error("GitHub integration not connected")
    }

    const accessToken = await getDecryptedAccessToken(userId, "github")

    // Create repository payload
    const payload: any = {
      name: name,
      description: description || "",
      private: isPrivate,
      auto_init: autoInit
    }

    if (gitignoreTemplate) payload.gitignore_template = gitignoreTemplate
    if (licenseTemplate) payload.license_template = licenseTemplate
    if (homepage) payload.homepage = homepage

    // Create repository
    const response = await fetch("https://api.github.com/user/repos", {
      method: "POST",
      headers: {
        Authorization: `token ${accessToken}`,
        "Accept": "application/vnd.github.v3+json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(`GitHub API error: ${response.status} - ${errorData.message || response.statusText}`)
    }

    const result = await response.json()

    return {
      success: true,
      output: {
        repositoryId: result.id,
        name: result.name,
        fullName: result.full_name,
        description: result.description,
        private: result.private,
        url: result.html_url,
        cloneUrl: result.clone_url,
        sshUrl: result.ssh_url,
        defaultBranch: result.default_branch,
        githubResponse: result
      },
      message: `GitHub repository ${result.full_name} created successfully`
    }

  } catch (error: any) {
    console.error("GitHub create repository error:", error)
    return {
      success: false,
      output: {},
      message: error.message || "Failed to create GitHub repository"
    }
  }
}

/**
 * Create a new GitHub pull request
 */
export async function createGitHubPullRequest(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const resolvedConfig = resolveValue(config, { input })
    
    const {
      repository,
      title,
      body,
      head,
      base = "main",
      draft = false
    } = resolvedConfig

    if (!repository || !title || !head) {
      throw new Error("Repository, title, and head branch are required")
    }

    // Get GitHub integration
    const { createSupabaseServerClient } = await import("@/utils/supabase/server")
    const supabase = await createSupabaseServerClient()
    
    const { data: integration } = await supabase
      .from("integrations")
      .select("*")
      .eq("user_id", userId)
      .eq("provider", "github")
      .eq("status", "connected")
      .single()

    if (!integration) {
      throw new Error("GitHub integration not connected")
    }

    const accessToken = await getDecryptedAccessToken(userId, "github")

    // Parse repository (format: owner/repo)
    const [owner, repo] = repository.split('/')
    if (!owner || !repo) {
      throw new Error("Repository must be in format 'owner/repo'")
    }

    // Create pull request payload
    const payload: any = {
      title: title,
      body: body || "",
      head: head,
      base: base,
      draft: draft
    }

    // Create pull request
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls`, {
      method: "POST",
      headers: {
        Authorization: `token ${accessToken}`,
        "Accept": "application/vnd.github.v3+json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(`GitHub API error: ${response.status} - ${errorData.message || response.statusText}`)
    }

    const result = await response.json()

    return {
      success: true,
      output: {
        pullRequestId: result.id,
        pullRequestNumber: result.number,
        title: result.title,
        body: result.body,
        state: result.state,
        url: result.html_url,
        repository: repository,
        head: result.head.ref,
        base: result.base.ref,
        draft: result.draft,
        githubResponse: result
      },
      message: `GitHub pull request #${result.number} created successfully in ${repository}`
    }

  } catch (error: any) {
    console.error("GitHub create pull request error:", error)
    return {
      success: false,
      output: {},
      message: error.message || "Failed to create GitHub pull request"
    }
  }
} 