import { 
  DevOpsProvider, 
  Repository, 
  RepositoryResult, 
  Issue, 
  IssueResult, 
  PullRequest, 
  PullRequestResult, 
  RepoFilters, 
  IssueFilters 
} from '../../domains/integrations/ports/capability-interfaces'
import { CapabilityDescriptor, ErrorClassification } from '../../domains/integrations/ports/connector-contract'
import { 
  createGitHubIssue, 
  createGitHubRepository, 
  createGitHubPullRequest 
} from '../../../lib/workflows/actions/github'
import { getDecryptedAccessToken } from '../../../lib/workflows/actions/core/getDecryptedAccessToken'

export class GitHubAdapter implements DevOpsProvider {
  readonly providerId = 'github'
  readonly capabilities: CapabilityDescriptor = {
    supportsWebhooks: true,
    rateLimits: [
      { type: 'requests', limit: 5000, window: 3600000 }, // 5000 requests per hour for authenticated requests
      { type: 'search', limit: 30, window: 60000 } // 30 search queries per minute
    ],
    supportedFeatures: [
      'create_repository',
      'create_issue',
      'create_pull_request',
      'get_repositories',
      'get_issues',
      'update_issue',
      'webhooks',
      'actions',
      'releases'
    ]
  }

  async validateConnection(userId: string): Promise<boolean> {
    try {
      const accessToken = await getDecryptedAccessToken(userId, 'github')
      const response = await fetch('https://api.github.com/user', {
        headers: { 
          'Authorization': `token ${accessToken}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      })
      return response.ok
    } catch {
      return false
    }
  }

  async createRepository(params: Repository, userId: string): Promise<RepositoryResult> {
    try {
      // Use existing GitHub implementation
      const config = {
        name: params.name,
        description: params.description,
        private: params.private || true,
        autoInit: true
      }

      const result = await createGitHubRepository(config, userId, {})
      
      if (result.success) {
        return {
          success: true,
          output: {
            repositoryId: result.output.repositoryId,
            name: result.output.name,
            url: result.output.url,
            cloneUrl: result.output.cloneUrl,
            sshUrl: result.output.sshUrl,
            defaultBranch: result.output.defaultBranch,
            githubResponse: result.output.githubResponse
          },
          message: result.message
        }
      } 
        return {
          success: false,
          error: result.message || 'Failed to create GitHub repository',
          output: result.output
        }
      
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to create GitHub repository',
        output: { error: error.message, timestamp: new Date().toISOString() }
      }
    }
  }

  async createIssue(params: Issue, userId: string): Promise<IssueResult> {
    try {
      // Use existing GitHub implementation
      const config = {
        repository: params.repository,
        title: params.title,
        body: params.body,
        labels: params.labels || [],
        assignees: params.assignees || [],
        milestone: params.milestone
      }

      const result = await createGitHubIssue(config, userId, {})
      
      if (result.success) {
        return {
          success: true,
          output: {
            issueId: result.output.issueId,
            issueNumber: result.output.issueNumber,
            title: result.output.title,
            body: result.output.body,
            state: result.output.state,
            url: result.output.url,
            labels: result.output.labels,
            assignees: result.output.assignees,
            githubResponse: result.output.githubResponse
          },
          message: result.message
        }
      } 
        return {
          success: false,
          error: result.message || 'Failed to create GitHub issue',
          output: result.output
        }
      
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to create GitHub issue',
        output: { error: error.message }
      }
    }
  }

  async createPullRequest(params: PullRequest, userId: string): Promise<PullRequestResult> {
    try {
      // Use existing GitHub implementation
      const config = {
        repository: params.repository,
        title: params.title,
        body: params.body,
        head: params.head,
        base: params.base || 'main',
        draft: params.draft || false
      }

      const result = await createGitHubPullRequest(config, userId, {})
      
      if (result.success) {
        return {
          success: true,
          output: {
            pullRequestId: result.output.pullRequestId,
            pullRequestNumber: result.output.pullRequestNumber,
            title: result.output.title,
            body: result.output.body,
            state: result.output.state,
            url: result.output.url,
            head: result.output.head,
            base: result.output.base,
            draft: result.output.draft,
            githubResponse: result.output.githubResponse
          },
          message: result.message
        }
      } 
        return {
          success: false,
          error: result.message || 'Failed to create GitHub pull request',
          output: result.output
        }
      
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to create GitHub pull request',
        output: { error: error.message }
      }
    }
  }

  async getRepositories(filters?: RepoFilters, userId?: string): Promise<Repository[]> {
    if (!userId) {
      throw new Error('User ID is required for getRepositories')
    }

    try {
      const accessToken = await getDecryptedAccessToken(userId, 'github')
      
      let url = 'https://api.github.com/user/repos'
      const params = new URLSearchParams()
      
      if (filters?.private !== undefined) {
        params.append('type', filters.private ? 'private' : 'public')
      }
      if (filters?.limit) {
        params.append('per_page', filters.limit.toString())
      }
      
      if (params.toString()) {
        url += `?${params.toString()}`
      }

      const response = await fetch(url, {
        headers: {
          'Authorization': `token ${accessToken}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      })

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status}`)
      }

      const repos = await response.json()
      
      return repos.map((repo: any) => ({
        id: repo.id.toString(),
        name: repo.name,
        description: repo.description || '',
        private: repo.private,
        owner: repo.owner.login,
        defaultBranch: repo.default_branch
      }))
    } catch (error: any) {
      console.error('Failed to get GitHub repositories:', error)
      return []
    }
  }

  async getIssues(filters?: IssueFilters, userId?: string): Promise<Issue[]> {
    if (!userId) {
      throw new Error('User ID is required for getIssues')
    }

    try {
      const accessToken = await getDecryptedAccessToken(userId, 'github')
      
      let url: string
      if (filters?.repository) {
        const [owner, repo] = filters.repository.split('/')
        url = `https://api.github.com/repos/${owner}/${repo}/issues`
      } else {
        url = 'https://api.github.com/issues'
      }
      
      const params = new URLSearchParams()
      
      if (filters?.state) {
        params.append('state', filters.state)
      }
      if (filters?.labels && filters.labels.length > 0) {
        params.append('labels', filters.labels.join(','))
      }
      if (filters?.assignee) {
        params.append('assignee', filters.assignee)
      }
      if (filters?.limit) {
        params.append('per_page', filters.limit.toString())
      }
      
      if (params.toString()) {
        url += `?${params.toString()}`
      }

      const response = await fetch(url, {
        headers: {
          'Authorization': `token ${accessToken}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      })

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status}`)
      }

      const issues = await response.json()
      
      return issues.map((issue: any) => ({
        id: issue.id.toString(),
        title: issue.title,
        body: issue.body || '',
        labels: issue.labels?.map((label: any) => label.name) || [],
        assignees: issue.assignees?.map((assignee: any) => assignee.login) || [],
        repository: issue.repository?.full_name,
        state: issue.state
      }))
    } catch (error: any) {
      console.error('Failed to get GitHub issues:', error)
      return []
    }
  }

  async updateIssue(issueId: string, updates: Partial<Issue>, userId: string): Promise<IssueResult> {
    try {
      const accessToken = await getDecryptedAccessToken(userId, 'github')
      
      if (!updates.repository) {
        throw new Error('Repository is required to update an issue')
      }

      const [owner, repo] = updates.repository.split('/')
      
      const updateData: any = {}
      if (updates.title) updateData.title = updates.title
      if (updates.body) updateData.body = updates.body
      if (updates.state) updateData.state = updates.state
      if (updates.labels) updateData.labels = updates.labels
      if (updates.assignees) updateData.assignees = updates.assignees

      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues/${issueId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `token ${accessToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updateData)
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`GitHub API error: ${response.status} - ${errorData.message || response.statusText}`)
      }

      const result = await response.json()
      
      return {
        success: true,
        output: {
          issueId: result.id.toString(),
          issueNumber: result.number,
          title: result.title,
          body: result.body,
          state: result.state,
          url: result.html_url,
          labels: result.labels,
          assignees: result.assignees,
          githubResponse: result
        },
        message: `GitHub issue #${result.number} updated successfully`
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to update GitHub issue',
        output: { error: error.message }
      }
    }
  }

  classifyError(error: Error): ErrorClassification {
    const message = error.message.toLowerCase()
    
    if (message.includes('unauthorized') || message.includes('bad credentials')) {
      return 'authentication'
    }
    if (message.includes('forbidden') || message.includes('permission')) {
      return 'authorization'
    }
    if (message.includes('rate limit') || message.includes('api rate limit exceeded')) {
      return 'rateLimit'
    }
    if (message.includes('network') || message.includes('timeout')) {
      return 'network'
    }
    if (message.includes('not found')) {
      return 'notFound'
    }
    if (message.includes('validation failed') || message.includes('invalid')) {
      return 'validation'
    }
    
    return 'unknown'
  }
}