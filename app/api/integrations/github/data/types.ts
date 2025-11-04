/**
 * GitHub Data API Types
 */

export interface GitHubDataOption {
  value: string
  label: string
  description?: string
}

export interface GitHubDataParams {
  repository?: string
  [key: string]: any
}

export type GitHubDataHandler = (
  accessToken: string,
  params?: GitHubDataParams
) => Promise<GitHubDataOption[]>
