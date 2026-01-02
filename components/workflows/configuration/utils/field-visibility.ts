/**
 * Field Visibility Utilities
 *
 * Utilities for determining field visibility in configuration modals.
 * Supports showing fields instantly when saved config exists (Zapier-like UX).
 */

/**
 * Check if a field should be shown based on its dependencies and saved values
 *
 * This enables the "Zapier experience" where fields with saved values show
 * instantly, even if their parent dependencies haven't loaded yet.
 *
 * @param field - Field schema
 * @param values - Current form values
 * @returns true if field should be visible
 */
export function shouldShowField(
  field: any,
  values: Record<string, any>
): boolean {
  // Check showIf function FIRST (for dynamic visibility logic)
  // This takes priority because it's the most specific condition
  if (typeof field.showIf === 'function') {
    const showIfResult = field.showIf(values)
    // If showIf returns false, always hide the field
    if (!showIfResult) return false
    // If showIf returns true AND field is hidden with dependsOn,
    // the showIf result overrides the hidden state
    if (field.hidden) return true
  }

  // Handle hidden fields with dependencies (but no showIf)
  if (field.hidden && field.dependsOn) {
    const dependencyValue = values[field.dependsOn]
    const fieldHasSavedValue = hasValue(values[field.name])

    // Show if dependency is satisfied OR field has a saved value
    return !!dependencyValue || fieldHasSavedValue
  }

  // If field is hidden without dependencies, always hide it
  if (field.hidden) return false

  // Check dependsOn for all fields (not just hidden ones)
  if (field.dependsOn) {
    const dependencyValue = values[field.dependsOn]
    const fieldHasSavedValue = hasValue(values[field.name])

    // Show field if:
    // 1. Dependency is satisfied, OR
    // 2. Field already has a saved value (from reopening a saved config)
    if (!dependencyValue && !fieldHasSavedValue) {
      return false // Hide if dependency is not satisfied AND no saved value
    }
  }

  // Check visibleWhen condition (for conditional field visibility)
  if (field.visibleWhen) {
    const { field: conditionField, value: conditionValue } = field.visibleWhen
    const currentValue = values[conditionField]

    // Support both single values and arrays
    if (Array.isArray(conditionValue)) {
      return conditionValue.includes(currentValue)
    }

    return currentValue === conditionValue
  }

  // Show by default
  return true
}

/**
 * Check if a value is considered "present" (not empty)
 *
 * @param value - Value to check
 * @returns true if value exists and is not empty
 */
export function hasValue(value: any): boolean {
  if (value === undefined || value === null) return false
  if (value === '') return false
  if (Array.isArray(value) && value.length === 0) return false
  return true
}

/**
 * Check if config has any saved values (not just empty)
 * Used to determine if we're reopening a saved config vs creating new
 *
 * @param config - Configuration object
 * @returns true if config has saved values
 */
export function hasSavedConfig(config: Record<string, any>): boolean {
  if (!config || typeof config !== 'object') return false

  // Check if there are any non-metadata keys with values
  const configKeys = Object.keys(config).filter(key =>
    !key.startsWith('__') && // Skip __dynamicOptions, __validationState, etc.
    !key.startsWith('_label_') && // Skip label keys
    !key.startsWith('_cached') // Skip cached data keys
  )

  return configKeys.some(key => hasValue(config[key]))
}
