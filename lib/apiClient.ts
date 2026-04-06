import { getApiBaseUrl } from "./utils/getBaseUrl"
import { createClient } from "@/utils/supabaseClient"

import { logger } from '@/lib/utils/logger'

interface ApiResponse<T = any> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

class ApiClient {
  constructor() {
    // No longer store baseUrl at initialization
  }

  private getBaseUrl(): string {
    // For client-side requests in development, always use window.location
    if (typeof window !== 'undefined') {
      const hostname = window.location.hostname
      if (hostname === 'localhost' || hostname === '127.0.0.1') {
        const url = `${window.location.protocol}//${window.location.host}`
        logger.info('🔧 [ApiClient] Using window.location for baseUrl:', url)
        return url
      }
    }
    
    // Otherwise use the standard function
    const url = getApiBaseUrl()
    logger.info('🔧 [ApiClient] Getting dynamic baseUrl:', url)
    return url
  }

  private async getAuthHeaders(): Promise<Record<string, string>> {
    try {
      logger.info("🔍 Getting auth headers...")
      
      // First validate user authentication
      const supabase = createClient()
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser()

      if (userError || !user) {
        throw new Error("Not authenticated")
      }

      // Then get session for access token
      const { data: { session } } = await supabase.auth.getSession()
      logger.info("🔍 Session data:", session ? { 
        hasAccessToken: !!session.access_token, 
        tokenLength: session.access_token?.length || 0,
        expiresAt: session.expires_at 
      } : null)
      
      if (session?.access_token) {
        logger.info("✅ Auth token found, returning Authorization header")
        return {
          "Authorization": `Bearer ${session.access_token}`,
        }
      } 
        logger.warn("⚠️ No session or access token found")
      
    } catch (error) {
      logger.error("❌ Failed to get auth token:", error)
    }
    logger.info("❌ Returning empty auth headers")
    return {}
  }

  private async request<T = any>(endpoint: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
    try {
      // Get base URL dynamically for each request
      const baseUrl = this.getBaseUrl()
      // Ensure we're using the same domain to avoid CORS issues
      const url = `${baseUrl}${endpoint}`

      const defaultHeaders = {
        "Content-Type": "application/json",
      }

      // Get authentication headers
      const authHeaders = await this.getAuthHeaders()
      logger.info("🔍 Auth headers retrieved:", authHeaders)

      const config: RequestInit = {
        ...options,
        headers: {
          ...defaultHeaders,
          ...authHeaders,
          ...options.headers,
        },
        credentials: "include", // Include cookies for authentication
      }

      logger.info(`🌐 API Request: ${config.method || "GET"} ${url}`)
      if (config.headers) {
        const headersObj = config.headers as Record<string, string>
        logger.info(`🌐 API Request Headers:`, Object.fromEntries(Object.entries(headersObj).filter(([key]) => key.toLowerCase() !== 'authorization')))
        logger.info(`🔍 Has Authorization header:`, !!headersObj['Authorization'])
      }
      if (config.body) {
        const bodyLength = typeof config.body === 'string' ? config.body.length : JSON.stringify(config.body).length
        logger.info(`🌐 API Request Body length:`, bodyLength)
      }

      let response: Response;
      try {
        response = await fetch(url, config)
      } catch (fetchError: any) {
        logger.error(`❌ Fetch failed for ${endpoint}:`, fetchError)
        logger.error(`❌ URL was: ${url}`)
        logger.error(`❌ Base URL: ${baseUrl}`)
        throw new Error(`Network error: ${fetchError.message || 'Failed to fetch'}`)
      }

      // Auto-recover from 431 (Request Header Fields Too Large) by clearing stale cookies
      if (response.status === 431) {
        logger.warn(`[ApiClient] 431 header too large for ${endpoint}, clearing stale auth data and retrying`)
        try {
          // Clear stale auth cookies that may have accumulated
          document.cookie.split(';').forEach(cookie => {
            const name = cookie.split('=')[0].trim()
            if (name.startsWith('sb-') || name.includes('supabase')) {
              document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`
            }
          })
          localStorage.removeItem('chainreact-auth')

          // Retry the request once after clearing
          const retryResponse = await fetch(url, config)
          if (retryResponse.ok) {
            const data = await retryResponse.json().catch(() => ({}))
            return { success: true, data }
          }
        } catch (e) {
          // Fall through to normal error handling
        }
      }

      if (!response.ok) {
        // Try to get error details from response body
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`
        let errorDetails: any = undefined

        logger.error(`❌ API Error Response: ${endpoint}`, {
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers.entries()),
          url: url
        })

        try {
          const responseText = await response.text()
          logger.error(`❌ API Error Response Body length: ${endpoint}`, responseText.length)
          
          if (responseText.trim()) {
            const errorData = JSON.parse(responseText)
            if (errorData.error) {
              errorMessage = errorData.error
            } else if (errorData.message) {
              errorMessage = errorData.message
            }
            errorDetails = errorData
          } else {
            // If response body is empty, create a more descriptive error message
            if (response.status === 403) {
              errorMessage = "Access denied. Please check your permissions and try again."
            } else if (response.status === 401) {
              errorMessage = "Authentication failed. Please reconnect your account."
            } else {
              errorMessage = `HTTP ${response.status}: ${response.statusText}`
            }
          }
        } catch (e) {
          // If response is not JSON, create a descriptive error message
          logger.warn("Failed to parse error response as JSON:", e)
          if (response.status === 403) {
            errorMessage = "Access denied. Please check your permissions and try again."
          } else if (response.status === 401) {
            errorMessage = "Authentication failed. Please reconnect your account."
          } else {
            errorMessage = `HTTP ${response.status}: ${response.statusText}`
          }
        }

        logger.error(`❌ API Error: ${endpoint}`, { status: response.status, message: errorMessage })

        return {
          success: false,
          error: errorMessage,
          data: undefined,
          ...(errorDetails && { details: errorDetails })
        }
      }

      let data: any
      try {
        data = await response.json()
      } catch (e) {
        logger.warn("Failed to parse response as JSON, returning empty data")
        data = {}
      }

      // Log successful API responses without sensitive data
      if (endpoint.includes('gmail') || endpoint.includes('recipients') || endpoint.includes('contacts')) {
        logger.info(`✅ API Response: ${endpoint} - ${Array.isArray(data.data) ? data.data.length : 'Unknown'} items`)
      } else {
        logger.info(`✅ API Response: ${endpoint}`)
      }

      return {
        success: true,
        data: data.data || data,
        message: data.message,
      }
    } catch (error: any) {
      const baseUrl = this.getBaseUrl()
      logger.error(`❌ API Network Error: ${endpoint}`, error)
      logger.error(`❌ Error details:`, {
        message: error.message,
        endpoint,
        baseUrl: baseUrl,
        url: `${baseUrl}${endpoint}`,
        stack: error.stack
      })

      // Return a structured error response for network errors
      return {
        success: false,
        error: error.message || "Network error occurred",
        data: undefined,
      }
    }
  }

  async get<T = any>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: "GET" })
  }

  async post<T = any>(endpoint: string, data?: any): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: "POST",
      body: data ? JSON.stringify(data) : undefined,
    })
  }

  async put<T = any>(endpoint: string, data?: any): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: "PUT",
      body: data ? JSON.stringify(data) : undefined,
    })
  }

  async delete<T = any>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: "DELETE" })
  }

  async patch<T = any>(endpoint: string, data?: any): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: "PATCH",
      body: data ? JSON.stringify(data) : undefined,
    })
  }
}

// Export singleton instance
export const apiClient = new ApiClient()
export default apiClient
