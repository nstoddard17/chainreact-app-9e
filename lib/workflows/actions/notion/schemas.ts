/**
 * Notion Action Output Schemas
 * Co-located schemas for all Notion action handlers
 * This is the single source of truth for what variables are available from each action
 */

import { OutputField } from './handlers'

/**
 * Output schemas for Notion page operations
 */
export const notionPageSchemas = {
  createPage: [
    { name: 'page_id', label: 'Page ID', type: 'string', description: 'The unique ID of the created page' },
    { name: 'url', label: 'Page URL', type: 'string', description: 'Direct link to the page in Notion' },
    { name: 'created_time', label: 'Created Time', type: 'string', description: 'When the page was created' },
    { name: 'last_edited_time', label: 'Last Edited Time', type: 'string', description: 'When the page was last modified' }
  ] as OutputField[],

  updatePage: [
    { name: 'page_id', label: 'Page ID', type: 'string', description: 'The unique ID of the updated page' },
    { name: 'url', label: 'Page URL', type: 'string', description: 'Direct link to the page in Notion' },
    { name: 'last_edited_time', label: 'Last Edited Time', type: 'string', description: 'When the page was last modified' },
    { name: 'blocks_updated', label: 'Blocks Updated', type: 'number', description: 'Number of blocks that were updated' },
    { name: 'blocks_added', label: 'Blocks Added', type: 'number', description: 'Number of new blocks added' },
    { name: 'blocks_deleted', label: 'Blocks Deleted', type: 'number', description: 'Number of blocks deleted' }
  ] as OutputField[],

  retrievePage: [
    { name: 'page_id', label: 'Page ID', type: 'string', description: 'The unique ID of the page' },
    { name: 'url', label: 'Page URL', type: 'string', description: 'Direct link to the page in Notion' },
    { name: 'properties', label: 'Page Properties', type: 'object', description: 'All properties of the page (title, status, dates, etc.)' },
    { name: 'parent', label: 'Parent', type: 'object', description: 'Information about the parent database or page' },
    { name: 'created_time', label: 'Created Time', type: 'string', description: 'When the page was created' },
    { name: 'last_edited_time', label: 'Last Edited Time', type: 'string', description: 'When the page was last modified' },
    { name: 'archived', label: 'Archived', type: 'boolean', description: 'Whether the page is archived' }
  ] as OutputField[],

  appendBlocks: [
    { name: 'page_id', label: 'Page ID', type: 'string', description: 'The ID of the page where blocks were appended' },
    { name: 'blocks', label: 'Blocks', type: 'array', description: 'The blocks that were added to the page' }
  ] as OutputField[],

  archivePage: [
    { name: 'page_id', label: 'Page ID', type: 'string', description: 'The ID of the archived/unarchived page' },
    { name: 'archived', label: 'Archived', type: 'boolean', description: 'The new archived status' }
  ] as OutputField[],

  duplicatePage: [
    { name: 'new_page_id', label: 'New Page ID', type: 'string', description: 'The ID of the duplicated page' },
    { name: 'url', label: 'Page URL', type: 'string', description: 'Direct link to the duplicated page' },
    { name: 'title', label: 'Title', type: 'string', description: 'Title of the duplicated page' }
  ] as OutputField[]
}

/**
 * Output schemas for Notion database operations
 */
export const notionDatabaseSchemas = {
  createDatabase: [
    { name: 'database_id', label: 'Database ID', type: 'string', description: 'The unique ID of the created database' },
    { name: 'url', label: 'Database URL', type: 'string', description: 'Direct link to the database' },
    { name: 'title', label: 'Title', type: 'string', description: 'The database title' },
    { name: 'properties', label: 'Properties', type: 'object', description: 'The database property schema' }
  ] as OutputField[],

  queryDatabase: [
    { name: 'results', label: 'Results', type: 'array', description: 'Array of pages matching the query' },
    { name: 'has_more', label: 'Has More', type: 'boolean', description: 'Whether there are more results available' },
    { name: 'next_cursor', label: 'Next Cursor', type: 'string', description: 'Cursor for pagination' },
    { name: 'total_results', label: 'Total Results', type: 'number', description: 'Number of results returned' }
  ] as OutputField[],

  updateDatabase: [
    { name: 'database_id', label: 'Database ID', type: 'string', description: 'The ID of the updated database' },
    { name: 'url', label: 'Database URL', type: 'string', description: 'Direct link to the database' },
    { name: 'last_edited_time', label: 'Last Edited Time', type: 'string', description: 'When the database was last modified' }
  ] as OutputField[],

  syncDatabaseEntries: [
    { name: 'added', label: 'Added Entries', type: 'array', description: 'Newly added database entries' },
    { name: 'modified', label: 'Modified Entries', type: 'array', description: 'Modified database entries' },
    { name: 'deleted', label: 'Deleted Entries', type: 'array', description: 'Deleted database entries' },
    { name: 'sync_timestamp', label: 'Sync Timestamp', type: 'string', description: 'When the sync was performed' }
  ] as OutputField[]
}

/**
 * Output schemas for Notion user operations
 */
export const notionUserSchemas = {
  listUsers: [
    { name: 'users', label: 'Users', type: 'array', description: 'Array of all users in the workspace' },
    { name: 'has_more', label: 'Has More', type: 'boolean', description: 'Whether there are more users available' },
    { name: 'next_cursor', label: 'Next Cursor', type: 'string', description: 'Cursor for pagination' }
  ] as OutputField[],

  retrieveUser: [
    { name: 'user.id', label: 'User ID', type: 'string', description: 'The unique ID of the user' },
    { name: 'user.name', label: 'Name', type: 'string', description: 'The user\'s name' },
    { name: 'user.person_details.email', label: 'Email', type: 'string', description: 'The user\'s email address' },
    { name: 'user.type', label: 'Type', type: 'string', description: 'The type of user (person/bot)' },
    { name: 'user.avatar_url', label: 'Avatar URL', type: 'string', description: 'URL to the user\'s avatar image' },
    { name: 'user.access_level', label: 'Access Level', type: 'string', description: 'The user\'s access level in the workspace' },
    { name: 'user.description', label: 'Description', type: 'string', description: 'Description of the user' }
  ] as OutputField[]
}

/**
 * Output schemas for Notion block operations
 */
export const notionBlockSchemas = {
  updateBlock: [
    { name: 'block_id', label: 'Block ID', type: 'string', description: 'The ID of the updated block' },
    { name: 'type', label: 'Block Type', type: 'string', description: 'The type of block' },
    { name: 'last_edited_time', label: 'Last Edited Time', type: 'string', description: 'When the block was last modified' }
  ] as OutputField[],

  deleteBlock: [
    { name: 'block_id', label: 'Block ID', type: 'string', description: 'The ID of the deleted block' },
    { name: 'archived', label: 'Archived', type: 'boolean', description: 'Confirmation that block was archived' }
  ] as OutputField[],

  retrieveBlockChildren: [
    { name: 'children', label: 'Child Blocks', type: 'array', description: 'Array of child blocks' },
    { name: 'has_more', label: 'Has More', type: 'boolean', description: 'Whether there are more child blocks' },
    { name: 'next_cursor', label: 'Next Cursor', type: 'string', description: 'Cursor for pagination' }
  ] as OutputField[]
}

/**
 * Output schemas for Notion comment operations
 */
export const notionCommentSchemas = {
  createComment: [
    { name: 'comment_id', label: 'Comment ID', type: 'string', description: 'The ID of the created comment' },
    { name: 'created_time', label: 'Created Time', type: 'string', description: 'When the comment was created' },
    { name: 'parent', label: 'Parent', type: 'object', description: 'The parent page or discussion' }
  ] as OutputField[],

  retrieveComments: [
    { name: 'comments', label: 'Comments', type: 'array', description: 'Array of comments' },
    { name: 'has_more', label: 'Has More', type: 'boolean', description: 'Whether there are more comments' },
    { name: 'next_cursor', label: 'Next Cursor', type: 'string', description: 'Cursor for pagination' }
  ] as OutputField[]
}

/**
 * Output schemas for Notion search operations
 */
export const notionSearchSchemas = {
  search: [
    { name: 'results', label: 'Results', type: 'array', description: 'Array of search results' },
    { name: 'has_more', label: 'Has More', type: 'boolean', description: 'Whether there are more results' },
    { name: 'next_cursor', label: 'Next Cursor', type: 'string', description: 'Cursor for pagination' },
    { name: 'object', label: 'Object Type', type: 'string', description: 'The type of Notion object' }
  ] as OutputField[]
}

/**
 * Helper function to get output schema based on operation
 * Used by the unified "Manage Page" action
 */
export function getNotionManagePageSchema(operation?: string): OutputField[] {
  switch (operation) {
    case 'create':
      return notionPageSchemas.createPage
    case 'update':
      return notionPageSchemas.updatePage
    case 'get_details':
      return notionPageSchemas.retrievePage
    case 'append':
      return notionPageSchemas.appendBlocks
    case 'archive':
      return notionPageSchemas.archivePage
    case 'duplicate':
      return notionPageSchemas.duplicatePage
    default:
      // Return all possible fields if operation is unknown
      return notionPageSchemas.retrievePage
  }
}

/**
 * Helper function to get output schema for database operations
 */
export function getNotionManageDatabaseSchema(operation?: string): OutputField[] {
  switch (operation) {
    case 'create':
      return notionDatabaseSchemas.createDatabase
    case 'update':
      return notionDatabaseSchemas.updateDatabase
    case 'sync':
      return notionDatabaseSchemas.syncDatabaseEntries
    default:
      return notionDatabaseSchemas.createDatabase
  }
}

/**
 * Helper function to get output schema for user operations
 */
export function getNotionManageUsersSchema(operation?: string): OutputField[] {
  switch (operation) {
    case 'list':
      return notionUserSchemas.listUsers
    case 'get':
      return notionUserSchemas.retrieveUser
    default:
      return notionUserSchemas.listUsers
  }
}
