import { getApiBaseUrl } from "./utils/getBaseUrl"

// Client-side API utilities for making requests to our API routes
export class ApiClient {
  private baseUrl: string

  constructor() {
    this.baseUrl = getApiBaseUrl()
  }

  async request<T>(endpoint: string, options: RequestInit = {}): Promise<{ data?: T; error?: string }> {
    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        headers: {
          "Content-Type": "application/json",
          ...options.headers,
        },
        ...options,
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        return { error: errorData.error || `HTTP ${response.status}` }
      }

      const data = await response.json()
      return { data }
    } catch (error) {
      console.error("API request failed:", error)
      return { error: "Network error" }
    }
  }

  async get<T>(endpoint: string): Promise<{ data?: T; error?: string }> {
    return this.request<T>(endpoint, { method: "GET" })
  }

  async post<T>(endpoint: string, body?: any): Promise<{ data?: T; error?: string }> {
    return this.request<T>(endpoint, {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    })
  }

  async put<T>(endpoint: string, body?: any): Promise<{ data?: T; error?: string }> {
    return this.request<T>(endpoint, {
      method: "PUT",
      body: body ? JSON.stringify(body) : undefined,
    })
  }

  async delete<T>(endpoint: string): Promise<{ data?: T; error?: string }> {
    return this.request<T>(endpoint, { method: "DELETE" })
  }
}

// Singleton instance
export const apiClient = new ApiClient()

// Convenience functions
export const api = {
  // Auth
  signIn: (email: string, password: string) => apiClient.post("/api/auth/signin", { email, password }),
  signUp: (email: string, password: string) => apiClient.post("/api/auth/signup", { email, password }),
  signOut: () => apiClient.post("/api/auth/signout"),

  // Integrations
  getIntegrations: () => apiClient.get("/api/integrations"),
  connectIntegration: (provider: string) => apiClient.post(`/api/integrations/${provider}/connect`),
  disconnectIntegration: (id: string) => apiClient.delete(`/api/integrations/${id}`),

  // Workflows
  getWorkflows: () => apiClient.get("/api/workflows"),
  createWorkflow: (workflow: any) => apiClient.post("/api/workflows", workflow),
  updateWorkflow: (id: string, workflow: any) => apiClient.put(`/api/workflows/${id}`, workflow),
  deleteWorkflow: (id: string) => apiClient.delete(`/api/workflows/${id}`),
  executeWorkflow: (id: string, data?: any) => apiClient.post(`/api/workflows/${id}/execute`, data),

  // Organizations
  getOrganizations: () => apiClient.get("/api/organizations"),
  createOrganization: (org: any) => apiClient.post("/api/organizations", org),
  updateOrganization: (id: string, org: any) => apiClient.put(`/api/organizations/${id}`, org),

  // Templates
  getTemplates: () => apiClient.get("/api/templates"),
  copyTemplate: (id: string) => apiClient.post(`/api/templates/${id}/copy`),
}
