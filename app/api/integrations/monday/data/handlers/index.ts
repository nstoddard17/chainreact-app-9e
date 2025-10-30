/**
 * Monday.com Data Handlers Registry
 */

import { MondayDataHandler } from '../types'
import { getMondayBoards } from './boards'
import { getMondayGroups } from './groups'
import { getMondayColumns } from './columns'

/**
 * Registry of all Monday.com data handlers
 */
export const mondayHandlers: Record<string, MondayDataHandler> = {
  'monday_boards': getMondayBoards,
  'monday_groups': getMondayGroups,
  'monday_columns': getMondayColumns,
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
