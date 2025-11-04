import { GitHubDataHandler } from '../types'

/**
 * Fetch repository labels
 */
export const getGitHubLabels: GitHubDataHandler = async (accessToken, params) => {
  const repository = params?.repository

  if (!repository) {
    throw new Error('Repository parameter is required for fetching labels')
  }

  const response = await fetch(`https://api.github.com/repos/${repository}/labels?per_page=100`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    }
  })

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.statusText}`)
  }

  const labels = await response.json()

  return labels.map((label: any) => ({
    value: label.name,
    label: label.name,
    description: label.description || undefined
  }))
}
