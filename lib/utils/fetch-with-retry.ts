import { logger } from './logger'

export interface FetchWithRetryOptions {
  maxRetries?: number
  timeoutMs?: number
  retryDelayMs?: number
  useExponentialBackoff?: boolean
  retryOn?: (error: any, response?: Response) => boolean
  onRetry?: (attempt: number, error: any) => void
}

const defaultOptions: Required<FetchWithRetryOptions> = {
  maxRetries: 2,
  timeoutMs: 45000, // 45 seconds
  retryDelayMs: 1000, // 1 second base delay
  useExponentialBackoff: true,
  retryOn: (error: any, response?: Response) => {
    // Retry on network errors or timeouts
    if (error.name === 'AbortError') return true
    if (error.message?.includes('Failed to fetch')) return true
    if (error.message?.includes('NetworkError')) return true
    // Don't retry on 4xx errors (client errors)
    if (response && response.status >= 400 && response.status < 500) return false
    // Retry on 5xx errors (server errors)
    if (response && response.status >= 500) return true
    return false
  },
  onRetry: () => {},
}

/**
 * Fetch with automatic retries and exponential backoff
 *
 * Features:
 * - Automatic timeout protection
 * - Configurable retry logic
 * - Exponential backoff (optional)
 * - Detailed error logging
 *
 * @example
 * const response = await fetchWithRetry('/api/data', {
 *   method: 'POST',
 *   body: JSON.stringify({ foo: 'bar' }),
 * }, {
 *   maxRetries: 3,
 *   timeoutMs: 30000,
 * })
 */
export async function fetchWithRetry(
  url: string | URL,
  init?: RequestInit,
  options?: FetchWithRetryOptions
): Promise<Response> {
  const opts = { ...defaultOptions, ...options }
  let lastError: any = null

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), opts.timeoutMs)

    // Merge signals if user provided one
    const signal = init?.signal
      ? combineAbortSignals([controller.signal, init.signal])
      : controller.signal

    try {
      logger.debug(`[FetchWithRetry] Attempt ${attempt + 1}/${opts.maxRetries + 1}`, {
        url: url.toString(),
        method: init?.method || 'GET'
      })

      const response = await fetch(url, {
        ...init,
        signal,
      })

      clearTimeout(timeoutId)

      // Check if we should retry based on response
      if (!response.ok && opts.retryOn(null, response) && attempt < opts.maxRetries) {
        logger.warn(`[FetchWithRetry] HTTP ${response.status}, retrying...`, {
          url: url.toString(),
          attempt: attempt + 1
        })

        // Wait before retrying
        const delay = opts.useExponentialBackoff
          ? opts.retryDelayMs * Math.pow(2, attempt)
          : opts.retryDelayMs
        await new Promise(resolve => setTimeout(resolve, delay))

        opts.onRetry(attempt + 1, { status: response.status })
        continue
      }

      return response

    } catch (error: any) {
      clearTimeout(timeoutId)
      lastError = error

      // Check if we should retry
      if (opts.retryOn(error) && attempt < opts.maxRetries) {
        logger.warn(`[FetchWithRetry] Error, retrying...`, {
          url: url.toString(),
          attempt: attempt + 1,
          error: error.message
        })

        // Wait before retrying
        const delay = opts.useExponentialBackoff
          ? opts.retryDelayMs * Math.pow(2, attempt)
          : opts.retryDelayMs
        await new Promise(resolve => setTimeout(resolve, delay))

        opts.onRetry(attempt + 1, error)
        continue
      }

      // Don't retry - throw the error
      if (error.name === 'AbortError') {
        throw new Error('Request timeout - please try again')
      }
      throw error
    }
  }

  // All retries exhausted
  logger.error('[FetchWithRetry] All retries exhausted', {
    url: url.toString(),
    error: lastError?.message
  })

  if (lastError?.name === 'AbortError') {
    throw new Error('Request timeout after retries - please try again')
  }
  if (lastError?.message?.includes('Failed to fetch') || lastError?.message?.includes('NetworkError')) {
    throw new Error('Network error - please check your connection')
  }

  throw lastError || new Error('Failed to fetch after retries')
}

/**
 * Combine multiple AbortSignals into one
 */
function combineAbortSignals(signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController()

  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort()
      break
    }
    signal.addEventListener('abort', () => controller.abort(), { once: true })
  }

  return controller.signal
}

/**
 * Fetch JSON with retry logic
 */
export async function fetchJsonWithRetry<T = any>(
  url: string | URL,
  init?: RequestInit,
  options?: FetchWithRetryOptions
): Promise<T> {
  const response = await fetchWithRetry(url, init, options)

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(errorData.error || errorData.message || `HTTP ${response.status}: ${response.statusText}`)
  }

  return response.json()
}
