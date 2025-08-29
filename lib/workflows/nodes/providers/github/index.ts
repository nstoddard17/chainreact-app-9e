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
    comingSoon: true,
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
    comingSoon: true,
    configSchema: [
      { name: "owner", label: "Repository Owner", type: "text", required: true, placeholder: "e.g., octocat" },
      { name: "repo", label: "Repository Name", type: "text", required: true, placeholder: "e.g., my-project" },
      { name: "title", label: "Issue Title", type: "text", required: true },
      { name: "body", label: "Issue Description", type: "textarea" },
      { name: "assignees", label: "Assignees", type: "text", placeholder: "Comma-separated usernames" },
      { name: "labels", label: "Labels", type: "text", placeholder: "Comma-separated labels" },
      { name: "milestone", label: "Milestone ID", type: "number", placeholder: "Optional milestone ID" }
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
    comingSoon: true,
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
    comingSoon: true,
    configSchema: [
      { name: "repo", label: "Repository", type: "text", required: true, placeholder: "owner/repo-name" },
      { name: "title", label: "Title", type: "text", required: true, placeholder: "Pull request title" },
      { name: "body", label: "Description", type: "textarea", required: false, placeholder: "Pull request description" },
      { name: "head", label: "Source Branch", type: "text", required: true, placeholder: "feature-branch" },
      { name: "base", label: "Target Branch", type: "text", required: true, defaultValue: "main", placeholder: "main" }
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
    comingSoon: true,
    configSchema: [
      { name: "description", label: "Description", type: "text", required: false, placeholder: "Gist description" },
      { name: "filename", label: "Filename", type: "text", required: true, placeholder: "example.js" },
      { name: "content", label: "Content", type: "textarea", required: true, placeholder: "Enter file content" },
      { name: "isPublic", label: "Public Gist", type: "boolean", required: false, defaultValue: false }
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
    comingSoon: true,
    configSchema: [
      { name: "repo", label: "Repository", type: "text", required: true, placeholder: "owner/repo-name" },
      { name: "issueNumber", label: "Issue/PR Number", type: "number", required: true, placeholder: "123" },
      { name: "body", label: "Comment", type: "textarea", required: true, placeholder: "Enter your comment" }
    ]
  },
]