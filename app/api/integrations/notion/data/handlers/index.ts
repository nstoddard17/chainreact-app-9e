/**
 * Notion Data Handlers Registry
 */

import { NotionDataHandler } from '../types'
import { getNotionUsers } from './users'
import { getNotionTemplates } from './templates'
import { getNotionDatabases } from './databases'
import { getNotionPages, getNotionArchivedPages } from './pages'
import { getNotionWorkspaces } from './workspaces'
import { getNotionDatabaseProperties } from './databaseProperties'
import { getNotionTeamspaces } from './teamspaces'
import { getNotionPageBlocks } from './pageBlocks'
import { getNotionDatabaseFields } from './databaseFields'
import { getNotionDatabaseMetadata } from './databaseMetadata'
import { getNotionDatabaseRows } from './databaseRows'
import { getNotionDatabaseItems, getNotionArchivedItems } from './databaseItems'

export const notionHandlers: Record<string, NotionDataHandler> = {
  // Direct mappings for cleaner API
  users: getNotionUsers,
  templates: getNotionTemplates,
  databases: getNotionDatabases,
  database: getNotionDatabases, // Alias for 'databases' - handles singular field names
  databaseId: getNotionDatabases, // Alias for field name variations
  database_id: getNotionDatabases, // Alias for snake_case
  pages: getNotionPages,
  page: getNotionPages, // Alias for 'pages' - handles singular field names
  pageId: getNotionPages, // Alias for field name variations
  page_id: getNotionPages, // Alias for snake_case
  workspaces: getNotionWorkspaces,
  workspace: getNotionWorkspaces, // Alias for 'workspaces' - handles singular field names
  workspaceId: getNotionWorkspaces, // Alias for field name variations
  workspace_id: getNotionWorkspaces, // Alias for snake_case
  teamspaces: getNotionTeamspaces,
  properties: getNotionDatabaseProperties,
  database_fields: getNotionDatabaseFields,
  database_metadata: getNotionDatabaseMetadata,
  database_rows: getNotionDatabaseRows,
  database_items: getNotionDatabaseItems,
  archived_items: getNotionArchivedItems,
  archived_pages: getNotionArchivedPages,
  blocks: getNotionPageBlocks,
  page_blocks: getNotionPageBlocks,
  userId: getNotionUsers, // Alias for user field variations
  user_id: getNotionUsers, // Alias for snake_case
  filter_types: () => Promise.resolve([
    { value: 'page', label: 'Pages' },
    { value: 'database', label: 'Databases' }
  ]),
  database_templates: () => Promise.resolve([
    { value: 'Project Tracker', label: 'Project Tracker' },
    { value: 'CRM', label: 'CRM' },
    { value: 'Content Calendar', label: 'Content Calendar' },
    { value: 'Task Management', label: 'Task Management' },
    { value: 'Bug Tracker', label: 'Bug Tracker' },
  ]),
  
  // Legacy mappings for backward compatibility
  notion_users: getNotionUsers,
  notion_templates: getNotionTemplates,
  notion_databases: getNotionDatabases,
  notion_pages: getNotionPages,
  notion_workspaces: getNotionWorkspaces,
  notion_teamspaces: getNotionTeamspaces,
  notion_database_properties: getNotionDatabaseProperties,
  notion_database_fields: getNotionDatabaseFields,
  notion_database_items: getNotionDatabaseItems,
  notion_archived_items: getNotionArchivedItems,
  notion_archived_pages: getNotionArchivedPages,
  notion_page_blocks: getNotionPageBlocks,
  notion_blocks: getNotionPageBlocks, // Alias for notion_page_blocks
  notion_filter_types: () => Promise.resolve([
    { value: 'page', label: 'Pages' },
    { value: 'database', label: 'Databases' }
  ]),
  notion_database_templates: () => Promise.resolve([
    { value: 'Project Tracker', label: 'Project Tracker' },
    { value: 'CRM', label: 'CRM' },
    { value: 'Content Calendar', label: 'Content Calendar' },
    { value: 'Task Management', label: 'Task Management' },
    { value: 'Bug Tracker', label: 'Bug Tracker' },
  ]),
}

export {
  getNotionUsers,
  getNotionTemplates,
  getNotionDatabases,
  getNotionPages,
  getNotionArchivedPages,
  getNotionWorkspaces,
  getNotionTeamspaces,
  getNotionDatabaseProperties,
  getNotionDatabaseFields,
  getNotionDatabaseRows,
  getNotionDatabaseItems,
  getNotionArchivedItems,
  getNotionPageBlocks,
}
