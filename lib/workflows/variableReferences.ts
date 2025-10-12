"use client"

const VARIABLE_REGEX = /\{\{([^}]+)\}\}/g

export interface ParsedVariableReference {
  kind: "trigger" | "node" | "unknown"
  nodeId?: string
  fieldPath: string[]
  raw: string
}

export const slugifyIdentifier = (value: string): string => {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const normalizeVariableInner = (inner: string): string => {
  const trimmed = inner.trim()
  if (!trimmed) return trimmed

  // Leave trigger and context paths untouched
  if (trimmed.startsWith('trigger.') || trimmed.startsWith('context.')) {
    return trimmed
  }

  const parts = trimmed.split('.')

  // node.<id>.output.some.path → <id>.some.path
  if (parts[0] === 'node' && parts.length >= 4 && parts[2] === 'output') {
    const nodeId = parts[1]
    const fieldPath = parts.slice(3)
    return fieldPath.length > 0 ? `${nodeId}.${fieldPath.join('.')}` : nodeId
  }

  // <id>.output.some.path → <id>.some.path
  const outputIndex = parts.indexOf('output')
  if (outputIndex === 1) {
    const nodeId = parts[0]
    const fieldPath = parts.slice(2)
    return fieldPath.length > 0 ? `${nodeId}.${fieldPath.join('.')}` : nodeId
  }

  return trimmed
}

export const normalizeVariableReference = (variableRef: string): string => {
  if (typeof variableRef !== 'string') return variableRef

  return variableRef.replace(VARIABLE_REGEX, (_, inner) => {
    const normalizedInner = normalizeVariableInner(inner)
    return `{{${normalizedInner}}}`
  })
}

export const normalizeVariableExpression = (expression: string): string => {
  return normalizeVariableInner(expression)
}

export const parseVariableReference = (variableRef: string): ParsedVariableReference | null => {
  if (!variableRef || typeof variableRef !== 'string') return null
  const match = variableRef.match(/\{\{([^}]+)\}\}/)
  if (!match) {
    // accept raw expression without braces
    return parseVariableExpression(variableRef)
  }
  return parseVariableExpression(match[1])
}

const parseVariableExpression = (expression: string): ParsedVariableReference | null => {
  const normalized = normalizeVariableInner(expression)
  if (!normalized) return null

  if (normalized.startsWith('trigger.')) {
    const fieldPath = normalized.split('.').slice(1)
    return { kind: 'trigger', fieldPath, raw: normalized }
  }

  const parts = normalized.split('.').filter(part => part.length > 0)
  if (parts.length >= 1) {
    const [nodeId, ...fieldPath] = parts
    return { kind: 'node', nodeId, fieldPath, raw: normalized }
  }

  return { kind: 'unknown', fieldPath: [normalized], raw: normalized }
}

export const normalizeAllVariablesInObject = <T extends Record<string, any>>(obj: T): T => {
  const normalizedEntries = Object.entries(obj).map(([key, value]) => {
    if (typeof value === 'string') {
      return [key, normalizeVariableReference(value)]
    }

    if (Array.isArray(value)) {
      return [key, value.map(item => {
        if (typeof item === 'string') return normalizeVariableReference(item)
        if (Array.isArray(item)) return item.map(inner => typeof inner === 'string' ? normalizeVariableReference(inner) : inner)
        if (item && typeof item === 'object') return normalizeAllVariablesInObject(item as Record<string, any>)
        return item
      })]
    }

    const isDate = value instanceof Date
    const isFile = typeof File !== 'undefined' && value instanceof File
    const isBlob = typeof Blob !== 'undefined' && value instanceof Blob

    if (value && typeof value === 'object' && !isDate && !isFile && !isBlob) {
      return [key, normalizeAllVariablesInObject(value as Record<string, any>)]
    }

    return [key, value]
  })

  return Object.fromEntries(normalizedEntries) as T
}

export const buildVariableReference = (nodeId: string, fieldPath?: string | string[]): string => {
  const pathParts = Array.isArray(fieldPath)
    ? fieldPath
    : fieldPath ? [fieldPath] : []
  const parts = [nodeId, ...pathParts].filter(part => part && part.length > 0)
  return `{{${parts.join('.')}}}`
}
