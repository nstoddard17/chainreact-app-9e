import { GitBranch, Plus, GitPullRequest, FileText, MessageSquare } from "lucide-react"
import { NodeComponent } from "../../types"

// Import GitHub action metadata if it exists
const GITHUB_CREATE_ISSUE_METADATA = { key: "github_action_create_issue", name: "Create Issue", description: "Creates a new issue in a GitHub repository." }

export const githubNodes: NodeComponent[] = [
  {
    type: "github_trigger_new_commit",
    title: "New Commit",
    description: "Triggers when a new commit is pushed to a branch.",
    icon: GitBranch,
    providerId: "github",
    category: "Development",
    isTrigger: true,
  },
  {
    type: "github_action_create_issue",
    title: "Create Issue",
    description: "Creates a new issue in a GitHub repository.",
    icon: Plus,
    providerId: "github",
    requiredScopes: ["repo"],
    category: "Development",
    isTrigger: false,
    configSchema: [
      {
        name: "repository",
        label: "Repository",
        type: "combobox",
        required: true,
        dynamic: "github_repositories",
        description: "Select a repository from your GitHub account"
      },
      {
        name: "title",
        label: "Issue Title",
        type: "text",
        required: true,
        description: "A brief, descriptive title for the issue"
      },
      {
        name: "body",
        label: "Issue Description",
        type: "textarea",
        description: "Detailed description of the issue, including steps to reproduce if applicable"
      },
      {
        name: "assignees",
        label: "Assignees",
        type: "multiselect",
        dynamic: "github_assignees",
        dependsOn: "repository",
        description: "GitHub users to assign to this issue"
      },
      {
        name: "labels",
        label: "Labels",
        type: "multiselect",
        dynamic: "github_labels",
        dependsOn: "repository",
        description: "Labels to categorize and organize the issue"
      },
      {
        name: "milestone",
        label: "Milestone",
        type: "combobox",
        dynamic: "github_milestones",
        dependsOn: "repository",
        description: "Associate this issue with a milestone"
      }
    ],
    outputSchema: [
      {
        name: "issueId",
        label: "Issue ID",
        type: "string",
        description: "The unique ID of the created issue"
      },
      {
        name: "issueNumber",
        label: "Issue Number",
        type: "number",
        description: "The issue number in the repository"
      },
      {
        name: "title",
        label: "Issue Title",
        type: "string",
        description: "The title of the created issue"
      },
      {
        name: "url",
        label: "Issue URL",
        type: "string",
        description: "The web URL of the created issue"
      },
      {
        name: "state",
        label: "Issue State",
        type: "string",
        description: "The current state of the issue (open/closed)"
      },
      {
        name: "createdAt",
        label: "Created At",
        type: "string",
        description: "When the issue was created"
      }
    ]
  },
  {
    type: "github_action_create_repository",
    title: "Create Repository",
    description: "Create a new GitHub repository",
    icon: GitBranch,
    providerId: "github",
    requiredScopes: ["repo"],
    category: "Developer",
    isTrigger: false,
    configSchema: [
      { name: "name", label: "Repository Name", type: "text", required: true, placeholder: "Enter repository name" },
      { name: "description", label: "Description", type: "textarea", required: false, placeholder: "Repository description" },
      { name: "isPrivate", label: "Private Repository", type: "boolean", required: false, defaultValue: false },
      { name: "autoInit", label: "Initialize with README", type: "boolean", required: false, defaultValue: true },
      { name: "license", label: "License", type: "select", required: false, options: [
        { value: "mit", label: "MIT License" },
        { value: "apache-2.0", label: "Apache License 2.0" },
        { value: "gpl-3.0", label: "GNU General Public License v3.0" },
        { value: "bsd-3-clause", label: "BSD 3-Clause License" }
      ] }
    ]
  },
  {
    type: "github_action_create_pull_request",
    title: "Create Pull Request",
    description: "Create a new pull request",
    icon: GitPullRequest,
    providerId: "github",
    requiredScopes: ["repo"],
    category: "Developer",
    isTrigger: false,
    configSchema: [
      { name: "repository", label: "Repository", type: "text", required: true, placeholder: "owner/repo (e.g., octocat/my-project)" },
      { name: "title", label: "PR Title", type: "text", required: true, placeholder: "Summary of changes" },
      { name: "body", label: "Description", type: "textarea", required: false, placeholder: "Detailed description of changes, testing notes, etc." },
      { name: "head", label: "Source Branch", type: "text", required: true, placeholder: "feature-branch or feature/new-feature" },
      { name: "base", label: "Target Branch", type: "text", required: true, defaultValue: "main", placeholder: "main (or develop, master, etc.)" }
    ],
    outputSchema: [
      { name: "pullRequestId", label: "PR ID", type: "string", description: "The unique ID of the pull request" },
      { name: "pullRequestNumber", label: "PR Number", type: "number", description: "The PR number in the repository" },
      { name: "title", label: "PR Title", type: "string", description: "The title of the pull request" },
      { name: "url", label: "PR URL", type: "string", description: "The web URL of the pull request" },
      { name: "state", label: "PR State", type: "string", description: "The current state (open/closed)" },
      { name: "draft", label: "Is Draft", type: "boolean", description: "Whether the PR is a draft" }
    ]
  },
  {
    type: "github_action_create_gist",
    title: "Create Gist",
    description: "Create a new GitHub Gist",
    icon: FileText,
    providerId: "github",
    requiredScopes: ["gist"],
    category: "Developer",
    isTrigger: false,
    configSchema: [
      { name: "description", label: "Description", type: "text", required: false, placeholder: "Brief description of the gist" },
      { name: "filename", label: "Filename", type: "text", required: true, placeholder: "example.js (include file extension)" },
      { name: "content", label: "Content", type: "textarea", required: true, placeholder: "Enter file content (code, text, etc.)" },
      { name: "isPublic", label: "Public Gist", type: "boolean", required: false, defaultValue: false }
    ],
    outputSchema: [
      { name: "gistId", label: "Gist ID", type: "string", description: "The unique ID of the gist" },
      { name: "url", label: "Gist URL", type: "string", description: "The web URL of the gist" },
      { name: "description", label: "Description", type: "string", description: "The gist description" },
      { name: "public", label: "Is Public", type: "boolean", description: "Whether the gist is public" }
    ]
  },
  {
    type: "github_action_add_comment",
    title: "Add Comment",
    description: "Add a comment to an issue or pull request",
    icon: MessageSquare,
    providerId: "github",
    requiredScopes: ["repo"],
    category: "Developer",
    isTrigger: false,
    configSchema: [
      { name: "repository", label: "Repository", type: "text", required: true, placeholder: "owner/repo (e.g., octocat/my-project)" },
      { name: "issueNumber", label: "Issue/PR Number", type: "number", required: true, placeholder: "123" },
      { name: "body", label: "Comment", type: "textarea", required: true, placeholder: "Enter your comment (supports Markdown)" }
    ],
    outputSchema: [
      { name: "commentId", label: "Comment ID", type: "string", description: "The unique ID of the comment" },
      { name: "url", label: "Comment URL", type: "string", description: "The web URL of the comment" },
      { name: "body", label: "Comment Body", type: "string", description: "The comment text" }
    ]
  },
]