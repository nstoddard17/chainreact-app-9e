import { createClient } from "@supabase/supabase-js"
import { getBaseUrl } from "@/lib/utils/getBaseUrl"

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function saveIntegrationToDatabase(integrationData: any): Promise<string> {
  try {
    console.log("Saving integration to database:", {
      provider: integrationData.provider,
      userId: integrationData.user_id,
      hasAccessToken: !!integrationData.access_token,
      hasRefreshToken: !!integrationData.refresh_token,
      scopes: integrationData.scopes,
    })

    // Check if integration already exists
    const { data: existingIntegration, error: findError } = await supabase
      .from("integrations")
      .select("id")
      .eq("user_id", integrationData.user_id)
      .eq("provider", integrationData.provider)
      .eq("status", "connected")
      .maybeSingle()

    if (findError) {
      console.error("Error checking for existing integration:", findError)
      throw new Error(`Database error: ${findError.message}`)
    }

    let integrationId: string

    if (existingIntegration) {
      console.log("Updating existing integration:", existingIntegration.id)

      // Update existing integration
      const { error: updateError } = await supabase
        .from("integrations")
        .update({
          provider_user_id: integrationData.provider_user_id,
          access_token: integrationData.access_token,
          refresh_token: integrationData.refresh_token,
          expires_at: integrationData.expires_at,
          status: integrationData.status,
          scopes: integrationData.scopes,
          granted_scopes: integrationData.granted_scopes,
          metadata: integrationData.metadata,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingIntegration.id)

      if (updateError) {
        console.error("Error updating integration:", updateError)
        throw new Error(`Failed to update integration: ${updateError.message}`)
      }

      integrationId = existingIntegration.id
    } else {
      console.log("Creating new integration")

      // Create new integration
      const now = new Date().toISOString()
      const { data: newIntegration, error: insertError } = await supabase
        .from("integrations")
        .insert({
          ...integrationData,
          created_at: now,
          updated_at: now,
        })
        .select("id")
        .single()

      if (insertError) {
        console.error("Error inserting integration:", insertError)
        throw new Error(`Failed to create integration: ${insertError.message}`)
      }

      if (!newIntegration) {
        throw new Error("Failed to create integration: No data returned")
      }

      integrationId = newIntegration.id
    }

    console.log("Integration saved successfully with ID:", integrationId)
    return integrationId
  } catch (error) {
    console.error("Error in saveIntegrationToDatabase:", error)
    throw error
  }
}

export function generateSuccessRedirect(provider: string): string {
  return `${getBaseUrl()}/integrations?success=${provider}_connected&provider=${provider}`
}
