import { createClient } from "@supabase/supabase-js"
import { getBaseUrl } from "@/lib/utils/getBaseUrl"

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

interface IntegrationData {
  user_id: string
  provider: string
  provider_user_id: string
  access_token: string
  refresh_token?: string
  expires_at?: string | null
  status: "connected"
  scopes: string[]
  metadata: any
}

export async function saveIntegrationToDatabase(integrationData: IntegrationData): Promise<void> {
  try {
    // Check if integration already exists
    const { data: existingIntegration } = await supabase
      .from("integrations")
      .select("id")
      .eq("user_id", integrationData.user_id)
      .eq("provider", integrationData.provider)
      .single()

    const now = new Date().toISOString()

    if (existingIntegration) {
      // Update existing integration
      const { error } = await supabase
        .from("integrations")
        .update({
          ...integrationData,
          updated_at: now,
        })
        .eq("id", existingIntegration.id)

      if (error) {
        console.error("Error updating integration:", error)
        throw error
      }
    } else {
      // Create new integration
      const { error } = await supabase.from("integrations").insert({
        ...integrationData,
        created_at: now,
        updated_at: now,
      })

      if (error) {
        console.error("Error creating integration:", error)
        throw error
      }
    }

    console.log(`Successfully saved ${integrationData.provider} integration for user ${integrationData.user_id}`)
  } catch (error) {
    console.error("Failed to save integration to database:", error)
    throw error
  }
}

export function generateSuccessRedirect(provider: string): string {
  const baseUrl = getBaseUrl()
  return `${baseUrl}/integrations?success=${provider}_connected&provider=${provider}`
}

export function generateErrorRedirect(provider: string, error: string, message?: string): string {
  const params = new URLSearchParams({
    error,
    provider,
  })

  if (message) {
    params.append("message", message)
  }

  const baseUrl = getBaseUrl()
  return `${baseUrl}/integrations?${params.toString()}`
}
