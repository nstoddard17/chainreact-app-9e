/**
 * Collect Field Labels from LocalStorage
 *
 * Utility to collect all field labels from localStorage cache
 * and format them for database persistence.
 *
 * GenericSelectField already saves labels to localStorage as:
 * `workflow-field-label:${provider}:${nodeType}:${fieldName}` -> { [value]: "Label" }
 *
 * This utility reads those caches and formats them for inclusion in saved config.
 */

import { logger } from '@/lib/utils/logger'
import { getLabelKey } from './label-persistence'

/**
 * Collect labels for all fields from localStorage
 *
 * @param providerId - Provider ID (e.g., "airtable", "gmail")
 * @param nodeType - Node type (e.g., "airtable_action_update_record")
 * @param currentValues - Current form values to match against cached labels
 * @returns Object with label keys and values (e.g., { _label_base: "CRM Database" })
 */
export function collectFieldLabelsFromCache(
  providerId: string,
  nodeType: string,
  currentValues: Record<string, any>
): Record<string, string> {
  if (typeof window === 'undefined') return {}

  const labels: Record<string, string> = {}

  try {
    // Iterate through current values
    for (const [fieldName, value] of Object.entries(currentValues)) {
      // Skip metadata fields
      if (fieldName.startsWith('__') || fieldName.startsWith('_')) continue
      if (!value || value === '') continue

      // Build cache key (same format as GenericSelectField uses)
      const cacheKey = `workflow-field-label:${providerId}:${nodeType}:${fieldName}`

      // Try to get cached label
      const cachedData = window.localStorage.getItem(cacheKey)
      if (!cachedData) continue

      try {
        const cache = JSON.parse(cachedData) as Record<string, string>
        const label = cache[String(value)]

        if (label) {
          const labelKey = getLabelKey(fieldName)
          labels[labelKey] = label
          logger.debug('[collectFieldLabels] Found cached label:', {
            fieldName,
            value,
            label,
            labelKey
          })
        }
      } catch (err) {
        logger.warn('[collectFieldLabels] Failed to parse cache for field:', fieldName, err)
      }
    }

    logger.debug('[collectFieldLabels] Collected labels:', {
      providerId,
      nodeType,
      labelCount: Object.keys(labels).length,
      labels
    })

    return labels
  } catch (error) {
    logger.error('[collectFieldLabels] Error collecting labels:', error)
    return {}
  }
}

/**
 * Load labels from saved config into localStorage
 * This ensures labels are available for instant display when modal reopens
 *
 * @param providerId - Provider ID
 * @param nodeType - Node type
 * @param savedConfig - Saved configuration with label keys
 */
export function loadLabelsIntoCache(
  providerId: string,
  nodeType: string,
  savedConfig: Record<string, any>
): void {
  if (typeof window === 'undefined') return

  try {
    // Find all label keys in config
    for (const [key, labelValue] of Object.entries(savedConfig)) {
      // Check if this is a label key
      if (!key.startsWith('_label_')) continue

      // Extract field name from label key
      // _label_base -> base
      const fieldName = key.replace(/^_label_/, '')

      // Get the actual field value
      const fieldValue = savedConfig[fieldName]
      if (!fieldValue) continue

      // Build cache key
      const cacheKey = `workflow-field-label:${providerId}:${nodeType}:${fieldName}`

      // Get existing cache or create new
      let cache: Record<string, string> = {}
      const existing = window.localStorage.getItem(cacheKey)
      if (existing) {
        try {
          cache = JSON.parse(existing)
        } catch (err) {
          logger.warn('[loadLabelsIntoCache] Failed to parse existing cache:', err)
        }
      }

      // Add/update the label
      cache[String(fieldValue)] = String(labelValue)

      // Save back to localStorage
      window.localStorage.setItem(cacheKey, JSON.stringify(cache))

      logger.debug('[loadLabelsIntoCache] Loaded label into cache:', {
        fieldName,
        value: fieldValue,
        label: labelValue
      })
    }
  } catch (error) {
    logger.error('[loadLabelsIntoCache] Error loading labels:', error)
  }
}
