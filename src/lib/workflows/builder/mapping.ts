import type { Edge } from "./schema"

export type MappingContext = {
  inputs: Record<string, any>
  globals: Record<string, any>
  nodeOutputs: Record<string, any>
  upstream: any
}

export interface MappingErrorDetails {
  type: "MappingError"
  edgeId: string
  targetPath: string
  expr: string
  message: string
  upstreamSample: any
  nodeFrom: string
  nodeTo: string
}

let jexlInstancePromise: Promise<any> | null = null

async function loadJexl() {
  if (!jexlInstancePromise) {
    jexlInstancePromise = import("jexl").then((mod) => {
      const JexlCtor = (mod as any).Jexl ?? (mod as any).default ?? (mod as any)
      return new JexlCtor()
    })
  }
  return jexlInstancePromise
}

function splitNullishSegments(expr: string): string[] {
  const segments: string[] = []
  let buffer = ""
  let depth = 0
  let quote: string | null = null
  let escape = false

  for (let i = 0; i < expr.length; i++) {
    const char = expr[i]

    if (escape) {
      buffer += char
      escape = false
      continue
    }

    if (char === "\\") {
      buffer += char
      escape = true
      continue
    }

    if (quote) {
      buffer += char
      if (char === quote) {
        quote = null
      }
      continue
    }

    if (char === "'" || char === '"') {
      quote = char
      buffer += char
      continue
    }

    if (char === "{" || char === "[" || char === "(") {
      depth++
      buffer += char
      continue
    }

    if (char === "}" || char === "]" || char === ")") {
      depth = Math.max(0, depth - 1)
      buffer += char
      continue
    }

    if (char === "?" && expr[i + 1] === "?" && depth === 0) {
      segments.push(buffer.trim())
      buffer = ""
      i++
      continue
    }

    buffer += char
  }

  if (buffer.trim().length > 0) {
    segments.push(buffer.trim())
  }

  return segments.length > 0 ? segments : [expr]
}

export async function evaluateExpr(expr: string, ctx: MappingContext): Promise<any> {
  const trimmed = expr.trim()
  if (!trimmed) {
    return undefined
  }

  const jexl = await loadJexl()
  const segments = splitNullishSegments(trimmed)

  let lastValue: any
  let lastError: unknown

  for (const segment of segments) {
    if (!segment) {
      continue
    }
    try {
      const value = await jexl.eval(segment, ctx)
      if (value !== undefined && value !== null) {
        return value
      }
      lastValue = value
    } catch (error) {
      lastError = error
      break
    }
  }

  if (lastError) {
    throw lastError
  }

  return lastValue
}

export function setByPath(target: any, path: string, value: any): void {
  if (!path || typeof path !== "string") {
    throw new Error("Path must be a non-empty string")
  }

  const segments = parsePath(path)
  let current = target

  segments.forEach((segment, index) => {
    const isLast = index === segments.length - 1

    if (isLast) {
      if (current && typeof current === "object") {
        current[segment] = value
      }
      return
    }

    if (current[segment] == null) {
      const nextSegment = segments[index + 1]
      current[segment] = typeof nextSegment === "number" ? [] : {}
    }

    current = current[segment]
  })
}

function parsePath(path: string): Array<string | number> {
  const tokens: Array<string | number> = []
  let buffer = ""
  let inBracket = false
  let quote: string | null = null

  for (let i = 0; i < path.length; i++) {
    const char = path[i]

    if (inBracket) {
      if (quote) {
        if (char === "\\") {
          buffer += char
          i++
          if (i < path.length) {
            buffer += path[i]
          }
          continue
        }
        if (char === quote) {
          quote = null
          continue
        }
        buffer += char
        continue
      }

      if (char === '"' || char === "'") {
        quote = char
        continue
      }

      if (char === "]") {
        const trimmed = buffer.trim()
        if (trimmed.length > 0) {
          if (/^-?\d+$/.test(trimmed)) {
            tokens.push(Number(trimmed))
          } else {
            tokens.push(trimmed)
          }
        }
        buffer = ""
        inBracket = false
        continue
      }

      buffer += char
      continue
    }

    if (char === "[") {
      if (buffer) {
        tokens.push(buffer)
        buffer = ""
      }
      inBracket = true
      continue
    }

    if (char === ".") {
      if (buffer) {
        tokens.push(buffer)
        buffer = ""
      }
      continue
    }

    buffer += char
  }

  if (buffer) {
    tokens.push(buffer)
  }

  return tokens
}

export function clip(value: any, bytes = 512): any {
  try {
    const json = JSON.stringify(value)
    if (!json) {
      return value
    }

    if (json.length <= bytes) {
      return value
    }

    const sliced = json.slice(0, bytes)
    return `${sliced}…`
  } catch (error) {
    return value
  }
}

function isNullish(value: any): boolean {
  return value === null || value === undefined
}

function deepMerge(target: any, source: any): any {
  if (typeof target !== "object" || target === null) {
    return source
  }

  if (typeof source !== "object" || source === null) {
    return source
  }

  const output = Array.isArray(target) ? [...target] : { ...target }

  Object.entries(source).forEach(([key, value]) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      output[key] = deepMerge(output[key], value)
    } else {
      output[key] = value
    }
  })

  return output
}

export async function buildDownstreamInput({
  edge,
  ctx,
  toNodeId,
  runId,
}: {
  edge: Edge
  ctx: MappingContext
  toNodeId: string
  runId: string
}): Promise<{
  value: any
  lineage: Array<{
    runId: string
    toNodeId: string
    edgeId: string
    targetPath: string
    fromNodeId: string
    expr: string
  }>
}> {
  const result: Record<string, any> = {}
  const lineage: Array<{
    runId: string
    toNodeId: string
    edgeId: string
    targetPath: string
    fromNodeId: string
    expr: string
  }> = []

  const mappings = edge.mappings ?? []

  for (const mapping of mappings) {
    const targetPath = mapping.to ?? mapping.target
    if (!targetPath) {
      continue
    }

    const expr = mapping.expr
    const value = await evaluateExpr(expr, ctx)

    if (mapping.required !== false && isNullish(value)) {
      const errorDetails: MappingErrorDetails = {
        type: "MappingError",
        edgeId: edge.id,
        targetPath,
        expr,
        message: "Required mapping produced undefined/null",
        upstreamSample: clip(ctx.upstream),
        nodeFrom: edge.from.nodeId,
        nodeTo: toNodeId,
      }
      const error = new Error(errorDetails.message) as Error & MappingErrorDetails
      Object.assign(error, errorDetails)
      error.name = "MappingError"
      throw error
    }

    if (!isNullish(value)) {
      setByPath(result, targetPath, value)
    }

    lineage.push({
      runId,
      toNodeId,
      edgeId: edge.id,
      targetPath,
      fromNodeId: edge.from.nodeId,
      expr,
    })
  }

  return { value: result, lineage }
}
