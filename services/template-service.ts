import { SessionManager } from "@/lib/auth/session"
import { logger } from '@/lib/utils/logger'
import { fetchWithRetry } from '@/lib/utils/fetch-with-retry'

/**
 * TemplateService handles all API operations for templates.
 * Follows the same pattern as WorkflowService/IntegrationService.
 */
export class TemplateService {

  // --- Fetch ---

  static async fetchTemplates(filters?: {
    category?: string
    search?: string
    page?: number
    limit?: number
    scope?: string
  }): Promise<any[]> {
    const { session } = await SessionManager.getSecureUserAndSession()

    const params = new URLSearchParams()
    if (filters?.category) params.append('category', filters.category)
    if (filters?.search) params.append('search', filters.search)
    if (filters?.page) params.append('page', String(filters.page))
    if (filters?.limit) params.append('limit', String(filters.limit))
    if (filters?.scope) params.append('scope', filters.scope)

    const url = `/api/templates${params.toString() ? '?' + params.toString() : ''}`

    const response = await fetchWithRetry(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
    }, {
      maxRetries: 2,
      timeoutMs: 15000,
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch templates: ${response.statusText}`)
    }

    const data = await response.json()
    return data.data?.templates || data.templates || data || []
  }

  static async fetchPredefined(): Promise<any[]> {
    const { session } = await SessionManager.getSecureUserAndSession()

    const response = await fetchWithRetry('/api/templates/predefined', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
    }, {
      maxRetries: 2,
      timeoutMs: 15000,
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch predefined templates: ${response.statusText}`)
    }

    const data = await response.json()
    return data.data?.templates || data.templates || data || []
  }

  static async getTemplate(id: string): Promise<any> {
    const { session } = await SessionManager.getSecureUserAndSession()

    const response = await fetchWithRetry(`/api/templates/${id}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
    }, {
      maxRetries: 2,
      timeoutMs: 15000,
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch template: ${response.statusText}`)
    }

    const data = await response.json()
    return data.data?.template || data.template || data
  }

  // --- Mutations ---

  static async createTemplate(templateData: Record<string, any>): Promise<any> {
    const { session } = await SessionManager.getSecureUserAndSession()

    const response = await fetch('/api/templates', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(templateData),
    })

    if (!response.ok) {
      const data = await response.json().catch(() => ({}))
      throw new Error(data.error || `Failed to create template: ${response.statusText}`)
    }

    const data = await response.json()
    return data.data?.template || data.template || data
  }

  static async updateTemplate(id: string, updates: Record<string, any>): Promise<void> {
    const { session } = await SessionManager.getSecureUserAndSession()

    const response = await fetch(`/api/templates/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(updates),
    })

    if (!response.ok) {
      const data = await response.json().catch(() => ({}))
      throw new Error(data.error || `Failed to update template: ${response.statusText}`)
    }
  }

  static async deleteTemplate(id: string): Promise<void> {
    const { session } = await SessionManager.getSecureUserAndSession()

    const response = await fetch(`/api/templates/${id}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    })

    if (!response.ok) {
      const data = await response.json().catch(() => ({}))
      throw new Error(data.error || `Failed to delete template: ${response.statusText}`)
    }
  }

  static async downloadTemplate(id: string): Promise<any> {
    const { session } = await SessionManager.getSecureUserAndSession()

    const response = await fetch(`/api/templates/${id}/download`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({}),
    })

    if (!response.ok) {
      const data = await response.json().catch(() => ({}))
      throw new Error(data.error || `Failed to download template: ${response.statusText}`)
    }

    const data = await response.json()
    return data.data?.template || data.template || data
  }

  static async copyTemplate(id: string): Promise<any> {
    const { session } = await SessionManager.getSecureUserAndSession()

    const response = await fetch(`/api/templates/${id}/copy`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({}),
    })

    if (!response.ok) {
      const data = await response.json().catch(() => ({}))
      throw new Error(data.error || `Failed to copy template: ${response.statusText}`)
    }

    const data = await response.json()
    return data.data?.template || data.template || data
  }

  // --- Reviews ---

  static async fetchReviews(templateId: string): Promise<any[]> {
    const { session } = await SessionManager.getSecureUserAndSession()

    const response = await fetchWithRetry(`/api/templates/${templateId}/reviews`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
    }, {
      maxRetries: 2,
      timeoutMs: 10000,
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch reviews: ${response.statusText}`)
    }

    const data = await response.json()
    return data.data || data || []
  }

  static async addReview(templateId: string, rating: number, reviewText?: string): Promise<any> {
    const { session } = await SessionManager.getSecureUserAndSession()

    const response = await fetch(`/api/templates/${templateId}/reviews`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ rating, review_text: reviewText }),
    })

    if (!response.ok) {
      const data = await response.json().catch(() => ({}))
      throw new Error(data.error || `Failed to add review: ${response.statusText}`)
    }

    return response.json()
  }

  static async deleteReview(templateId: string, reviewId: string): Promise<void> {
    const { session } = await SessionManager.getSecureUserAndSession()

    const response = await fetch(`/api/templates/${templateId}/reviews?reviewId=${reviewId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    })

    if (!response.ok) {
      const data = await response.json().catch(() => ({}))
      throw new Error(data.error || `Failed to delete review: ${response.statusText}`)
    }
  }
}
