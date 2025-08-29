import { NodeComponent } from "../../types"
import { GitBranch, AlertTriangle, GitPullRequest, AlertCircle } from "lucide-react"

// GitLab Triggers
const gitlabTriggerNewPush: NodeComponent = {
  type: "gitlab_trigger_new_push",
  title: "New push to repository",
  description: "Triggers on a new push to a repository branch",
  icon: GitBranch,
  providerId: "gitlab",
  category: "Development",
  isTrigger: true,
  requiredScopes: ["read_repository"],
  comingSoon: true,
}

const gitlabTriggerNewIssue: NodeComponent = {
  type: "gitlab_trigger_new_issue",
  title: "Issue opened or closed",
  description: "Triggers when an issue is opened or closed",
  icon: AlertTriangle,
  providerId: "gitlab",
  category: "Development",
  isTrigger: true,
  requiredScopes: ["read_repository"],
  comingSoon: true,
}

// GitLab Actions
const gitlabActionCreateProject: NodeComponent = {
  type: "gitlab_action_create_project",
  title: "Create Project",
  description: "Create a new GitLab project",
  icon: GitBranch,
  providerId: "gitlab",
  requiredScopes: ["api"],
  category: "Developer",
  isTrigger: false,
  comingSoon: true,
  configSchema: [
    { name: "name", label: "Project Name", type: "text", required: true, placeholder: "Enter project name" },
    { name: "description", label: "Description", type: "textarea", required: false, placeholder: "Project description" },
    { name: "visibility", label: "Visibility", type: "select", required: true, defaultValue: "private", options: [
      { value: "private", label: "Private" },
      { value: "internal", label: "Internal" },
      { value: "public", label: "Public" }
    ]},
    { name: "initializeWithReadme", label: "Initialize with README", type: "boolean", required: false, defaultValue: true }
  ]
}

const gitlabActionCreateMergeRequest: NodeComponent = {
  type: "gitlab_action_create_merge_request",
  title: "Create Merge Request",
  description: "Create a new merge request",
  icon: GitPullRequest,
  providerId: "gitlab",
  requiredScopes: ["api"],
  category: "Developer",
  isTrigger: false,
  comingSoon: true,
  configSchema: [
    { name: "projectId", label: "Project ID", type: "number", required: true, placeholder: "123" },
    { name: "title", label: "Title", type: "text", required: true, placeholder: "Merge request title" },
    { name: "description", label: "Description", type: "textarea", required: false, placeholder: "Merge request description" },
    { name: "sourceBranch", label: "Source Branch", type: "text", required: true, placeholder: "feature-branch" },
    { name: "targetBranch", label: "Target Branch", type: "text", required: true, defaultValue: "main", placeholder: "main" }
  ]
}

const gitlabActionCreateIssue: NodeComponent = {
  type: "gitlab_action_create_issue",
  title: "Create Issue",
  description: "Create a new issue in a GitLab project",
  icon: AlertCircle,
  providerId: "gitlab",
  requiredScopes: ["api"],
  category: "Developer",
  isTrigger: false,
  comingSoon: true,
  configSchema: [
    { name: "projectId", label: "Project ID", type: "number", required: true, placeholder: "123" },
    { name: "title", label: "Title", type: "text", required: true, placeholder: "Issue title" },
    { name: "description", label: "Description", type: "textarea", required: false, placeholder: "Issue description" },
    { name: "labels", label: "Labels", type: "text", required: false, placeholder: "bug,urgent" }
  ]
}

// Export all GitLab nodes
export const gitlabNodes: NodeComponent[] = [
  // Triggers (2)
  gitlabTriggerNewPush,
  gitlabTriggerNewIssue,
  
  // Actions (3)
  gitlabActionCreateProject,
  gitlabActionCreateMergeRequest,
  gitlabActionCreateIssue,
]