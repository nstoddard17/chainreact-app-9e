import { NextResponse } from "next/server"
import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"

export async function POST(req: Request) {
  cookies()
  const supabase = await createSupabaseRouteHandlerClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { integrationId } = await req.json()

  if (!integrationId) {
    return NextResponse.json({ error: "Integration ID is required" }, { status: 400 })
  }

  try {
    const { data: integration, error } = await supabase
      .from("integrations")
      .select("access_token")
      .eq("id", integrationId)
      .eq("user_id", session.user.id)
      .single()

    if (error || !integration) {
      return NextResponse.json({ error: "Integration not found" }, { status: 404 })
    }

    const recipients = await getGmailRecentRecipients(integration.access_token)
    return NextResponse.json(recipients)
  } catch (error) {
    console.error("Failed to load recent recipients:", error)
    return NextResponse.json({ error: "Failed to load recent recipients" }, { status: 500 })
  }
}

async function getGmailRecentRecipients(accessToken: string) {
  try {
    // Get recent sent messages (last 100)
    const messagesResponse = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?labelIds=SENT&maxResults=100`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    )

    if (!messagesResponse.ok) {
      if (messagesResponse.status === 401) {
        throw new Error("Gmail authentication expired. Please reconnect your account.")
      }
      throw new Error(`Gmail API error: ${messagesResponse.status}`)
    }

    const messagesData = await messagesResponse.json()
    const messages = messagesData.messages || []

    if (messages.length === 0) {
      return []
    }

    // Get detailed information for each message
    const messageDetails = await Promise.all(
      messages.slice(0, 50).map(async (message: { id: string }) => {
        try {
          const response = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${message.id}?format=metadata&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Bcc`,
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

    // Extract unique email addresses from To, Cc, Bcc headers
    const emailSet = new Set<string>()
    const emailData: { email: string; name?: string; frequency: number }[] = []

    messageDetails.forEach((headers) => {
      if (!headers) return
      
      headers.forEach((header: { name: string; value: string }) => {
        if (['To', 'Cc', 'Bcc'].includes(header.name)) {
          const emailAddresses = extractEmailAddresses(header.value)
          emailAddresses.forEach(({ email, name }) => {
            if (!emailSet.has(email.toLowerCase())) {
              emailSet.add(email.toLowerCase())
              emailData.push({ email, name, frequency: 1 })
            } else {
              // Increment frequency for recurring emails
              const existing = emailData.find(e => e.email.toLowerCase() === email.toLowerCase())
              if (existing) existing.frequency++
            }
          })
        }
      })
    })

    // Sort by frequency (most used first) and return formatted results
    return emailData
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 20) // Return top 20 recent recipients
      .map(({ email, name }) => ({
        value: email,
        label: name ? `${name} <${email}>` : email,
        email,
        name
      }))

  } catch (error) {
    console.error("Failed to get Gmail recent recipients:", error)
    throw new Error("Failed to get Gmail recent recipients")
  }
}

function extractEmailAddresses(headerValue: string): { email: string; name?: string }[] {
  const emails: { email: string; name?: string }[] = []
  
  // Split by comma and clean up each email
  const parts = headerValue.split(',').map(part => part.trim())
  
  parts.forEach(part => {
    // Match patterns like "Name <email@domain.com>" or just "email@domain.com"
    const nameEmailMatch = part.match(/^(.+?)\s*<([^>]+)>$/)
    const emailOnlyMatch = part.match(/^([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})$/)
    
    if (nameEmailMatch) {
      const name = nameEmailMatch[1].replace(/['"]/g, '').trim()
      const email = nameEmailMatch[2].trim()
      if (isValidEmail(email)) {
        emails.push({ email, name })
      }
    } else if (emailOnlyMatch) {
      const email = emailOnlyMatch[1].trim()
      if (isValidEmail(email)) {
        emails.push({ email })
      }
    }
  })
  
  return emails
}

function isValidEmail(email: string): boolean {
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
  return emailRegex.test(email)
} 