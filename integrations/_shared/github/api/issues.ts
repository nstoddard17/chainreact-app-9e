import { githubRequest } from "./_request";

/**
 * GitHub REST `/repos/{owner}/{repo}/issues` resource wrappers.
 *
 * Slice 14b Commit 3. Per-resource thin wrapper layer.
 *
 * Resources covered:
 *   - `issuesCreate` — POST `/repos/{owner}/{repo}/issues` (Slice 14b
 *     `create_issue`).
 *   - `issueCommentsCreate` — POST `/repos/{owner}/{repo}/issues/{number}/comments`
 *     (Slice 14b `add_comment`). Note: GitHub treats PRs as issues
 *     for comment purposes — this same endpoint adds review-area
 *     comments to PRs as well as issue comments.
 */

// ─── Wire-format response types ─────────────────────────────────────────────

export interface GitHubLabel {
  id?: number;
  name: string;
  color?: string;
  description?: string | null;
}

export interface GitHubUserSummary {
  login: string;
  id: number;
  avatar_url?: string;
  type?: string;
}

export interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  body?: string | null;
  state: string;
  html_url: string;
  labels?: GitHubLabel[];
  assignees?: GitHubUserSummary[];
  user?: GitHubUserSummary;
  created_at?: string;
  updated_at?: string;
  closed_at?: string | null;
}

export interface GitHubIssueComment {
  id: number;
  body: string;
  html_url: string;
  user?: GitHubUserSummary;
  created_at?: string;
  updated_at?: string;
}

// ─── issuesCreate ───────────────────────────────────────────────────────────

export interface IssuesCreateInput {
  accessToken: string;
  owner: string;
  repo: string;
  title: string;
  body?: string;
  /** Issue assignees by GitHub login. */
  assignees?: string[];
  /** Label names. */
  labels?: string[];
  /** Numeric milestone id. */
  milestone?: number;
}

export async function issuesCreate(
  input: IssuesCreateInput,
): Promise<GitHubIssue> {
  const body: Record<string, unknown> = { title: input.title };
  if (input.body !== undefined) body.body = input.body;
  if (input.assignees !== undefined && input.assignees.length > 0) {
    body.assignees = input.assignees;
  }
  if (input.labels !== undefined && input.labels.length > 0) {
    body.labels = input.labels;
  }
  if (input.milestone !== undefined) body.milestone = input.milestone;

  return githubRequest<GitHubIssue>({
    accessToken: input.accessToken,
    method: "POST",
    path: `/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repo)}/issues`,
    body,
    resourceForNotFound: `issue (create) on ${input.owner}/${input.repo}`,
  });
}

// ─── issueCommentsCreate ────────────────────────────────────────────────────

export interface IssueCommentsCreateInput {
  accessToken: string;
  owner: string;
  repo: string;
  /**
   * Issue or PR number. GitHub uses the same endpoint for both —
   * PRs are issues from the comment API's perspective.
   */
  issueNumber: number;
  body: string;
}

export async function issueCommentsCreate(
  input: IssueCommentsCreateInput,
): Promise<GitHubIssueComment> {
  return githubRequest<GitHubIssueComment>({
    accessToken: input.accessToken,
    method: "POST",
    path: `/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repo)}/issues/${input.issueNumber}/comments`,
    body: { body: input.body },
    resourceForNotFound: `comment on ${input.owner}/${input.repo}#${input.issueNumber}`,
  });
}
