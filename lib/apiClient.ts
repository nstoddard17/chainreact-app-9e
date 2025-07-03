import { getApiBaseUrl } from "./utils/getBaseUrl"
import { supabase } from "@/utils/supabaseClient"

interface ApiResponse<T = any> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

class ApiClient {
  private baseUrl: string

  constructor() {
    this.baseUrl = getApiBaseUrl()
  }

  private async getAuthHeaders(): Promise<Record<string, string>> {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.access_token) {
        return {
          "Authorization": `Bearer ${session.access_token}`,
        }
      }
    } catch (error) {
      console.warn("Failed to get auth token:", error)
    }
    return {}
  }

  private async request<T = any>(endpoint: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
    try {
      // Ensure we're using the same domain to avoid CORS issues
      const url = `${this.baseUrl}${endpoint}`

      const defaultHeaders = {
        "Content-Type": "application/json",
      }

      // Get authentication headers
      const authHeaders = await this.getAuthHeaders()

      const config: RequestInit = {
        ...options,
        headers: {
          ...defaultHeaders,
          ...authHeaders,
          ...options.headers,
        },
        credentials: "include", // Include cookies for authentication
      }

      console.log(`🌐 API Request: ${config.method || "GET"} ${url}`)

      const response = await fetch(url, config)

      if (!response.ok) {
        // Try to get error details from response body
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`
        let errorDetails: any = undefined

        try {
          const errorData = await response.json()
          if (errorData.error) {
            errorMessage = errorData.error
          } else if (errorData.message) {
            errorMessage = errorData.message
          }
          errorDetails = errorData
        } catch (e) {
          // If response is not JSON, use status text
          console.warn("Failed to parse error response as JSON")
        }

        console.error(`❌ API Error: ${endpoint}`, { status: response.status, message: errorMessage })

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
        console.warn("Failed to parse response as JSON, returning empty data")
        data = {}
      }

      // Log successful API responses without sensitive data
      if (endpoint.includes('gmail') || endpoint.includes('recipients') || endpoint.includes('contacts')) {
        console.log(`✅ API Response: ${endpoint} - ${Array.isArray(data.data) ? data.data.length : 'Unknown'} items`)
      } else {
        console.log(`✅ API Response: ${endpoint}`)
      }

      return {
        success: true,
        data: data.data || data,
        message: data.message,
      }
    } catch (error: any) {
      console.error(`❌ API Network Error: ${endpoint}`, error)

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
