import { createClient } from "@supabase/supabase-js"

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
  granted_scopes?: string[]
  metadata: any
}

export async function saveIntegrationToDatabase(integrationData: IntegrationData): Promise<string> {
  try {
    // Check if integration already exists
    const { data: existingIntegration } = await supabase
      .from("integrations")
      .select("id")
      .eq("user_id", integrationData.user_id)
      .eq("provider", integrationData.provider)
      .single()

    const now = new Date().toISOString()

    let integrationId
    if (existingIntegration) {
      // Update existing integration
      const { data, error } = await supabase
        .from("integrations")
        .update({
          ...integrationData,
          updated_at: now,
        })
        .eq("id", existingIntegration.id)
        .select("id")
        .single()

      if (error) {
        console.error("Error updating integration:", error)
        throw error
      }
      integrationId = data.id
    } else {
      // Create new integration
      const { data, error } = await supabase
        .from("integrations")
        .insert({
          ...integrationData,
          created_at: now,
          updated_at: now,
        })
        .select("id")
        .single()

      if (error) {
        console.error("Error creating integration:", error)
        throw error
      }
      integrationId = data.id
    }

    console.log(`Successfully saved ${integrationData.provider} integration for user ${integrationData.user_id}`)
    return integrationId
  } catch (error) {
    console.error("Failed to save integration to database:", error)
    throw error
  }
}

export function generateSuccessRedirect(provider: string): string {
  return `https://chainreact.app/integrations?success=${provider}_connected&provider=${provider}`
}

export function generateErrorRedirect(provider: string, error: string, message?: string): string {
  const params = new URLSearchParams({
    error,
    provider,
  })

  if (message) {
    params.append("message", message)
  }

  return `https://chainreact.app/integrations?${params.toString()}`
}
