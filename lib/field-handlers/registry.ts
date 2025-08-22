/**
 * Field handler registry
 * 
 * This file maps field types to their corresponding handlers.
 * It provides the central registry for field type management.
 */

import { FieldRegistry } from './types'
import {
  EMAIL_AUTOCOMPLETE_HANDLER,
  SELECT_DROPDOWN_HANDLER,
  MULTI_SELECT_HANDLER,
  TEXT_INPUT_HANDLER,
  TEXTAREA_HANDLER,
  RICH_TEXT_HANDLER,
  FILE_INPUT_HANDLER,
  DATE_PICKER_HANDLER,
  TIME_PICKER_HANDLER,
  BOOLEAN_CHECKBOX_HANDLER,
  NUMBER_INPUT_HANDLER,
  DISCORD_SERVER_HANDLER,
  DISCORD_CHANNEL_HANDLER,
  GMAIL_LABEL_HANDLER
} from './presets'

/**
 * Default field handler registry
 * Maps field types to their corresponding handlers
 */
export const DEFAULT_FIELD_REGISTRY: FieldRegistry = {
  // Text inputs
  'text': TEXT_INPUT_HANDLER,
  'email': TEXT_INPUT_HANDLER,
  'password': TEXT_INPUT_HANDLER,
  'string': TEXT_INPUT_HANDLER,
  
  // Numbers
  'number': NUMBER_INPUT_HANDLER,
  
  // Text areas
  'textarea': TEXTAREA_HANDLER,
  
  // Rich text editors
  'rich-text': RICH_TEXT_HANDLER,
  'email-rich-text': RICH_TEXT_HANDLER,
  'discord-rich-text': RICH_TEXT_HANDLER,
  
  // Selects and dropdowns
  'select': SELECT_DROPDOWN_HANDLER,
  'combobox': SELECT_DROPDOWN_HANDLER,
  'multi-select': MULTI_SELECT_HANDLER,
  
  // Autocomplete fields
  'email-autocomplete': EMAIL_AUTOCOMPLETE_HANDLER,
  'location-autocomplete': SELECT_DROPDOWN_HANDLER,
  
  // Date and time
  'date': DATE_PICKER_HANDLER,
  'time': TIME_PICKER_HANDLER,
  'datetime': DATE_PICKER_HANDLER,
  
  // Files
  'file': FILE_INPUT_HANDLER,
  
  // Booleans
  'boolean': BOOLEAN_CHECKBOX_HANDLER,
  
  // Custom types
  'custom': TEXT_INPUT_HANDLER
}

/**
 * Field-specific overrides based on field name patterns
 * These take precedence over type-based handlers
 */
export const FIELD_NAME_OVERRIDES: Record<string, string> = {
  // Discord fields
  'guildId': 'discord-server',
  'channelId': 'discord-channel',
  
  // Gmail fields
  'labelIds': 'gmail-labels',
  'from': 'email-autocomplete',
  'to': 'email-autocomplete',
  'cc': 'email-autocomplete',
  'bcc': 'email-autocomplete'
}

/**
 * Specialized handlers for specific integrations
 */
export const SPECIALIZED_HANDLERS: FieldRegistry = {
  'discord-server': DISCORD_SERVER_HANDLER,
  'discord-channel': DISCORD_CHANNEL_HANDLER,
  'gmail-labels': GMAIL_LABEL_HANDLER
}

/**
 * Get the appropriate field handler for a given field
 */
export function getFieldHandler(field: any): any {
  // Check for field name-specific overrides first
  const nameOverride = FIELD_NAME_OVERRIDES[field.name]
  if (nameOverride && SPECIALIZED_HANDLERS[nameOverride]) {
    return SPECIALIZED_HANDLERS[nameOverride]
  }
  
  // Check for specialized handlers
  if (SPECIALIZED_HANDLERS[field.type]) {
    return SPECIALIZED_HANDLERS[field.type]
  }
  
  // Fall back to default registry
  return DEFAULT_FIELD_REGISTRY[field.type] || TEXT_INPUT_HANDLER
}

/**
 * Register a new field handler
 */
export function registerFieldHandler(fieldType: string, handler: any): void {
  DEFAULT_FIELD_REGISTRY[fieldType] = handler
}

/**
 * Register a specialized field handler
 */
export function registerSpecializedHandler(key: string, handler: any): void {
  SPECIALIZED_HANDLERS[key] = handler
}

/**
 * Register a field name override
 */
export function registerFieldNameOverride(fieldName: string, handlerKey: string): void {
  FIELD_NAME_OVERRIDES[fieldName] = handlerKey
}