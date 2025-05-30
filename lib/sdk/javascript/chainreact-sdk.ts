export interface ChainReactConfig {
  apiKey: string
  baseUrl?: string
}

export interface Workflow {
  id: string
  name: string
  description?: string
  nodes: any[]
  connections: any[]
  variables?: Record<string, any>
  configuration?: Record<string, any>
  status: string
  created_at: string
  updated_at: string
}

export interface CreateWorkflowRequest {
  name: string
  description?: string
  nodes: any[]
  connections: any[]
  variables?: Record<string, any>
  configuration?: Record<string, any>
}

export interface PaginatedResponse<T> {
  data: T[]
  pagination: {
    page: number
    limit: number
    total: number
    pages: number
  }
}

export interface WebhookSubscription {
  id: string
  name: string
  event_types: string[]
  target_url: string
  is_active: boolean
  created_at: string
}

export interface CreateWebhookRequest {
  name: string
  event_types: string[]
  target_url: string
  secret_key?: string
  headers?: Record<string, string>
}

export class ChainReactSDK {
  private config: ChainReactConfig
  private baseUrl: string

  constructor(config: ChainReactConfig) {
    this.config = config
    this.baseUrl = config.baseUrl || "https://api.chainreact.dev"
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`
    const headers = {
      Authorization: `Bearer ${this.config.apiKey}`,
      "Content-Type": "application/json",
      ...options.headers,
    }

    const response = await fetch(url, {
      ...options,
      headers,
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "Unknown error" }))
      throw new Error(`API Error: ${response.status} - ${error.error || error.message}`)
    }

    return response.json()
  }

  // Workflow Management
  async getWorkflows(params?: {
    page?: number
    limit?: number
  }): Promise<PaginatedResponse<Workflow>> {
    const searchParams = new URLSearchParams()
    if (params?.page) searchParams.set("page", params.page.toString())
    if (params?.limit) searchParams.set("limit", params.limit.toString())

    return this.request(`/api/v1/workflows?${searchParams}`)
  }

  async getWorkflow(id: string): Promise<{ data: Workflow }> {
    return this.request(`/api/v1/workflows/${id}`)
  }

  async createWorkflow(workflow: CreateWorkflowRequest): Promise<{ data: Workflow }> {
    return this.request("/api/v1/workflows", {
      method: "POST",
      body: JSON.stringify(workflow),
    })
  }

  async updateWorkflow(id: string, workflow: Partial<CreateWorkflowRequest>): Promise<{ data: Workflow }> {
    return this.request(`/api/v1/workflows/${id}`, {
      method: "PUT",
      body: JSON.stringify(workflow),
    })
  }

  async deleteWorkflow(id: string): Promise<void> {
    await this.request(`/api/v1/workflows/${id}`, {
      method: "DELETE",
    })
  }

  async executeWorkflow(id: string, input?: Record<string, any>): Promise<{ data: { execution_id: string } }> {
    return this.request(`/api/v1/workflows/${id}/execute`, {
      method: "POST",
      body: JSON.stringify({ input }),
    })
  }

  // Webhook Management
  async getWebhooks(): Promise<{ data: WebhookSubscription[] }> {
    return this.request("/api/v1/webhooks")
  }

  async createWebhook(webhook: CreateWebhookRequest): Promise<{ data: WebhookSubscription }> {
    return this.request("/api/v1/webhooks", {
      method: "POST",
      body: JSON.stringify(webhook),
    })
  }

  async updateWebhook(id: string, webhook: Partial<CreateWebhookRequest>): Promise<{ data: WebhookSubscription }> {
    return this.request(`/api/v1/webhooks/${id}`, {
      method: "PUT",
      body: JSON.stringify(webhook),
    })
  }

  async deleteWebhook(id: string): Promise<void> {
    await this.request(`/api/v1/webhooks/${id}`, {
      method: "DELETE",
    })
  }

  // Analytics
  async getUsageAnalytics(params?: {
    start_date?: string
    end_date?: string
    granularity?: "hour" | "day" | "week" | "month"
  }): Promise<{ data: any[] }> {
    const searchParams = new URLSearchParams()
    if (params?.start_date) searchParams.set("start_date", params.start_date)
    if (params?.end_date) searchParams.set("end_date", params.end_date)
    if (params?.granularity) searchParams.set("granularity", params.granularity)

    return this.request(`/api/v1/analytics/usage?${searchParams}`)
  }
}

// Export for Node.js environments
export default ChainReactSDK
