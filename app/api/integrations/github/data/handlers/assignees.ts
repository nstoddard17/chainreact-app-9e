import { GitHubDataHandler } from '../types'

/**
 * Fetch repository collaborators/assignees
 */
export const getGitHubAssignees: GitHubDataHandler = async (accessToken, params) => {
  const repository = params?.repository

  if (!repository) {
    throw new Error('Repository parameter is required for fetching assignees')
  }

  const response = await fetch(`https://api.github.com/repos/${repository}/collaborators?per_page=100`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    }
  })

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.statusText}`)
  }

  const collaborators = await response.json()

  return collaborators.map((user: any) => ({
    value: user.login,
    label: user.login,
    description: user.type || undefined
  }))
}
