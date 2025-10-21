import { logger } from '@/lib/utils/logger'
import type { KeyValuePair } from '@/components/workflows/configuration/fields/KeyValuePairs'

interface ExecuteHttpRequestContext {
  config: {
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
    url: string
    headers?: KeyValuePair[]
    queryParams?: KeyValuePair[]
    body?: string
    authType?: 'none' | 'bearer' | 'basic' | 'apikey'
    bearerToken?: string
    basicUsername?: string
    basicPassword?: string
    apiKeyHeader?: string
    apiKeyValue?: string
    timeoutSeconds?: number
  }
  previousOutputs: Record<string, any>
  trigger?: any
}

/**
 * Execute HTTP Request node - Makes HTTP requests to external APIs
 * Supports all HTTP methods, authentication, headers, query params, and body
 */
export async function executeHttpRequest(context: ExecuteHttpRequestContext) {
  try {
    const { config, previousOutputs } = context
    const {
      method,
      url,
      headers = [],
      queryParams = [],
      body,
      authType = 'none',
      bearerToken,
      basicUsername,
      basicPassword,
      apiKeyHeader,
      apiKeyValue,
      timeoutSeconds = 30,
    } = config

    if (!url) {
      throw new Error('URL is required for HTTP request')
    }

    // Resolve variables in URL
    const resolvedUrl = resolveVariables(url, previousOutputs)

    // Build query string from query params
    const queryString = buildQueryString(queryParams, previousOutputs)
    const fullUrl = queryString ? `${resolvedUrl}?${queryString}` : resolvedUrl

    // Build headers
    const requestHeaders = buildHeaders(headers, authType, {
      bearerToken,
      basicUsername,
      basicPassword,
      apiKeyHeader,
      apiKeyValue,
    }, previousOutputs)

    // Resolve variables in body
    const resolvedBody = body ? resolveVariables(body, previousOutputs) : undefined

    logger.info('Executing HTTP request', {
      method,
      url: resolvedUrl, // Log without query params to avoid exposing sensitive data
      authType,
    })

    // Make the HTTP request with timeout
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutSeconds * 1000)

    try {
      const response = await fetch(fullUrl, {
        method,
        headers: requestHeaders,
        body: method !== 'GET' && resolvedBody ? resolvedBody : undefined,
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      // Parse response
      const contentType = response.headers.get('content-type')
      let responseData: any

      if (contentType?.includes('application/json')) {
        responseData = await response.json()
      } else if (contentType?.includes('text/')) {
        responseData = await response.text()
      } else {
        // For binary/unknown content, get as text
        responseData = await response.text()
      }

      // Check if response was successful
      if (!response.ok) {
        logger.error('HTTP request failed', {
          status: response.status,
          statusText: response.statusText,
        })

        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
          data: {
            status: response.status,
            statusText: response.statusText,
            headers: Object.fromEntries(response.headers.entries()),
            body: responseData,
          }
        }
      }

      logger.info('HTTP request successful', {
        status: response.status,
      })

      return {
        success: true,
        data: {
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers.entries()),
          body: responseData,
        }
      }
    } catch (fetchError: any) {
      clearTimeout(timeoutId)

      if (fetchError.name === 'AbortError') {
        throw new Error(`Request timeout after ${timeoutSeconds} seconds`)
      }

      throw fetchError
    }
  } catch (error: any) {
    logger.error('Error executing HTTP request:', error)
    return {
      success: false,
      error: error.message || 'Failed to execute HTTP request',
    }
  }
}

/**
 * Resolve {{variable}} placeholders in a string
 */
function resolveVariables(text: string, data: Record<string, any>): string {
  return text.replace(/\{\{([^}]+)\}\}/g, (match, varPath) => {
    const value = getNestedValue(data, varPath.trim())
    return value !== undefined ? String(value) : match
  })
}

/**
 * Build query string from key-value pairs
 */
function buildQueryString(
  params: KeyValuePair[],
  data: Record<string, any>
): string {
  const validParams = params.filter(p => p.key && p.value)

  if (validParams.length === 0) {
    return ''
  }

  const searchParams = new URLSearchParams()

  validParams.forEach(param => {
    const value = param.isVariable
      ? resolveVariables(param.value, data)
      : param.value

    searchParams.append(param.key, value)
  })

  return searchParams.toString()
}

/**
 * Build request headers including authentication
 */
function buildHeaders(
  headerPairs: KeyValuePair[],
  authType: string,
  authConfig: {
    bearerToken?: string
    basicUsername?: string
    basicPassword?: string
    apiKeyHeader?: string
    apiKeyValue?: string
  },
  data: Record<string, any>
): Record<string, string> {
  const headers: Record<string, string> = {}

  // Add custom headers
  headerPairs
    .filter(h => h.key && h.value)
    .forEach(header => {
      const value = header.isVariable
        ? resolveVariables(header.value, data)
        : header.value

      headers[header.key] = value
    })

  // Add authentication headers
  if (authType === 'bearer' && authConfig.bearerToken) {
    const token = resolveVariables(authConfig.bearerToken, data)
    headers['Authorization'] = `Bearer ${token}`
  } else if (authType === 'basic' && authConfig.basicUsername && authConfig.basicPassword) {
    const username = resolveVariables(authConfig.basicUsername, data)
    const password = resolveVariables(authConfig.basicPassword, data)
    const credentials = Buffer.from(`${username}:${password}`).toString('base64')
    headers['Authorization'] = `Basic ${credentials}`
  } else if (authType === 'apikey' && authConfig.apiKeyHeader && authConfig.apiKeyValue) {
    const headerName = resolveVariables(authConfig.apiKeyHeader, data)
    const headerValue = resolveVariables(authConfig.apiKeyValue, data)
    headers[headerName] = headerValue
  }

  // Set Content-Type if not already set and body exists
  if (!headers['Content-Type'] && !headers['content-type']) {
    headers['Content-Type'] = 'application/json'
  }

  return headers
}

/**
 * Get nested value from object using dot notation
 */
function getNestedValue(obj: any, path: string): any {
  if (!path) return undefined

  const keys = path.split('.')
  let current = obj

  for (const key of keys) {
    if (current === null || current === undefined) {
      return undefined
    }
    current = current[key]
  }

  return current
}
