/**
 * Monday.com Data Handlers Registry
 */

import { MondayDataHandler } from '../types'
import { getMondayBoards } from './boards'
import { getMondayGroups } from './groups'
import { getMondayColumns } from './columns'
import { getMondayItems } from './items'
import { getMondayFileColumns } from './fileColumns'
import { getMondayUsers } from './users'

/**
 * Registry of all Monday.com data handlers
 */
export const mondayHandlers: Record<string, MondayDataHandler> = {
  'monday_boards': getMondayBoards,
  'monday_groups': getMondayGroups,
  'monday_columns': getMondayColumns,
  'monday_items': getMondayItems,
  'monday_file_columns': getMondayFileColumns,
  'monday_users': getMondayUsers,
}

/**
 * Get available Monday.com data types
 */
export function getAvailableMondayDataTypes(): string[] {
  return Object.keys(mondayHandlers)
}

/**
 * Check if a data type is supported
 */
export function isMondayDataTypeSupported(dataType: string): boolean {
  return dataType in mondayHandlers
}

/**
 * Get handler for a specific data type
 */
export function getMondayHandler(dataType: string): MondayDataHandler | null {
  return mondayHandlers[dataType] || null
}
