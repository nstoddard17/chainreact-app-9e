import { GitHubDataHandler } from '../types'

/**
 * Fetch branches for a GitHub repository
 */
export const getGitHubBranches: GitHubDataHandler = async (accessToken, params) => {
  if (!params?.repository) {
    throw new Error('Repository parameter is required for fetching branches')
  }

  const response = await fetch(`https://api.github.com/repos/${params.repository}/branches?per_page=100`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    }
  })

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.statusText}`)
  }

  const branches = await response.json()

  return branches.map((branch: any) => ({
    value: branch.name,
    label: branch.name,
    description: branch.commit?.sha ? `SHA: ${branch.commit.sha.substring(0, 7)}` : undefined
  }))
}
