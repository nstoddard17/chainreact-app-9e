import { FieldSchema } from '../../../ai/smartAIAgent';

export const createPage: FieldSchema[] = [
  {
    name: 'title',
    type: 'string',
    required: true,
    description: 'Page title - will be displayed as the main heading',
    examples: [
      'Project Alpha Planning',
      'Meeting Notes - March 15, 2024',
      'Product Requirements Document',
      'Weekly Team Update'
    ],
    priority: 'high'
  },
  {
    name: 'parent_page_id',
    type: 'string',
    required: false,
    description: 'ID of parent page to create this page under',
    examples: ['abc123def456', 'xyz789uvw012'],
    priority: 'medium'
  },
  {
    name: 'database_id',
    type: 'string',
    required: false,
    description: 'ID of database to create this page in (alternative to parent_page_id)',
    examples: ['db123abc456def', 'database789xyz012'],
    priority: 'medium',
    dependencies: ['parent_page_id']
  },
  {
    name: 'content',
    type: 'string',
    required: false,
    description: 'Page content in markdown format',
    examples: [
      '# Project Overview\n\nThis project aims to...\n\n## Timeline\n- Phase 1: Research\n- Phase 2: Development',
      '## Meeting Agenda\n1. Review last week\'s progress\n2. Discuss blockers\n3. Plan next sprint\n\n## Action Items\n- [ ] Update documentation',
      '**Objective:** Create a comprehensive product requirements document\n\n### Features\n- User authentication\n- Dashboard with analytics'
    ],
    priority: 'high'
  },
  {
    name: 'properties',
    type: 'object',
    required: false,
    description: 'Database properties (only if creating in a database)',
    examples: [
      {
        Status: { select: { name: 'In Progress' } },
        Priority: { select: { name: 'High' } },
        Assignee: { people: [{ id: 'user123' }] }
      },
      {
        Tags: { multi_select: [{ name: 'Project' }, { name: 'Planning' }] },
        DueDate: { date: { start: '2024-03-30' } }
      }
    ],
    priority: 'medium'
  },
  {
    name: 'icon',
    type: 'string',
    required: false,
    description: 'Page icon (emoji or URL)',
    examples: ['📋', '📊', '🚀', 'https://example.com/icon.png'],
    priority: 'low'
  },
  {
    name: 'cover',
    type: 'url',
    required: false,
    description: 'Cover image URL for the page',
    examples: [
      'https://images.unsplash.com/photo-1234567890',
      'https://example.com/cover-image.jpg'
    ],
    priority: 'low'
  }
];

export const updatePage: FieldSchema[] = [
  {
    name: 'page_id',
    type: 'string',
    required: true,
    description: 'ID of the page to update',
    examples: ['abc123def456', 'xyz789uvw012'],
    priority: 'high'
  },
  {
    name: 'title',
    type: 'string',
    required: false,
    description: 'New title for the page',
    examples: [
      'Updated Project Alpha Planning',
      'Meeting Notes - March 15, 2024 (Final)',
      'PRD v2.0'
    ],
    priority: 'medium'
  },
  {
    name: 'content',
    type: 'string',
    required: false,
    description: 'New content to append or replace',
    examples: [
      '\n\n## Update\nAdded new requirements based on stakeholder feedback...',
      '## Follow-up Items\n- [ ] Schedule design review\n- [ ] Update timeline'
    ],
    priority: 'medium'
  },
  {
    name: 'properties',
    type: 'object',
    required: false,
    description: 'Properties to update (for database pages)',
    examples: [
      {
        Status: { select: { name: 'Completed' } },
        Priority: { select: { name: 'Low' } }
      }
    ],
    priority: 'medium'
  },
  {
    name: 'archived',
    type: 'boolean',
    required: false,
    description: 'Archive or unarchive the page',
    examples: [false, true],
    priority: 'low'
  }
];

export const createDatabase: FieldSchema[] = [
  {
    name: 'title',
    type: 'string',
    required: true,
    description: 'Database title/name',
    examples: [
      'Project Tasks',
      'Team Directory',
      'Content Calendar',
      'Bug Tracker'
    ],
    priority: 'high'
  },
  {
    name: 'parent_page_id',
    type: 'string',
    required: true,
    description: 'ID of the page to create the database in',
    examples: ['abc123def456', 'xyz789uvw012'],
    priority: 'high'
  },
  {
    name: 'properties',
    type: 'object',
    required: true,
    description: 'Database schema definition with property types',
    examples: [
      {
        Name: { title: {} },
        Status: { select: { options: [{ name: 'Not Started' }, { name: 'In Progress' }, { name: 'Done' }] } },
        Assignee: { people: {} },
        DueDate: { date: {} },
        Priority: { select: { options: [{ name: 'Low' }, { name: 'Medium' }, { name: 'High' }] } }
      },
      {
        Title: { title: {} },
        Category: { select: { options: [{ name: 'Blog' }, { name: 'Social' }, { name: 'Email' }] } },
        PublishDate: { date: {} },
        Author: { people: {} },
        Published: { checkbox: {} }
      }
    ],
    priority: 'high'
  },
  {
    name: 'description',
    type: 'string',
    required: false,
    description: 'Database description',
    examples: [
      'Track all project tasks and their status',
      'Directory of team members and their roles',
      'Plan and schedule content across all channels'
    ],
    priority: 'low'
  }
];

export const queryDatabase: FieldSchema[] = [
  {
    name: 'database_id',
    type: 'string',
    required: true,
    description: 'ID of the database to query',
    examples: ['db123abc456def', 'database789xyz012'],
    priority: 'high'
  },
  {
    name: 'filter',
    type: 'object',
    required: false,
    description: 'Filter conditions to apply to the query',
    examples: [
      {
        property: 'Status',
        select: { equals: 'In Progress' }
      },
      {
        and: [
          { property: 'Priority', select: { equals: 'High' } },
          { property: 'DueDate', date: { before: '2024-03-31' } }
        ]
      }
    ],
    priority: 'medium'
  },
  {
    name: 'sorts',
    type: 'array',
    required: false,
    description: 'Sort criteria for the results',
    examples: [
      [{ property: 'DueDate', direction: 'ascending' }],
      [
        { property: 'Priority', direction: 'descending' },
        { property: 'Created', direction: 'ascending' }
      ]
    ],
    priority: 'medium'
  },
  {
    name: 'page_size',
    type: 'number',
    required: false,
    description: 'Number of results to return (max 100)',
    examples: [10, 25, 50, 100],
    priority: 'low'
  }
];

export const addComment: FieldSchema[] = [
  {
    name: 'page_id',
    type: 'string',
    required: true,
    description: 'ID of the page to comment on',
    examples: ['abc123def456', 'xyz789uvw012'],
    priority: 'high'
  },
  {
    name: 'text',
    type: 'string',
    required: true,
    description: 'Comment text content',
    examples: [
      'Great work on this document! I have a few suggestions...',
      'Can we schedule a meeting to discuss the timeline?',
      'Updated the requirements based on our discussion yesterday.'
    ],
    priority: 'high'
  }
];

export const uploadFile: FieldSchema[] = [
  {
    name: 'file_path',
    type: 'string',
    required: true,
    description: 'Path to the file to upload or file URL',
    examples: [
      '/path/to/document.pdf',
      'https://example.com/image.png',
      './assets/presentation.pptx'
    ],
    priority: 'high'
  },
  {
    name: 'page_id',
    type: 'string',
    required: true,
    description: 'ID of the page to add the file to',
    examples: ['abc123def456', 'xyz789uvw012'],
    priority: 'high'
  },
  {
    name: 'caption',
    type: 'string',
    required: false,
    description: 'Caption or description for the uploaded file',
    examples: [
      'Project timeline and milestones',
      'UI mockups for the new feature',
      'Meeting recording from March 15th'
    ],
    priority: 'medium'
  }
];