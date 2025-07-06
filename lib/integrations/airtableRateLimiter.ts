/**
 * Shared utility for Airtable API rate limiting with exponential backoff retry logic
 */

export async function fetchAirtableWithRetry(
  url: string, 
  options: RequestInit, 
  maxRetries = 3
): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // Add delay before each request (longer for subsequent attempts)
    if (attempt > 0) {
      const delay = Math.min(1000 * Math.pow(2, attempt), 10000) // Max 10 seconds
  
      await new Promise(resolve => setTimeout(resolve, delay))
    } else {
      // Initial delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
    
    const response = await fetch(url, options)
    
    if (response.status === 429) {

      if (attempt === maxRetries) {
        throw new Error("Airtable rate limit exceeded after maximum retries")
      }
      continue
    }
    
    if (response.ok) {
      return response
    }
    
    if (response.status === 401) {
      throw new Error("Airtable authentication expired. Please reconnect your account.")
    }
    
    // For other errors, don't retry
    const errorData = await response.json().catch(() => ({}))
    throw new Error(`Airtable API error: ${response.status} - ${errorData.message || "Unknown error"}`)
  }
  
  throw new Error("Max retries exceeded")
}

/**
 * Helper function to add delay between paginated requests
 */
export async function delayBetweenRequests(ms: number = 1500): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms))
} 