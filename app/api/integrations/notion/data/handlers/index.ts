/**
 * Notion Data Handlers Registry
 */

import { NotionDataHandler } from '../types'
import { getNotionUsers } from './users'
import { getNotionTemplates } from './templates'
import { getNotionDatabases } from './databases'
import { getNotionPages } from './pages'
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
  pages: getNotionPages,
  workspaces: getNotionWorkspaces,
  teamspaces: getNotionTeamspaces,
  properties: getNotionDatabaseProperties,
  database_fields: getNotionDatabaseFields,
  database_metadata: getNotionDatabaseMetadata,
  database_rows: getNotionDatabaseRows,
  database_items: getNotionDatabaseItems,
  archived_items: getNotionArchivedItems,
  blocks: getNotionPageBlocks,
  page_blocks: getNotionPageBlocks,
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
  notion_page_blocks: getNotionPageBlocks,
}

export {
  getNotionUsers,
  getNotionTemplates,
  getNotionDatabases,
  getNotionPages,
  getNotionWorkspaces,
  getNotionTeamspaces,
  getNotionDatabaseProperties,
  getNotionDatabaseFields,
  getNotionDatabaseRows,
  getNotionDatabaseItems,
  getNotionArchivedItems,
  getNotionPageBlocks,
}
