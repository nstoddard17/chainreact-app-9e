import { GitHubDataHandler } from '../types'

/**
 * Fetch repository milestones
 */
export const getGitHubMilestones: GitHubDataHandler = async (accessToken, params) => {
  const repository = params?.repository

  if (!repository) {
    throw new Error('Repository parameter is required for fetching milestones')
  }

  const response = await fetch(`https://api.github.com/repos/${repository}/milestones?per_page=100&state=open`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    }
  })

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.statusText}`)
  }

  const milestones = await response.json()

  return milestones.map((milestone: any) => ({
    value: milestone.number.toString(),
    label: milestone.title,
    description: milestone.description || undefined
  }))
}
