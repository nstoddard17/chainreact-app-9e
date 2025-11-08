/**
 * GitHub Issues/Pull Requests Handler
 * Fetches issues and pull requests from a repository
 */

import { GitHubDataHandler } from '../types'

/**
 * Fetch issues and pull requests for a GitHub repository
 */
export const getGitHubIssues: GitHubDataHandler = async (accessToken, params) => {
  if (!params?.repository) {
    throw new Error('Repository parameter is required for fetching issues')
  }

  // Fetch open issues and pull requests, sorted by most recently updated
  // Using state=open to focus on active discussions (most common use case)
  // For closed issues, users can use merge fields with the issue number directly
  const response = await fetch(
    `https://api.github.com/repos/${params.repository}/issues?state=open&per_page=100&sort=updated&direction=desc`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      }
    }
  )

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.statusText}`)
  }

  const issues = await response.json()

  return issues.map((issue: any) => ({
    value: String(issue.number),
    label: `#${issue.number}: ${issue.title}`,
    description: issue.pull_request ? 'Pull Request' : 'Issue'
  }))
}
