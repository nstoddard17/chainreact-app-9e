/**
 * Field handlers library
 * 
 * Centralized library for managing field behavior, styling, and validation
 * across the application. Provides configurable handlers for different
 * field types with support for custom overrides.
 */

export * from './types'
export * from './presets'
export * from './registry'

// Re-export key functions and constants for easy access
export { getFieldHandler, registerFieldHandler, registerSpecializedHandler, registerFieldNameOverride } from './registry'
export { DEFAULT_FIELD_REGISTRY, SPECIALIZED_HANDLERS, FIELD_NAME_OVERRIDES } from './registry'