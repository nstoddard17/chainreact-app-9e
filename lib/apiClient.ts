import { getBaseUrl } from "./utils/getBaseUrl"
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
    this.baseUrl = getBaseUrl()
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
      console.log(`🔧 Base URL: ${this.baseUrl}`)
      console.log(`🔧 Endpoint: ${endpoint}`)

      const response = await fetch(url, config)

      if (!response.ok) {
        console.error(`❌ HTTP Error: ${response.status} ${response.statusText} for ${url}`)
        // Return a structured error response instead of throwing
        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
          data: undefined,
        }
      }

      const data = await response.json()
      console.log(`✅ API Response: ${endpoint}`, data)

      return {
        success: true,
        data: data.data || data,
        message: data.message,
      }
    } catch (error: any) {
      console.error(`❌ API Error: ${endpoint}`, error)
      console.error(`🔧 Base URL: ${this.baseUrl}`)
      console.error(`🔧 Full URL: ${this.baseUrl}${endpoint}`)

      // Return a structured error response instead of throwing
      return {
        success: false,
        error: error.message || "Network error",
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
