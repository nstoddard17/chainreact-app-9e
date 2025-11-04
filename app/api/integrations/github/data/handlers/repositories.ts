import { GitHubDataHandler } from '../types'

/**
 * Fetch user's GitHub repositories
 */
export const getGitHubRepositories: GitHubDataHandler = async (accessToken, params) => {
  const response = await fetch('https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member', {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    }
  })

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.statusText}`)
  }

  const repos = await response.json()

  return repos.map((repo: any) => ({
    value: repo.full_name, // "owner/repo"
    label: repo.full_name,
    description: repo.description || undefined
  }))
}
