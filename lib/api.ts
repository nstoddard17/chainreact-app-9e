import { createClient } from "@supabase/supabase-js"

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

/**
 * Disconnect an integration by ID
 */
export async function disconnectIntegration(integrationId: string): Promise<ApiResponse> {
  try {
    // Get the current user's session token
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session?.access_token) {
      throw new Error("User not authenticated")
    }

    const response = await fetch(`/api/integrations/${integrationId}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
    })

    const data = await response.json()

    if (!response.ok || !data.success) {
      throw new Error(data.error || "Failed to disconnect integration")
    }

    return data
  } catch (error: any) {
    console.error("❌ Failed to disconnect integration:", error)
    return {
      success: false,
      error: error.message || "Failed to disconnect integration",
    }
  }
}

/**
 * Connect to an integration provider
 */
export async function connectIntegration(providerId: string): Promise<ApiResponse<{ authUrl: string }>> {
  try {
    const response = await fetch("/api/integrations/oauth/generate-url", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        provider: providerId,
      }),
    })

    const data = await response.json()

    if (!response.ok || !data.success) {
      throw new Error(data.error || "Failed to generate OAuth URL")
    }

    return data
  } catch (error: any) {
    console.error("❌ Failed to connect integration:", error)
    return {
      success: false,
      error: error.message || "Failed to connect integration",
    }
  }
}

/**
 * Fetch all integrations for the current user
 */
export async function fetchIntegrations(): Promise<ApiResponse<any[]>> {
  try {
    const response = await fetch("/api/integrations", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
    })

    const data = await response.json()

    if (!response.ok || !data.success) {
      throw new Error(data.error || "Failed to fetch integrations")
    }

    return data
  } catch (error: any) {
    console.error("❌ Failed to fetch integrations:", error)
    return {
      success: false,
      error: error.message || "Failed to fetch integrations",
    }
  }
}

/**
 * Refresh an integration's token
 */
export async function refreshIntegration(integrationId: string): Promise<ApiResponse> {
  try {
    const response = await fetch(`/api/integrations/${integrationId}/refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    })

    const data = await response.json()

    if (!response.ok || !data.success) {
      throw new Error(data.error || "Failed to refresh integration")
    }

    return data
  } catch (error: any) {
    console.error("❌ Failed to refresh integration:", error)
    return {
      success: false,
      error: error.message || "Failed to refresh integration",
    }
  }
}

/**
 * Refresh all tokens for the current user
 */
export async function refreshAllTokens(): Promise<ApiResponse> {
  try {
    const response = await fetch("/api/integrations/refresh-all-tokens", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    })

    const data = await response.json()

    if (!response.ok || !data.success) {
      throw new Error(data.error || "Failed to refresh tokens")
    }

    return data
  } catch (error: any) {
    console.error("❌ Failed to refresh all tokens:", error)
    return {
      success: false,
      error: error.message || "Failed to refresh all tokens",
    }
  }
}

/**
 * Fetch dynamic data from an integration
 */
export async function fetchDynamicData(provider: string, dataType: string): Promise<ApiResponse<any[]>> {
  try {
    const response = await fetch("/api/integrations/fetch-user-data", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        provider,
        dataType,
      }),
    })

    const data = await response.json()

    if (!response.ok || !data.success) {
      throw new Error(data.error || `Failed to fetch ${provider} ${dataType}`)
    }

    return data
  } catch (error: any) {
    console.error(`❌ Failed to fetch ${provider} ${dataType}:`, error)
    return {
      success: false,
      error: error.message || `Failed to fetch ${provider} ${dataType}`,
    }
  }
}

/**
 * Get integration status by provider
 */
export async function getIntegrationStatus(providerId: string): Promise<ApiResponse<{ status: string }>> {
  try {
    const integrationsResponse = await fetchIntegrations()

    if (!integrationsResponse.success || !integrationsResponse.data) {
      throw new Error("Failed to fetch integrations")
    }

    const integration = integrationsResponse.data.find((i: any) => i.provider === providerId)
    const status = integration?.status || "disconnected"

    return {
      success: true,
      data: { status },
    }
  } catch (error: any) {
    console.error(`❌ Failed to get status for ${providerId}:`, error)
    return {
      success: false,
      error: error.message || "Failed to get integration status",
    }
  }
}

/**
 * Get available integrations/providers
 */
export async function getAvailableIntegrations(): Promise<ApiResponse<any[]>> {
  try {
    const response = await fetch("/api/integrations/available", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    })

    const data = await response.json()

    if (!response.ok || !data.success) {
      throw new Error(data.error || "Failed to fetch available integrations")
    }

    return data
  } catch (error: any) {
    console.error("❌ Failed to fetch available integrations:", error)
    return {
      success: false,
      error: error.message || "Failed to fetch available integrations",
    }
  }
}
