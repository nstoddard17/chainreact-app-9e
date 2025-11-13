/**
 * Cache utilities for workflow configuration field values
 *
 * Provides helpers for building cache keys and managing cache TTL
 */

/**
 * Build a cache key for configuration field data
 *
 * @param provider - Provider ID (e.g., 'airtable', 'gmail', 'slack')
 * @param integrationId - Unique integration ID
 * @param endpoint - The field name or endpoint being cached (e.g., 'bases', 'tables', 'fields')
 * @param params - Optional additional parameters that affect the data (e.g., parent field values)
 * @returns Cache key string
 */
export function buildCacheKey(
  provider: string,
  integrationId: string,
  endpoint: string,
  params?: Record<string, any>
): string {
  const paramStr = params ? `:${JSON.stringify(params)}` : ''
  return `${provider}:${integrationId}:${endpoint}${paramStr}`
}

/**
 * Get TTL (time-to-live) for a specific field type
 *
 * Different types of data have different cache durations based on
 * how frequently they change.
 */
export function getFieldTTL(fieldName: string): number {
  // 30 minutes for persistent data across modal opens
  const PERSISTENT_TTL = 30 * 60 * 1000

  // 10 minutes for very stable data
  const STABLE_TTL = 10 * 60 * 1000

  // 5 minutes for semi-stable data (default)
  const DEFAULT_TTL = 5 * 60 * 1000

  // 3 minutes for frequently changing data
  const DYNAMIC_TTL = 3 * 60 * 1000

  // 2 minutes for dependent fields
  const DEPENDENT_TTL = 2 * 60 * 1000

  // Airtable dynamic fields - persist across modal opens for better UX
  if (fieldName.startsWith('airtable_field_') ||
      ['tableName', 'baseId', 'filterField', 'filterValue'].includes(fieldName)) {
    return PERSISTENT_TTL
  }

  // Very stable data - rarely changes during workflow building
  const stableFields = ['bases', 'workspaces', 'labels', 'mailboxes']
  if (stableFields.includes(fieldName)) {
    return STABLE_TTL
  }

  // Dependent fields - may change based on parent selection
  const dependentFields = ['fields', 'views', 'columns', 'properties']
  if (dependentFields.includes(fieldName)) {
    return DEPENDENT_TTL
  }

  // Frequently changing data
  const dynamicFields = ['channels', 'users', 'members']
  if (dynamicFields.includes(fieldName)) {
    return DYNAMIC_TTL
  }

  // Default for everything else
  return DEFAULT_TTL
}

/**
 * Check if a field should be cached
 *
 * Some fields should not be cached (e.g., search results, real-time data)
 */
export function shouldCacheField(fieldName: string): boolean {
  const noCacheFields = [
    'search',
    'query',
    'filter',
    'current',
    'realtime'
  ]

  return !noCacheFields.some(term => fieldName.toLowerCase().includes(term))
}
