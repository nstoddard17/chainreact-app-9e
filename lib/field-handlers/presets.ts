/**
 * Field handler presets
 * 
 * This file contains pre-configured field handlers for common field types.
 * These can be used as-is or extended for specific use cases.
 */

import { FieldHandler, FieldBehavior, FieldStyling } from './types'

// ===== BEHAVIOR PRESETS =====

export const EAGER_LOAD_BEHAVIOR: FieldBehavior = {
  loadingStrategy: 'eager',
  cacheOptions: true,
  supportsDragDrop: true,
  showLoadingIndicator: true,
  allowManualEntry: false
}

export const ON_DEMAND_LOAD_BEHAVIOR: FieldBehavior = {
  loadingStrategy: 'on-demand',
  cacheOptions: true,
  supportsDragDrop: true,
  showLoadingIndicator: true,
  allowManualEntry: true
}

export const HYBRID_LOAD_BEHAVIOR: FieldBehavior = {
  loadingStrategy: 'hybrid',
  cacheOptions: true,
  supportsDragDrop: true,
  showLoadingIndicator: true,
  allowManualEntry: true
}

export const STATIC_FIELD_BEHAVIOR: FieldBehavior = {
  loadingStrategy: 'eager',
  cacheOptions: false,
  supportsDragDrop: true,
  showLoadingIndicator: false,
  allowManualEntry: true
}

// ===== STYLING PRESETS =====

export const AUTO_THEME_STYLING: FieldStyling = {
  theme: 'auto',
  portal: false
}

export const PORTAL_STYLING: FieldStyling = {
  theme: 'auto',
  portal: true,
  className: 'bg-popover text-popover-foreground border-border'
}

export const DROPDOWN_STYLING: FieldStyling = {
  theme: 'auto',
  portal: true,
  className: 'fixed z-[99999] bg-popover border border-border rounded-md shadow-lg max-h-80 overflow-auto min-w-80 text-popover-foreground pointer-events-auto'
}

// ===== FIELD HANDLER PRESETS =====

export const EMAIL_AUTOCOMPLETE_HANDLER: FieldHandler = {
  behavior: ON_DEMAND_LOAD_BEHAVIOR,
  styling: DROPDOWN_STYLING,
  validation: {
    pattern: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
  },
  getPlaceholder: (field) => field.placeholder || `Enter ${field.label || field.name}...`,
  processOptions: (options) => options.filter(opt => opt && opt.email),
  handleError: (error) => {
    if (error.includes('permission')) {
      return 'Email integration permission required. Please reconnect your account.';
    }
    return error;
  }
}

export const SELECT_DROPDOWN_HANDLER: FieldHandler = {
  behavior: EAGER_LOAD_BEHAVIOR,
  styling: AUTO_THEME_STYLING,
  getPlaceholder: (field) => field.placeholder || 'Select an option...',
  processOptions: (options) => options.filter(opt => opt && (opt.value || opt.id))
}

export const MULTI_SELECT_HANDLER: FieldHandler = {
  behavior: EAGER_LOAD_BEHAVIOR,
  styling: AUTO_THEME_STYLING,
  getPlaceholder: (field) => field.placeholder || 'Select options...',
  processOptions: (options) => options.filter(opt => opt && (opt.value || opt.id))
}

export const TEXT_INPUT_HANDLER: FieldHandler = {
  behavior: STATIC_FIELD_BEHAVIOR,
  styling: AUTO_THEME_STYLING,
  getPlaceholder: (field) => field.placeholder || `Enter ${field.label || field.name}...`
}

export const TEXTAREA_HANDLER: FieldHandler = {
  behavior: STATIC_FIELD_BEHAVIOR,
  styling: AUTO_THEME_STYLING,
  getPlaceholder: (field) => field.placeholder || `Enter ${field.label || field.name}...`
}

export const RICH_TEXT_HANDLER: FieldHandler = {
  behavior: STATIC_FIELD_BEHAVIOR,
  styling: AUTO_THEME_STYLING,
  getPlaceholder: (field) => field.placeholder || 'Compose your message...'
}

export const FILE_INPUT_HANDLER: FieldHandler = {
  behavior: STATIC_FIELD_BEHAVIOR,
  styling: AUTO_THEME_STYLING,
  getPlaceholder: (field) => field.placeholder || 'Select file...'
}

export const DATE_PICKER_HANDLER: FieldHandler = {
  behavior: STATIC_FIELD_BEHAVIOR,
  styling: AUTO_THEME_STYLING,
  getPlaceholder: (field) => field.placeholder || 'Select date...'
}

export const TIME_PICKER_HANDLER: FieldHandler = {
  behavior: STATIC_FIELD_BEHAVIOR,
  styling: AUTO_THEME_STYLING,
  getPlaceholder: (field) => field.placeholder || 'Select time...'
}

export const BOOLEAN_CHECKBOX_HANDLER: FieldHandler = {
  behavior: STATIC_FIELD_BEHAVIOR,
  styling: AUTO_THEME_STYLING
}

export const NUMBER_INPUT_HANDLER: FieldHandler = {
  behavior: STATIC_FIELD_BEHAVIOR,
  styling: AUTO_THEME_STYLING,
  validation: {
    pattern: /^-?\d*\.?\d*$/
  },
  parseValue: (value) => value === '' ? null : Number(value),
  formatValue: (value) => value?.toString() || '',
  getPlaceholder: (field) => field.placeholder || `Enter ${field.label || field.name}...`
}

// Discord-specific handlers
export const DISCORD_SERVER_HANDLER: FieldHandler = {
  behavior: EAGER_LOAD_BEHAVIOR,
  styling: AUTO_THEME_STYLING,
  getPlaceholder: () => 'Select Discord server...',
  handleError: (error) => 'Discord servers not found. Please reconnect your Discord account and ensure the bot is added to your servers.'
}

export const DISCORD_CHANNEL_HANDLER: FieldHandler = {
  behavior: HYBRID_LOAD_BEHAVIOR,
  styling: AUTO_THEME_STYLING,
  getPlaceholder: () => 'Select channel...',
  handleError: (error) => 'Channels not found. Please select a server first.'
}

// Gmail-specific handlers
export const GMAIL_LABEL_HANDLER: FieldHandler = {
  behavior: EAGER_LOAD_BEHAVIOR,
  styling: AUTO_THEME_STYLING,
  getPlaceholder: () => 'Select Gmail labels...',
  handleError: (error) => 'Gmail labels not found. Please reconnect your Gmail account.'
}