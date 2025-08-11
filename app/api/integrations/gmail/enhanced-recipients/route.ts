import { NextResponse } from "next/server"
import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"
import { getDecryptedAccessToken } from "@/lib/security/encryption"

export async function POST(req: Request) {
  console.log("🔄 Enhanced Gmail recipients API called")
  
  try {
    cookies()
    const supabase = await createSupabaseRouteHandlerClient()
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    console.log("✅ Session found for user:", user.id)

    const { integrationId } = await req.json()

    if (!integrationId) {
      console.log("❌ No integration ID provided")
      return NextResponse.json({ error: "Integration ID is required" }, { status: 400 })
    }

    console.log("🔍 Looking for integration:", integrationId)

    const { data: integration, error } = await supabase
      .from("integrations")
      .select("access_token, encrypted_access_token")
      .eq("id", integrationId)
      .eq("user_id", user.id)
      .single()

    if (error || !integration) {
      console.log("❌ Integration not found:", error)
      return NextResponse.json({ error: "Integration not found" }, { status: 404 })
    }

    console.log("✅ Integration found, fetching enhanced recipients...")

    // Get access token (either directly or decrypt it)
    let accessToken = integration.access_token
    if (!accessToken && integration.encrypted_access_token) {
      accessToken = await getDecryptedAccessToken(user.id, "gmail")
    }

    if (!accessToken) {
      return NextResponse.json({ error: "No access token available" }, { status: 400 })
    }

    const enhancedRecipients = await getEnhancedEmailRecipients(accessToken)
    
    console.log("✅ Enhanced recipients fetched:", enhancedRecipients.length)
    
    return NextResponse.json(enhancedRecipients)
  } catch (error) {
    console.error("❌ Failed to load enhanced recipients:", error)
    return NextResponse.json({ error: "Failed to load recipients" }, { status: 500 })
  }
}

async function getEnhancedEmailRecipients(accessToken: string) {
  try {
    console.log("🔄 Starting enhanced email recipients fetch...")
    
    // Fetch recent recipients from sent and received emails
    const recentRecipients = await getGmailRecentRecipients(accessToken)
    console.log("✅ Fetched recent recipients:", recentRecipients.length)
    
    // Process and format recipients
    const processedRecipients = recentRecipients.map(recipient => ({
      value: recipient.email,
      label: recipient.name ? `${recipient.name} <${recipient.email}>` : recipient.email,
      email: recipient.email,
      name: recipient.name,
      frequency: recipient.frequency || 1,
      type: 'recent_recipient'
    }))
    
    // Sort by frequency (most used first)
    return processedRecipients.sort((a, b) => b.frequency - a.frequency)
  } catch (error) {
    console.error("Failed to get enhanced email recipients:", error)
    return []
  }
}

async function getGmailRecentRecipients(accessToken: string) {
  try {
    // First get message IDs from both inbox and sent folders
    const [inboxResponse, sentResponse] = await Promise.all([
      fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=50&labelIds=INBOX", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }),
      fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=50&labelIds=SENT", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      })
    ])
    
    const [inboxData, sentData] = await Promise.all([
      inboxResponse.json(),
      sentResponse.json()
    ])
    
    const inboxMessages = inboxData.messages || []
    const sentMessages = sentData.messages || []
    
    // Combine and take the most recent 100 messages
    const allMessages = [...inboxMessages, ...sentMessages]
      .sort((a, b) => parseInt(b.id) - parseInt(a.id))
      .slice(0, 100)
    
    if (allMessages.length === 0) {
      return []
    }

    // Fetch message details for each message
    const messageDetails = await Promise.all(
      allMessages.map(async (message) => {
        try {
          const response = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${message.id}?format=metadata&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Bcc&metadataHeaders=From`,
            {
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
              },
            }
          )

          if (!response.ok) return null
          
          const data = await response.json()
          return data.payload?.headers || []
        } catch {
          return null
        }
      })
    )

    // Extract email addresses and count frequency
    const emailMap = new Map()

    messageDetails.forEach((headers) => {
      if (!headers) return
      
      headers.forEach((header) => {
        if (['To', 'Cc', 'Bcc', 'From'].includes(header.name)) {
          const emailAddresses = extractEmailAddresses(header.value)
          emailAddresses.forEach(({ email, name }) => {
            const key = email.toLowerCase()
            if (emailMap.has(key)) {
              const existing = emailMap.get(key)
              existing.frequency += 1
              // Use the name if we didn't have one before
              if (!existing.name && name) {
                existing.name = name
              }
            } else {
              emailMap.set(key, { email, name, frequency: 1 })
            }
          })
        }
      })
    })

    return Array.from(emailMap.values()).sort((a, b) => b.frequency - a.frequency)
  } catch (error) {
    console.error("Failed to get Gmail recent recipients:", error)
    return []
  }
}

function extractEmailAddresses(headerValue: string): { email: string; name?: string }[] {
  if (!headerValue) return []
  
  const result: { email: string; name?: string }[] = []
  
  // Handle multiple email addresses separated by commas
  const parts = headerValue.split(',').map(part => part.trim())
  
  for (const part of parts) {
    // Match pattern: "Name" <email@example.com> or email@example.com
    const match = part.match(/(?:"?([^"]*)"?\s+)?<?([^@<\s]+@[^@>\s]+)>?/)
    
    if (match) {
      const [, name, email] = match
      result.push({
        email: email.trim(),
        name: name ? name.trim() : undefined
      })
    }
  }
  
  return result
}