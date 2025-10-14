import { ConfigField } from "@/lib/workflows/nodes/types"

export interface ValidationNodeInfo {
  providerId?: string
  type?: string
  configSchema?: ConfigField[]
}

type ValidationField = ConfigField & {
  validation?: {
    required?: boolean
  }
  dependsOn?: string
  hidden?: boolean | { $condition?: Record<string, any> }
  showWhen?: Record<string, any>
  conditional?: { field: string; value: any }
  visibleWhen?: { field: string; equals: any }
  conditionalVisibility?: { field: string; value: any }
  visibilityCondition?:
    | "always"
    | {
        field: string
        operator: "isNotEmpty" | "isEmpty" | "equals" | "notEquals" | "in"
        value?: any
      }
    | {
        and: Array<{
          field: string
          operator: "isNotEmpty" | "isEmpty" | "equals" | "notEquals" | "in"
          value?: any
        }>
      }
}

const isEmptyValue = (value: unknown): boolean => {
  if (value === undefined || value === null) return true
  if (typeof value === "string") return value.trim().length === 0
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === "object") return Object.keys(value as Record<string, unknown>).length === 0
  return false
}

const getValue = (values: Record<string, any>, fieldName: string) => values?.[fieldName]

export const isFieldCurrentlyVisible = (
  field: ValidationField,
  values: Record<string, any>,
  nodeInfo?: ValidationNodeInfo,
): boolean => {
  if (field.type === "hidden") return false

  // Check visibilityCondition first (newer pattern used in unified Notion actions)
  if (field.visibilityCondition !== undefined && field.visibilityCondition !== null) {
    // Always show if condition is "always"
    if (field.visibilityCondition === "always") {
      return true
    }

    // Handle object-based visibility conditions
    if (typeof field.visibilityCondition === "object") {
      // Handle 'and' operator for multiple conditions
      if ("and" in field.visibilityCondition && Array.isArray(field.visibilityCondition.and)) {
        const allConditionsMet = field.visibilityCondition.and.every((condition) => {
          const fieldValue = getValue(values, condition.field)

          switch (condition.operator) {
            case "isNotEmpty":
              return !isEmptyValue(fieldValue)
            case "isEmpty":
              return isEmptyValue(fieldValue)
            case "equals":
              if (isEmptyValue(fieldValue) && fieldValue !== 0 && fieldValue !== false) return false
              return fieldValue === condition.value
            case "notEquals":
              return fieldValue !== condition.value
            case "in":
              if (isEmptyValue(fieldValue) && fieldValue !== 0 && fieldValue !== false) return false
              return Array.isArray(condition.value) && condition.value.includes(fieldValue)
            default:
              return true
          }
        })
        return allConditionsMet
      }

      // Handle single condition
      if ("field" in field.visibilityCondition && "operator" in field.visibilityCondition) {
        const fieldValue = getValue(values, field.visibilityCondition.field)

        switch (field.visibilityCondition.operator) {
          case "isNotEmpty":
            return !isEmptyValue(fieldValue)
          case "isEmpty":
            return isEmptyValue(fieldValue)
          case "equals":
            if (isEmptyValue(fieldValue) && fieldValue !== 0 && fieldValue !== false) return false
            return fieldValue === field.visibilityCondition.value
          case "notEquals":
            return fieldValue !== field.visibilityCondition.value
          case "in":
            if (isEmptyValue(fieldValue) && fieldValue !== 0 && fieldValue !== false) return false
            return (
              Array.isArray(field.visibilityCondition.value) &&
              field.visibilityCondition.value.includes(fieldValue)
            )
          default:
            return true
        }
      }
    }
  }

  if (field.dependsOn) {
    const parentValue = getValue(values, field.dependsOn)
    if (isEmptyValue(parentValue)) {
      return false
    }
  }

  if (field.conditional) {
    const actualValue = getValue(values, field.conditional.field)
    if (actualValue !== field.conditional.value) {
      return false
    }
  }

  if (field.showWhen) {
    for (const [dependentField, condition] of Object.entries(field.showWhen)) {
      const actualValue = getValue(values, dependentField)

      if (typeof condition === "object" && condition !== null) {
        for (const [operator, expectedValue] of Object.entries(condition)) {
          switch (operator) {
            case "$ne":
              if (actualValue === expectedValue) return false
              break
            case "$eq":
              if (actualValue !== expectedValue) return false
              break
            case "$exists":
              if (expectedValue && isEmptyValue(actualValue)) return false
              if (!expectedValue && !isEmptyValue(actualValue)) return false
              break
            case "$gt":
              if (!(actualValue > expectedValue)) return false
              break
            case "$lt":
              if (!(actualValue < expectedValue)) return false
              break
            default:
              if (actualValue !== expectedValue) return false
          }
        }
      } else if (condition === "!empty") {
        if (isEmptyValue(actualValue)) return false
      } else if (condition === "empty") {
        if (!isEmptyValue(actualValue)) return false
      } else if (actualValue !== condition) {
        return false
      }
    }
  }

  if (field.visibleWhen) {
    const actualValue = getValue(values, field.visibleWhen.field)
    if (actualValue !== field.visibleWhen.equals) {
      return false
    }
  }

  if (field.conditionalVisibility) {
    const { field: dependentField, value: expectedValue } = field.conditionalVisibility
    const actualValue = getValue(values, dependentField)

    if (expectedValue === true) {
      if (isEmptyValue(actualValue)) return false
    } else if (expectedValue === false) {
      if (!isEmptyValue(actualValue)) return false
    } else if (actualValue !== expectedValue) {
      return false
    }
  }

  if (typeof field.hidden === "object" && field.hidden?.$condition) {
    for (const [dependentField, conditionValue] of Object.entries(field.hidden.$condition)) {
      const actualValue = getValue(values, dependentField)

      if (typeof conditionValue === "object" && conditionValue !== null) {
        for (const [operator, expectedValue] of Object.entries(conditionValue)) {
          switch (operator) {
            case "$exists":
              if (expectedValue === false && isEmptyValue(actualValue)) return false
              if (expectedValue === true && !isEmptyValue(actualValue)) return false
              break
            case "$eq":
              if (actualValue === expectedValue) return false
              break
            case "$ne":
              if (actualValue !== expectedValue) return false
              break
            default:
              if (actualValue === expectedValue) return false
          }
        }
      } else if (actualValue === conditionValue) {
        return false
      }
    }
  } else if (field.hidden === true) {
    return false
  }

  return true
}

export const getVisibleFields = (nodeInfo: ValidationNodeInfo | undefined, values: Record<string, any>) => {
  if (!nodeInfo?.configSchema) return []
  return nodeInfo.configSchema.filter((field) => isFieldCurrentlyVisible(field as ValidationField, values, nodeInfo))
}

export const getMissingRequiredFields = (
  nodeInfo: ValidationNodeInfo | undefined,
  values: Record<string, any>,
): string[] => {
  const visibleFields = getVisibleFields(nodeInfo, values)
  const missing: string[] = []

  visibleFields.forEach((field) => {
    const isRequired = (field as ValidationField).required || (field as ValidationField).validation?.required
    if (!isRequired) return

    const fieldValue = getValue(values, field.name)
    if (isEmptyValue(fieldValue)) {
      missing.push(field.label || field.name)
    }
  })

  return missing
}

