/**
 * Fetch with automatic timeout protection
 *
 * Prevents requests from hanging indefinitely by aborting after a specified timeout.
 *
 * @param url - The URL to fetch
 * @param options - Standard fetch options
 * @param timeoutMs - Timeout in milliseconds (default: 8000ms = 8 seconds)
 * @returns Promise<Response>
 * @throws Error if request times out or network fails
 *
 * @example
 * ```typescript
 * const response = await fetchWithTimeout('/api/data', {
 *   method: 'POST',
 *   body: JSON.stringify({ foo: 'bar' })
 * }, 10000) // 10 second timeout
 * ```
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = 8000
): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    })
    return response
  } catch (error: any) {
    if (error.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs}ms`)
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Query with timeout protection for Supabase or other promise-based APIs
 *
 * Since Supabase doesn't support AbortController, we use Promise.race to timeout.
 *
 * @param queryPromise - The query promise to execute
 * @param timeoutMs - Timeout in milliseconds (default: 8000ms = 8 seconds)
 * @returns Promise<T> - The query result
 * @throws Error if query times out
 *
 * @example
 * ```typescript
 * const result = await queryWithTimeout(
 *   supabase.from('users').select('*').eq('id', userId),
 *   10000 // 10 second timeout
 * )
 * ```
 */
export async function queryWithTimeout<T>(
  queryPromise: Promise<T>,
  timeoutMs: number = 8000
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`Query timed out after ${timeoutMs}ms`)), timeoutMs)
  )

  return Promise.race([queryPromise, timeoutPromise])
}

/**
 * Retry a fetch operation with exponential backoff
 *
 * @param fn - The async function to retry
 * @param retries - Number of retry attempts (default: 3)
 * @param delayMs - Initial delay in milliseconds (default: 1000ms)
 * @returns Promise<T>
 *
 * @example
 * ```typescript
 * const data = await retryWithBackoff(
 *   async () => {
 *     const response = await fetchWithTimeout('/api/data')
 *     if (!response.ok) throw new Error('Failed')
 *     return response.json()
 *   },
 *   3, // retry 3 times
 *   1000 // start with 1 second delay
 * )
 * ```
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  retries: number = 3,
  delayMs: number = 1000
): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    if (retries <= 0) {
      throw error
    }

    // Exponential backoff: 1s, 2s, 4s
    await new Promise(resolve => setTimeout(resolve, delayMs))
    return retryWithBackoff(fn, retries - 1, delayMs * 2)
  }
}
