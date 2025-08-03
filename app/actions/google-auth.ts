"use server"

import { createServerActionClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"
import { getBaseUrl } from "@/lib/utils/getBaseUrl"
import crypto from "crypto"

export async function initiateGoogleSignIn() {
  try {
    const supabase = createServerActionClient({ cookies })
    
    // Check if user is already authenticated
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      throw new Error("Not authenticated")
    }

    // Generate secure state parameter
    const state = crypto.randomBytes(32).toString('hex')
    
    // Store state in database for verification
    const { error: stateError } = await supabase
      .from('pkce_flow')
      .insert({ 
        state, 
        code_verifier: crypto.randomBytes(32).toString("hex"),
        provider: "google-signin" 
      })

    if (stateError) {
      throw new Error(`Failed to store OAuth state: ${stateError.message}`)
    }

    // Get Google OAuth credentials
    const clientId = process.env.GOOGLE_CLIENT_ID
    if (!clientId) {
      throw new Error("Google client ID not configured")
    }

    const baseUrl = getBaseUrl()
    const redirectUri = `${baseUrl}/api/auth/callback`

    // Build OAuth URL
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'email profile',
      state: state,
      access_type: 'offline',
      prompt: 'consent',
    })

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`

    return {
      success: true,
      authUrl,
    }
  } catch (error: any) {
    console.error("Google sign-in initiation error:", error)
    return {
      success: false,
      error: error.message || "Failed to initiate Google sign-in",
    }
  }
} 