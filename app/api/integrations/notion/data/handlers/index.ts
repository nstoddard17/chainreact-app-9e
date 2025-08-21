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

export const notionHandlers: Record<string, NotionDataHandler> = {
  notion_users: getNotionUsers,
  notion_templates: getNotionTemplates,
  notion_databases: getNotionDatabases,
  notion_pages: getNotionPages,
  notion_workspaces: getNotionWorkspaces,
  notion_database_properties: getNotionDatabaseProperties,
}

export {
  getNotionUsers,
  getNotionTemplates,
  getNotionDatabases,
  getNotionPages,
  getNotionWorkspaces,
  getNotionDatabaseProperties,
}