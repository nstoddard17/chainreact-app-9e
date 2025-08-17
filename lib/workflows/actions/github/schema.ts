import { FieldSchema } from '../../../ai/smartAIAgent';

export const createIssue: FieldSchema[] = [
  {
    name: 'title',
    type: 'string',
    required: true,
    description: 'Issue title - concise description of the problem or request',
    examples: [
      'Bug: Login form validation not working',
      'Feature: Add dark mode toggle',
      'Documentation: Update API examples'
    ],
    priority: 'high'
  },
  {
    name: 'body',
    type: 'string',
    required: false,
    description: 'Issue description with details, steps to reproduce, expected behavior',
    examples: [
      '## Problem\nThe login form accepts invalid email formats...\n\n## Steps to Reproduce\n1. Go to login page\n2. Enter invalid email...',
      '## Feature Request\nAdd a dark mode toggle to the user interface...\n\n## Acceptance Criteria\n- [ ] Toggle in settings page...'
    ],
    priority: 'high'
  },
  {
    name: 'assignees',
    type: 'array',
    required: false,
    description: 'GitHub usernames to assign the issue to',
    examples: [['johndoe'], ['developer1', 'developer2']],
    priority: 'medium'
  },
  {
    name: 'milestone',
    type: 'string',
    required: false,
    description: 'Milestone title or number to associate with the issue',
    examples: ['v1.2.0', 'Sprint 5', '3'],
    priority: 'medium'
  },
  {
    name: 'labels',
    type: 'array',
    required: false,
    description: 'Array of label names to add to the issue',
    examples: [
      ['bug', 'high-priority'],
      ['enhancement', 'frontend'],
      ['documentation', 'good-first-issue']
    ],
    priority: 'medium'
  },
  {
    name: 'repository',
    type: 'string',
    required: true,
    description: 'Repository name in format "owner/repo"',
    examples: ['chainreact/app', 'company/project-name'],
    priority: 'high'
  }
];

export const createPullRequest: FieldSchema[] = [
  {
    name: 'title',
    type: 'string',
    required: true,
    description: 'Pull request title - summary of changes',
    examples: [
      'Fix: Resolve login validation bug',
      'Feature: Add user profile page',
      'Refactor: Optimize database queries'
    ],
    priority: 'high'
  },
  {
    name: 'body',
    type: 'string',
    required: false,
    description: 'Pull request description with changes, testing, and notes',
    examples: [
      '## Changes\n- Fixed email validation regex\n- Added tests for edge cases\n\n## Testing\n- [ ] Unit tests pass\n- [ ] Manual testing completed',
      '## Summary\nThis PR adds a new user profile page...\n\n## Screenshots\n![Profile page](url)\n\n## Breaking Changes\nNone'
    ],
    priority: 'high'
  },
  {
    name: 'head',
    type: 'string',
    required: true,
    description: 'Branch name containing the changes',
    examples: ['feature/user-profile', 'fix/login-bug', 'refactor/db-queries'],
    priority: 'high'
  },
  {
    name: 'base',
    type: 'string',
    required: true,
    description: 'Target branch to merge into',
    examples: ['main', 'develop', 'release/v1.2'],
    priority: 'high'
  },
  {
    name: 'repository',
    type: 'string',
    required: true,
    description: 'Repository name in format "owner/repo"',
    examples: ['chainreact/app', 'company/project-name'],
    priority: 'high'
  },
  {
    name: 'draft',
    type: 'boolean',
    required: false,
    description: 'Create as draft pull request',
    examples: [false, true],
    priority: 'low'
  },
  {
    name: 'assignees',
    type: 'array',
    required: false,
    description: 'GitHub usernames to assign for review',
    examples: [['reviewer1'], ['lead-dev', 'senior-dev']],
    priority: 'medium'
  },
  {
    name: 'reviewers',
    type: 'array',
    required: false,
    description: 'GitHub usernames to request review from',
    examples: [['code-reviewer'], ['team-lead', 'senior-engineer']],
    priority: 'medium'
  }
];

export const addComment: FieldSchema[] = [
  {
    name: 'body',
    type: 'string',
    required: true,
    description: 'Comment content - can include markdown formatting',
    examples: [
      'Thanks for the report! I can reproduce this issue.',
      'LGTM! 🚀 Ready to merge after tests pass.',
      '## Review Comments\n- Great work on the implementation\n- Minor suggestion: consider adding error handling for edge case X'
    ],
    priority: 'high'
  },
  {
    name: 'issueNumber',
    type: 'number',
    required: true,
    description: 'Issue or pull request number to comment on',
    examples: [123, 456, 789],
    priority: 'high'
  },
  {
    name: 'repository',
    type: 'string',
    required: true,
    description: 'Repository name in format "owner/repo"',
    examples: ['chainreact/app', 'company/project-name'],
    priority: 'high'
  }
];

export const createRelease: FieldSchema[] = [
  {
    name: 'tag_name',
    type: 'string',
    required: true,
    description: 'Git tag name for the release',
    examples: ['v1.0.0', '2.1.3', 'release-2024-01'],
    priority: 'high'
  },
  {
    name: 'name',
    type: 'string',
    required: false,
    description: 'Release title/name',
    examples: ['Version 1.0.0', 'Major Update v2.1', 'Hotfix Release'],
    priority: 'medium'
  },
  {
    name: 'body',
    type: 'string',
    required: false,
    description: 'Release notes and changelog',
    examples: [
      '## What\'s New\n- Added user authentication\n- Fixed critical bugs\n\n## Breaking Changes\n- API endpoint /old removed',
      '# Release Notes v1.2.0\n\n### Features\n- 🎉 New dashboard\n- 📊 Analytics integration\n\n### Bug Fixes\n- Fixed mobile layout issues'
    ],
    priority: 'high'
  },
  {
    name: 'target_commitish',
    type: 'string',
    required: false,
    description: 'Target branch or commit SHA',
    examples: ['main', 'release-branch', 'abc123def456'],
    priority: 'medium'
  },
  {
    name: 'draft',
    type: 'boolean',
    required: false,
    description: 'Create as draft release',
    examples: [false, true],
    priority: 'low'
  },
  {
    name: 'prerelease',
    type: 'boolean',
    required: false,
    description: 'Mark as pre-release',
    examples: [false, true],
    priority: 'low'
  },
  {
    name: 'repository',
    type: 'string',
    required: true,
    description: 'Repository name in format "owner/repo"',
    examples: ['chainreact/app', 'company/project-name'],
    priority: 'high'
  }
];