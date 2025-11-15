/**
 * Label Persistence Utilities
 *
 * Provides utilities for saving and retrieving labels alongside field values
 * to enable instant display when reopening configuration modals (Zapier-like UX).
 *
 * Key concepts:
 * - Values (IDs): appXYZ123, tblABC456, recDEF789
 * - Labels (Display): "CRM Database", "Contacts", "John Doe"
 *
 * Storage format in node data:
 * {
 *   base: "appXYZ123",              // The value (ID)
 *   _label_base: "CRM Database",    // The label (display name)
 *   table: "tblABC456",
 *   _label_table: "Contacts",
 *   // ... more fields
 * }
 */

export interface FieldValueWithLabel {
  value: any
  label?: string | null
}

/**
 * Get the label key for a field
 * Example: "base" -> "_label_base"
 */
export function getLabelKey(fieldName: string): string {
  return `_label_${fieldName}`
}

/**
 * Save a field value with its label
 * Returns an object with both value and label keys
 */
export function saveFieldWithLabel(
  fieldName: string,
  value: any,
  label?: string | null
): Record<string, any> {
  const result: Record<string, any> = {
    [fieldName]: value
  }

  if (label) {
    result[getLabelKey(fieldName)] = label
  }

  return result
}

/**
 * Get the saved label for a field from config data
 */
export function getSavedLabel(
  config: Record<string, any>,
  fieldName: string
): string | null {
  const labelKey = getLabelKey(fieldName)
  return config[labelKey] || null
}

/**
 * Extract field value and label from config
 */
export function getFieldWithLabel(
  config: Record<string, any>,
  fieldName: string
): FieldValueWithLabel {
  return {
    value: config[fieldName],
    label: getSavedLabel(config, fieldName)
  }
}

/**
 * Check if config has cached/saved data (not just empty values)
 * Used to determine if we should show instant display vs loading state
 */
export function hasSavedConfig(config: Record<string, any>): boolean {
  if (!config || typeof config !== 'object') return false

  // Check if there are any non-metadata keys with values
  const configKeys = Object.keys(config).filter(key =>
    !key.startsWith('__') && // Skip __dynamicOptions, __validationState, etc.
    !key.startsWith('_label_') && // Skip label keys
    !key.startsWith('_cached') // Skip cached data keys
  )

  return configKeys.some(key => {
    const value = config[key]
    // Check if value is not empty
    if (value === null || value === undefined || value === '') return false
    if (Array.isArray(value) && value.length === 0) return false
    return true
  })
}

/**
 * Clean label keys from config before execution
 * Labels are for UI display only and should not be sent to APIs
 */
export function cleanLabelsFromConfig(config: Record<string, any>): Record<string, any> {
  const cleaned: Record<string, any> = {}

  for (const key in config) {
    // Skip label keys and cached data keys
    if (!key.startsWith('_label_') && !key.startsWith('_cached')) {
      cleaned[key] = config[key]
    }
  }

  return cleaned
}

/**
 * Merge fresh options into existing config while preserving labels
 * Used when background refresh completes
 */
export function mergeOptionsWithLabels(
  existingConfig: Record<string, any>,
  freshOptions: Record<string, any[]>,
  fieldName: string
): Record<string, any> {
  const currentValue = existingConfig[fieldName]
  if (!currentValue) return existingConfig

  const options = freshOptions[fieldName]
  if (!options || !Array.isArray(options)) return existingConfig

  // Find the option matching current value
  const matchingOption = options.find((opt: any) => {
    const optValue = opt.value || opt.id
    return String(optValue) === String(currentValue)
  })

  // If we found a fresh label, update it
  if (matchingOption) {
    const freshLabel = matchingOption.label || matchingOption.name || matchingOption.value
    return {
      ...existingConfig,
      [getLabelKey(fieldName)]: freshLabel
    }
  }

  return existingConfig
}
