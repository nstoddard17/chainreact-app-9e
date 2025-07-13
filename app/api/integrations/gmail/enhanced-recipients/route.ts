import { NextResponse } from "next/server"
import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { getEnhancedGoogleContacts } from "@/lib/integrations/gmail"
import { EmailCacheService } from "@/lib/services/emailCacheService"
import { cookies } from "next/headers"

export async function POST(req: Request) {
  console.log("🔄 Enhanced recipients API called")
  
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
      .select("access_token")
      .eq("id", integrationId)
      .eq("user_id", user.id)
      .single()

    if (error || !integration) {
      console.log("❌ Integration not found:", error)
      return NextResponse.json({ error: "Integration not found" }, { status: 404 })
    }

    console.log("✅ Integration found, fetching enhanced recipients...")

    const enhancedRecipients = await getEnhancedEmailRecipients(integration.access_token, integrationId)
    
    console.log("✅ Enhanced recipients fetched:", enhancedRecipients.length)
    
    return NextResponse.json(enhancedRecipients)
  } catch (error) {
    console.error("❌ Failed to load enhanced recipients:", error)
    console.error("❌ Error stack:", error instanceof Error ? error.stack : 'No stack trace')
    return NextResponse.json({ 
      error: "Failed to load enhanced recipients", 
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

async function getEnhancedEmailRecipients(accessToken: string, integrationId: string) {
  try {
    console.log("🔄 Starting enhanced email recipients fetch...")
    
    // Fetch all data sources in parallel
    console.log("🔄 Fetching data from multiple sources...")
    const [recentRecipients, googleContacts, contactGroups] = await Promise.all([
      getGmailRecentRecipients(accessToken).catch(error => {
        console.warn("⚠️ Failed to get recent recipients:", error)
        return []
      }),
      getEnhancedGoogleContacts(accessToken).catch(error => {
        console.warn("⚠️ Failed to get Google contacts:", error)
        return []
      }),
      getGmailContactGroups(accessToken).catch(error => {
        console.warn("⚠️ Failed to get contact groups:", error)
        return []
      })
    ])

    console.log("✅ Data fetched - Recent:", recentRecipients.length, "Contacts:", googleContacts.length, "Groups:", contactGroups.length)

    // Create a comprehensive contact database with alias handling
    const contactDatabase = new Map<string, any>()
    const aliasMap = new Map<string, string>() // email -> primary email

    // 1. Process Google Contacts first (most authoritative for names/aliases)
    googleContacts.forEach((contact: any) => {
      const primaryEmail = contact.email.toLowerCase()
      contactDatabase.set(primaryEmail, {
        email: contact.email,
        name: contact.name,
        photo: contact.photo,
        type: 'google_contact',
        frequency: 0,
        aliases: contact.aliases || [],
        isPrimary: true
      })

      // Map aliases to primary email
      if (contact.aliases) {
        contact.aliases.forEach((alias: string) => {
          aliasMap.set(alias.toLowerCase(), primaryEmail)
        })
      }
    })

    // 2. Process recent recipients and merge with contacts
    recentRecipients.forEach((recipient: any) => {
      const emailLower = recipient.email.toLowerCase()
      const primaryEmail = aliasMap.get(emailLower) || emailLower
      
      if (contactDatabase.has(primaryEmail)) {
        // Update existing contact with frequency data
        const existing = contactDatabase.get(primaryEmail)
        existing.frequency = recipient.frequency || 1
        existing.lastUsed = new Date().toISOString()
      } else {
        // Add new contact from recent recipients
        contactDatabase.set(primaryEmail, {
          email: recipient.email,
          name: recipient.name || recipient.email,
          type: 'recent_recipient',
          frequency: recipient.frequency || 1,
          lastUsed: new Date().toISOString(),
          aliases: [],
          isPrimary: true
        })
      }
    })

    // 3. Add contact groups as special entries
    const groupEntries = contactGroups.map((group: any) => ({
      value: `@${group.name}`,
      label: `📧 ${group.name} (${group.memberCount} members)`,
      email: `@${group.name}`,
      name: group.name,
      type: 'contact_group',
      frequency: 0,
      groupId: group.id,
      members: group.emails,
      isGroup: true
    }))

    // 4. Convert to final format and sort
    const individualContacts = Array.from(contactDatabase.values())
      .map((contact: any) => ({
        value: contact.email,
        label: contact.name !== contact.email 
          ? `${contact.name} <${contact.email}>` 
          : contact.email,
        email: contact.email,
        name: contact.name !== contact.email ? contact.name : undefined,
        type: contact.type,
        frequency: contact.frequency,
        photo: contact.photo,
        aliases: contact.aliases
      }))
      .sort((a, b) => {
        // Sort by frequency first, then by type preference, then alphabetically
        if (b.frequency !== a.frequency) {
          return b.frequency - a.frequency
        }
        
        const typeOrder = { 'google_contact': 0, 'recent_recipient': 1 }
        const aTypeOrder = typeOrder[a.type as keyof typeof typeOrder] ?? 2
        const bTypeOrder = typeOrder[b.type as keyof typeof typeOrder] ?? 2
        
        if (aTypeOrder !== bTypeOrder) {
          return aTypeOrder - bTypeOrder
        }
        
        return a.label.localeCompare(b.label)
      })

    // 5. For now, skip the email cache to isolate the issue
    console.log("⚠️ Skipping email cache for debugging - using fresh data only")
    
    // 6. Combine individual contacts and groups
    const allRecipients = [
      ...groupEntries,
      ...individualContacts
    ]

    console.log("✅ Final recipients count:", allRecipients.length)
    console.log("📊 Recipients breakdown:", {
      groups: groupEntries.length,
      individual: individualContacts.length,
      total: allRecipients.length
    })
    
    // 7. Try to initialize cache in background for future requests (don't block)
    try {
      const emailCache = new EmailCacheService(true)
      
      // Track recent recipients in cache (async, don't wait)
      const emailsToCache = recentRecipients.map(recipient => ({
        email: recipient.email,
        name: recipient.name,
        source: 'gmail',
        integrationId: integrationId,
        metadata: { frequency: recipient.frequency }
      }))
      
      // Track in background (don't await to avoid slowing down response)
      emailCache.trackMultipleEmails(emailsToCache).catch(error => 
        console.error('Failed to cache emails:', error)
      )
      console.log("✅ Background email caching initiated")
    } catch (cacheError) {
      console.warn("⚠️ Failed to initialize background caching:", cacheError)
    }
    
    return allRecipients

  } catch (error) {
    console.error("❌ Failed to get enhanced email recipients:", error)
    console.error("❌ Error details:", error instanceof Error ? error.message : error)
    throw new Error(`Failed to get enhanced email recipients: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

// Re-implement the functions locally to avoid circular dependencies
async function getGmailRecentRecipients(accessToken: string) {
  try {
    // Fetch from both SENT and INBOX to get more comprehensive data
    const [sentResponse, inboxResponse] = await Promise.all([
      fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?labelIds=SENT&maxResults=100`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }),
      fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?labelIds=INBOX&maxResults=100`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      })
    ])

    if (!sentResponse.ok || !inboxResponse.ok) {
      if (sentResponse.status === 401 || inboxResponse.status === 401) {
        throw new Error("Gmail authentication expired. Please reconnect your account.")
      }
      throw new Error(`Gmail API error: ${sentResponse.status} or ${inboxResponse.status}`)
    }

    const [sentData, inboxData] = await Promise.all([
      sentResponse.json(),
      inboxResponse.json()
    ])

    const sentMessages = sentData.messages || []
    const inboxMessages = inboxData.messages || []

    // Combine messages from both sources
    const allMessages = [...sentMessages, ...inboxMessages]

    if (allMessages.length === 0) {
      return []
    }

    const messageDetails = await Promise.all(
      allMessages.slice(0, 100).map(async (message: { id: string }) => {
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

    const emailSet = new Set<string>()
    const emailData: { email: string; name?: string; frequency: number }[] = []

    messageDetails.forEach((headers) => {
      if (!headers) return
      
      headers.forEach((header: { name: string; value: string }) => {
        if (['To', 'Cc', 'Bcc', 'From'].includes(header.name)) {
          const emailAddresses = extractEmailAddresses(header.value)
          emailAddresses.forEach(({ email, name }) => {
            if (!emailSet.has(email.toLowerCase())) {
              emailSet.add(email.toLowerCase())
              emailData.push({ email, name, frequency: 1 })
            } else {
              const existing = emailData.find(e => e.email.toLowerCase() === email.toLowerCase())
              if (existing) existing.frequency++
            }
          })
        }
      })
    })

    return emailData.sort((a, b) => b.frequency - a.frequency)

  } catch (error) {
    console.error("Failed to get Gmail recent recipients:", error)
    return []
  }
}

async function getGmailContactGroups(accessToken: string) {
  try {
    const groupsResponse = await fetch(
      `https://people.googleapis.com/v1/contactGroups?pageSize=100`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    )

    if (!groupsResponse.ok) {
      console.warn("Failed to fetch contact groups")
      return []
    }

    const groupsData = await groupsResponse.json()
    const contactGroups = groupsData.contactGroups || []

    const userGroups = contactGroups.filter((group: any) => 
      group.groupType === 'USER_CONTACT_GROUP' && group.memberCount > 0
    )

    // For performance, just return group metadata without fetching all members
    // Members will be fetched when the group is actually selected
    return userGroups.map((group: any) => ({
      id: group.resourceName,
      name: group.name,
      memberCount: group.memberCount,
      emails: [], // Will be populated on demand
      type: 'contact_group'
    }))

  } catch (error) {
    console.warn("Failed to get contact groups:", error)
    return []
  }
}

function extractEmailAddresses(headerValue: string): { email: string; name?: string }[] {
  const emails: { email: string; name?: string }[] = []
  
  const parts = headerValue.split(',').map(part => part.trim())
  
  parts.forEach(part => {
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