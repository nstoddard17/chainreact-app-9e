/**
 * GitHub Data Handlers Registry
 */

import { GitHubDataHandler } from '../types'
import { getGitHubRepositories } from './repositories'
import { getGitHubBranches } from './branches'
import { getGitHubAssignees } from './assignees'
import { getGitHubLabels } from './labels'
import { getGitHubMilestones } from './milestones'

/**
 * Registry of all GitHub data handlers
 */
export const githubHandlers: Record<string, GitHubDataHandler> = {
  'github_repositories': getGitHubRepositories,
  'github_branches': getGitHubBranches,
  'github_assignees': getGitHubAssignees,
  'github_labels': getGitHubLabels,
  'github_milestones': getGitHubMilestones,
}

/**
 * Get available GitHub data types
 */
export function getAvailableGitHubDataTypes(): string[] {
  return Object.keys(githubHandlers)
}

/**
 * Check if a data type is supported
 */
export function isGitHubDataTypeSupported(dataType: string): boolean {
  return dataType in githubHandlers
}

/**
 * Get handler for a specific data type
 */
export function getGitHubHandler(dataType: string): GitHubDataHandler | null {
  return githubHandlers[dataType] || null
}
