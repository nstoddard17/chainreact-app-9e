import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import OpenAI from "openai"

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

interface Integration {
  id: string
  provider: string
  status: string
  access_token?: string
  refresh_token?: string
  user_id: string
  base_url?: string
}

interface Message {
  role: "user" | "assistant"
  content: string
}

// Simple test endpoint
export async function GET() {
  return NextResponse.json({ 
    status: "ok", 
    message: "AI Assistant API is running",
    openaiConfigured: !!process.env.OPENAI_API_KEY
  })
}

export async function POST(request: NextRequest) {
  // Create a flag to check if connection was closed
  let connectionClosed = false;
  
  // Listen for connection close
  request.signal.addEventListener('abort', () => {
    connectionClosed = true;
    console.log("Client connection aborted");
  });

  try {
    // Check if OpenAI API key is configured
    if (!process.env.OPENAI_API_KEY) {
      console.error("OpenAI API key is not configured")
      return NextResponse.json({ 
        error: "Configuration error",
        content: "AI assistant is not properly configured. Please contact support."
      }, { status: 500 })
    }

    const { message } = await request.json()

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ 
        error: "Invalid message format",
        content: "Please provide a valid message."
      }, { status: 400 })
    }

    console.log("Processing message:", message.substring(0, 100) + "...")

    // Early exit if connection closed
    if (connectionClosed) {
      console.log("Connection closed early, aborting processing");
      return new Response(null, { status: 499 }); // Client Closed Request
    }

    // Get user session
    const supabaseAdmin = createAdminClient()
    const authHeader = request.headers.get("authorization")
    
    if (!authHeader) {
      return NextResponse.json({ 
        error: "Unauthorized",
        content: "Please log in to use the AI assistant."
      }, { status: 401 })
    }

    const token = authHeader.replace("Bearer ", "")
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)

    if (authError || !user) {
      return NextResponse.json({ 
        error: "Unauthorized",
        content: "Your session has expired. Please refresh the page and try again."
      }, { status: 401 })
    }

    console.log("User authenticated:", user.id)

    // Get user's integrations from database with timeout
    const integrationsPromise = supabaseAdmin
      .from("integrations")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "connected")

    const integrationsTimeout = new Promise((_, reject) => 
      setTimeout(() => reject(new Error("Database timeout")), 10000)
    )

    const { data: integrations, error: integrationsError } = await Promise.race([
      integrationsPromise,
      integrationsTimeout
    ]) as any

    if (integrationsError) {
      console.error("Error fetching integrations:", integrationsError)
      return NextResponse.json({ 
        error: "Database error",
        content: "Failed to fetch your integrations. Please try again."
      }, { status: 500 })
    }

    console.log("User integrations:", integrations?.map((i: Integration) => ({ provider: i.provider, hasToken: !!i.access_token })))

    // Analyze the user's message to determine intent with timeout
    console.log("Starting intent analysis...")
    const intentPromise = analyzeIntent(message, integrations || [])
    const intentTimeout = new Promise((_, reject) => 
      setTimeout(() => reject(new Error("Intent analysis timeout")), 15000)
    )

    let intent
    try {
      intent = await Promise.race([intentPromise, intentTimeout]) as any
      console.log("Intent analysis completed:", intent)
    } catch (intentError) {
      console.error("Intent analysis failed:", intentError)
      // Fallback to general response
      intent = { intent: "general", action: "chat", parameters: {} }
    }
    
    // Execute the appropriate action based on intent with timeout
    console.log("Starting action execution...")
    const actionPromise = executeAction(intent, integrations || [], user.id, supabaseAdmin)
    const actionTimeout = new Promise((_, reject) => 
      setTimeout(() => reject(new Error("Action execution timeout")), 25000)
    )

    let result
    try {
      result = await Promise.race([actionPromise, actionTimeout]) as any
      console.log("Action execution completed")
    } catch (actionError) {
      console.error("Action execution failed:", actionError)
      // Fallback response
      result = {
        content: "I'm having trouble processing your request right now. Please try again in a moment.",
        metadata: {}
      }
    }

    if (!result || !result.content) {
      // Ultimate fallback
      result = {
        content: "I can help you with your calendars, emails, files, social media, CRM, e-commerce, developer tools, and productivity apps. What would you like to know or do?",
        metadata: {}
      }
    }

    console.log("Sending response to user")
    return NextResponse.json(result)
  } catch (error) {
    console.error("AI Assistant error:", error)
    
    let errorMessage = "Internal server error"
    let userMessage = "I encountered an unexpected error. Please try again."
    
    if (error instanceof Error) {
      if (error.message.includes("timeout")) {
        errorMessage = error.message
        userMessage = "The request took too long to process. Please try again with a simpler request."
      } else if (error.message.includes("Unauthorized")) {
        errorMessage = "Authentication error"
        userMessage = "Please log in to use the AI assistant."
      } else if (error.message.includes("API key")) {
        errorMessage = "Configuration error"
        userMessage = "AI assistant is not properly configured. Please contact support."
      }
    }
    
    return NextResponse.json(
      { 
        error: errorMessage,
        content: userMessage
      },
      { status: 500 }
    )
  }
}

async function analyzeIntent(message: string, integrations: Integration[]) {
  const systemPrompt = `You are an AI assistant that helps users interact with their connected integrations. 
  
Available integrations: ${integrations.map(i => i.provider).join(", ")}

Analyze the user's message and determine their intent. Return a JSON object with:
- intent: "calendar_query", "calendar_action", "email_query", "email_action", "file_query", "file_action", "social_query", "social_action", "crm_query", "crm_action", "ecommerce_query", "ecommerce_action", "developer_query", "developer_action", "productivity_query", "productivity_action", "communication_query", "communication_action", "general"
- action: specific action to take
- parameters: any relevant parameters from the message
- requiresConfirmation: boolean (true for destructive actions)
- clarification: any questions needed if multiple items match
- specifiedIntegration: the specific integration mentioned in the message (e.g., "mailchimp", "hubspot", "github")

IMPORTANT: If the user specifies a particular integration (e.g., "create a Mailchimp campaign"), use that specific integration. Do not suggest alternatives unless the user asks for them.

Examples:
- "What do I have planned this week?" → calendar_query, get_events, {timeframe: "week"}
- "Cancel the test appointment" → calendar_action, cancel_event, {search: "test"}, requiresConfirmation: true
- "Send an email to john@example.com" → email_action, send_email, {to: "john@example.com"}, requiresConfirmation: true
- "What's in my inbox?" → email_query, get_emails, {folder: "inbox"}
- "Find my presentation document" → file_query, search_files, {query: "presentation"}
- "Share the budget spreadsheet with the team" → file_action, share_file, {file: "budget", action: "share"}, requiresConfirmation: true
- "Post to LinkedIn about our new product" → social_action, post_update, {platform: "linkedin", content: "new product"}, requiresConfirmation: true, specifiedIntegration: "linkedin"
- "Show me my recent tweets" → social_query, get_posts, {platform: "twitter"}, specifiedIntegration: "twitter"
- "Create a new contact in HubSpot" → crm_action, create_contact, {platform: "hubspot"}, requiresConfirmation: true, specifiedIntegration: "hubspot"
- "What are my recent sales?" → crm_query, get_sales, {platform: "hubspot"}, specifiedIntegration: "hubspot"
- "Show me my Shopify orders" → ecommerce_query, get_orders, {platform: "shopify"}, specifiedIntegration: "shopify"
- "Create a new GitHub issue" → developer_action, create_issue, {platform: "github"}, requiresConfirmation: true, specifiedIntegration: "github"
- "What's in my Notion workspace?" → productivity_query, get_content, {platform: "notion"}, specifiedIntegration: "notion"
- "Send a message to the team on Slack" → communication_action, send_message, {platform: "slack"}, requiresConfirmation: true, specifiedIntegration: "slack"
- "Show me my Discord servers" → communication_query, get_servers, {platform: "discord"}, specifiedIntegration: "discord"
- "Create a new Trello card" → productivity_action, create_card, {platform: "trello"}, requiresConfirmation: true, specifiedIntegration: "trello"
- "What's in my Airtable base?" → productivity_query, get_records, {platform: "airtable"}, specifiedIntegration: "airtable"
- "Show me my YouTube videos" → social_query, get_videos, {platform: "youtube"}, specifiedIntegration: "youtube"
- "Post to Instagram" → social_action, post_photo, {platform: "instagram"}, requiresConfirmation: true, specifiedIntegration: "instagram"
- "Create a new GitHub repository" → developer_action, create_repo, {platform: "github"}, requiresConfirmation: true, specifiedIntegration: "github"
- "Show me my GitLab projects" → developer_query, get_projects, {platform: "gitlab"}, specifiedIntegration: "gitlab"
- "What's in my OneDrive?" → file_query, get_files, {platform: "onedrive"}, specifiedIntegration: "onedrive"
- "Upload to Dropbox" → file_action, upload_file, {platform: "dropbox"}, requiresConfirmation: true, specifiedIntegration: "dropbox"
- "Show me my Box files" → file_query, get_files, {platform: "box"}, specifiedIntegration: "box"
- "Create a new Mailchimp campaign" → communication_action, create_campaign, {platform: "mailchimp"}, requiresConfirmation: true, specifiedIntegration: "mailchimp"
- "Show me my Stripe payments" → ecommerce_query, get_payments, {platform: "stripe"}, specifiedIntegration: "stripe"
- "Create a PayPal invoice" → ecommerce_action, create_invoice, {platform: "paypal"}, requiresConfirmation: true, specifiedIntegration: "paypal"
- "Show me my Gumroad sales" → ecommerce_query, get_sales, {platform: "gumroad"}, specifiedIntegration: "gumroad"
- "Create a ManyChat automation" → communication_action, create_automation, {platform: "manychat"}, requiresConfirmation: true, specifiedIntegration: "manychat"
- "Show me my beehiiv subscribers" → communication_query, get_subscribers, {platform: "beehiiv"}, specifiedIntegration: "beehiiv"
- "Create a OneNote page" → productivity_action, create_page, {platform: "microsoft-onenote"}, requiresConfirmation: true, specifiedIntegration: "microsoft-onenote"
- "Show me my Kit products" → ecommerce_query, get_products, {platform: "kit"}, specifiedIntegration: "kit"
- "Create a Blackbaud donor record" → crm_action, create_donor, {platform: "blackbaud"}, requiresConfirmation: true, specifiedIntegration: "blackbaud"

User message: "${message}"`

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 8000) // Reduced to 8 seconds

    console.log("Making OpenAI API call...")
    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [{ role: "system", content: systemPrompt }],
      temperature: 0.1,
      max_tokens: 500, // Limit response length
    }, {
      signal: controller.signal
    })

    clearTimeout(timeoutId)
    console.log("OpenAI API call completed")

    const content = response.choices[0].message.content
    if (!content) {
      throw new Error("No response from OpenAI")
    }

    try {
      return JSON.parse(content)
    } catch (parseError) {
      console.error("Failed to parse OpenAI response:", parseError)
      console.error("Raw response:", content)
      return { intent: "general", action: "chat", parameters: {} }
    }
  } catch (error) {
    console.error("OpenAI API error:", error)
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error("OpenAI request timed out")
    } else if (error instanceof Error && error.message.includes('401')) {
      throw new Error("OpenAI API key is invalid")
    } else if (error instanceof Error && error.message.includes('429')) {
      throw new Error("OpenAI rate limit exceeded")
    }
    throw new Error("Failed to analyze intent")
  }
}

async function executeAction(intent: any, integrations: Integration[], userId: string, supabaseAdmin: any) {
  // Check if a specific integration was requested but not connected
  if (intent.specifiedIntegration) {
    const requestedIntegration = integrations.find(i => i.provider === intent.specifiedIntegration)
    if (!requestedIntegration) {
      return {
        content: `I see you want to use ${intent.specifiedIntegration}, but it's not currently connected. You can connect it by visiting the [Integrations page](/integrations) and clicking "Connect" next to ${intent.specifiedIntegration}.`,
        metadata: {
          type: "integration_not_connected",
          integration: intent.specifiedIntegration,
          action: intent.action
        }
      }
    }
  }

  switch (intent.intent) {
    case "calendar_query":
      return await handleCalendarQuery(intent, integrations, userId, supabaseAdmin)
    case "calendar_action":
      return await handleCalendarAction(intent, integrations, userId, supabaseAdmin)
    case "email_query":
      return await handleEmailQuery(intent, integrations, userId, supabaseAdmin)
    case "email_action":
      return await handleEmailAction(intent, integrations, userId, supabaseAdmin)
    case "file_query":
      return await handleFileQuery(intent, integrations, userId, supabaseAdmin)
    case "file_action":
      return await handleFileAction(intent, integrations, userId, supabaseAdmin)
    case "social_query":
      return await handleSocialQuery(intent, integrations, userId, supabaseAdmin)
    case "social_action":
      return await handleSocialAction(intent, integrations, userId, supabaseAdmin)
    case "crm_query":
      return await handleCRMQuery(intent, integrations, userId, supabaseAdmin)
    case "crm_action":
      return await handleCRMAction(intent, integrations, userId, supabaseAdmin)
    case "ecommerce_query":
      return await handleEcommerceQuery(intent, integrations, userId, supabaseAdmin)
    case "ecommerce_action":
      return await handleEcommerceAction(intent, integrations, userId, supabaseAdmin)
    case "developer_query":
      return await handleDeveloperQuery(intent, integrations, userId, supabaseAdmin)
    case "developer_action":
      return await handleDeveloperAction(intent, integrations, userId, supabaseAdmin)
    case "productivity_query":
      return await handleProductivityQuery(intent, integrations, userId, supabaseAdmin)
    case "productivity_action":
      return await handleProductivityAction(intent, integrations, userId, supabaseAdmin)
    case "communication_query":
      return await handleCommunicationQuery(intent, integrations, userId, supabaseAdmin)
    case "communication_action":
      return await handleCommunicationAction(intent, integrations, userId, supabaseAdmin)
    default:
      return {
        content: "I can help you with your calendars, emails, files, social media, CRM, e-commerce, developer tools, and productivity apps. What would you like to know or do?",
        metadata: {}
      }
  }
}

async function handleCalendarQuery(intent: any, integrations: Integration[], userId: string, supabaseAdmin: any) {
  const calendarIntegrations = integrations.filter(i => i.provider === "google-calendar")
  
  console.log("Calendar query - found integrations:", calendarIntegrations.length)
  console.log("Calendar integrations:", calendarIntegrations.map(i => ({ id: i.id, hasToken: !!i.access_token })))
  
  if (calendarIntegrations.length === 0) {
    return {
      content: "You don't have any calendar integrations connected. Please connect a Google Calendar to use this feature. You can do this by visiting the [Integrations page](/integrations).",
      metadata: {}
    }
  }

  try {
    const events = []
    
    for (const integration of calendarIntegrations) {
      console.log("Processing calendar integration:", integration.id)
      
      // First, get the list of calendars
      const calendarsUrl = new URL("https://www.googleapis.com/calendar/v3/users/me/calendarList")
      const calendarsResponse = await fetch(calendarsUrl.toString(), {
        headers: {
          Authorization: `Bearer ${integration.access_token}`,
        },
      })

      if (!calendarsResponse.ok) {
        console.error("Failed to fetch calendars:", await calendarsResponse.text())
        continue
      }

      const calendarsData = await calendarsResponse.json()
      const calendars = calendarsData.items || []
      
      console.log("Found calendars:", calendars.length)

      // Determine time range based on user query
      let timeMin = new Date()
      let timeMax = new Date()
      
      if (intent.parameters.timeframe === "week") {
        timeMax = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      } else if (intent.parameters.timeframe === "month") {
        timeMax = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      } else if (intent.parameters.timeframe === "today") {
        timeMin = new Date(new Date().setHours(0, 0, 0, 0))
        timeMax = new Date(new Date().setHours(23, 59, 59, 999))
      } else {
        // Default to next 7 days
        timeMax = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }

      console.log("Time range:", { timeMin, timeMax })

      // Get events from each calendar
      for (const calendar of calendars) {
        console.log("Fetching events from calendar:", calendar.summary || calendar.id)
        
        const eventsUrl = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendar.id)}/events`)
        eventsUrl.searchParams.set("timeMin", timeMin.toISOString())
        eventsUrl.searchParams.set("timeMax", timeMax.toISOString())
        eventsUrl.searchParams.set("singleEvents", "true")
        eventsUrl.searchParams.set("orderBy", "startTime")

        const eventsResponse = await fetch(eventsUrl.toString(), {
          headers: {
            Authorization: `Bearer ${integration.access_token}`,
          },
        })

        if (eventsResponse.ok) {
          const eventsData = await eventsResponse.json()
          const calendarEvents = eventsData.items || []
          console.log(`Found ${calendarEvents.length} events in calendar ${calendar.summary || calendar.id}`)
          
          events.push(...calendarEvents.map((event: any) => ({
            ...event,
            calendar: calendar.summary || calendar.id,
          })))
        } else {
          console.error(`Failed to fetch events from calendar ${calendar.id}:`, await eventsResponse.text())
        }
      }
    }

    console.log("Total events found:", events.length)

    if (events.length === 0) {
      const timeframe = intent.parameters.timeframe || "this week"
      return {
        content: `You don't have any events scheduled for ${timeframe}.`,
        metadata: { type: "calendar", data: [] }
      }
    }

    // Format events for the visual calendar view
    const formattedEvents = events.map((event: any) => {
      const start = new Date(event.start.dateTime || event.start.date)
      const end = new Date(event.end.dateTime || event.end.date)
      return {
        title: event.summary || "Untitled Event",
        start: start.toISOString(),
        end: end.toISOString(),
        calendar: event.calendar,
        id: event.id,
        description: event.description || "",
        location: event.location || "",
        // Add formatted time strings for display
        startTime: start.toLocaleTimeString('en-US', { 
          hour: 'numeric', 
          minute: '2-digit',
          hour12: true 
        }),
        endTime: end.toLocaleTimeString('en-US', { 
          hour: 'numeric', 
          minute: '2-digit',
          hour12: true 
        }),
        // Add date info
        date: start.toLocaleDateString('en-US', { 
          weekday: 'long', 
          month: 'long', 
          day: 'numeric' 
        }),
        // Check if it's an all-day event
        isAllDay: !event.start.dateTime
      }
    })

    const timeframe = intent.parameters.timeframe || "this week"
    return {
      content: `Here are your upcoming events for ${timeframe}:`,
      metadata: { type: "calendar", data: formattedEvents }
    }
  } catch (error) {
    console.error("Calendar query error:", error)
    return {
      content: "Sorry, I couldn't fetch your calendar events. Please try again.",
      metadata: {}
    }
  }
}

async function handleCalendarAction(intent: any, integrations: Integration[], userId: string, supabaseAdmin: any) {
  if (intent.action === "cancel_event") {
    const calendarIntegrations = integrations.filter(i => i.provider === "google-calendar")
    
    if (calendarIntegrations.length === 0) {
      return {
        content: "You don't have any calendar integrations connected.",
        metadata: {}
      }
    }

    // For now, return a confirmation request
    // In a real implementation, you'd search for matching events
    return {
      content: "I found a matching event. Are you sure you want to cancel it?",
      requiresConfirmation: true,
      confirmationId: `cancel_${Date.now()}`,
      action: "Cancel Calendar Event",
      description: `Cancel the event: ${intent.parameters.search}`,
      data: {
        type: "calendar_cancel",
        search: intent.parameters.search,
        integrationId: calendarIntegrations[0].id,
      }
    }
  }

  return {
    content: "I'm not sure how to handle that calendar action yet.",
    metadata: {}
  }
}

async function handleEmailQuery(intent: any, integrations: Integration[], userId: string, supabaseAdmin: any) {
  const emailIntegrations = integrations.filter(i => i.provider === "gmail" || i.provider === "microsoft-outlook")
  
  if (emailIntegrations.length === 0) {
    return {
      content: "You don't have any email integrations connected. Please connect Gmail or Microsoft Outlook to use this feature. You can do this by visiting the [Integrations page](/integrations).",
      metadata: {}
    }
  }

  // If a specific integration was requested, use only that one
  const integrationsToUse = intent.specifiedIntegration 
    ? emailIntegrations.filter(i => i.provider === intent.specifiedIntegration)
    : emailIntegrations

  if (integrationsToUse.length === 0) {
    return {
      content: `I see you want to use ${intent.specifiedIntegration}, but it's not currently connected. You can connect it by visiting the [Integrations page](/integrations) and clicking "Connect" next to ${intent.specifiedIntegration}.`,
      metadata: {}
    }
  }

  try {
    const emails = []
    
    for (const integration of integrationsToUse) {
      if (integration.provider === "gmail") {
        const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages")
        url.searchParams.set("maxResults", "10")
        url.searchParams.set("labelIds", "INBOX")
        url.searchParams.set("q", "is:unread")

        const response = await fetch(url.toString(), {
          headers: {
            Authorization: `Bearer ${integration.access_token}`,
          },
        })

        if (response.ok) {
          const data = await response.json()
          emails.push(...data.messages.map((message: any) => ({
            ...message,
            provider: "Gmail",
          })))
        }
      }
      // Add Microsoft Outlook support here when implemented
    }

    if (emails.length === 0) {
      return {
        content: "You don't have any unread emails in your inbox.",
        metadata: { type: "email", data: [] }
      }
    }

    const integrationName = integrationsToUse[0].provider === "gmail" ? "Gmail" : "Microsoft Outlook"
    return {
      content: `You have ${emails.length} unread emails in your ${integrationName} inbox. I can help you read, reply, or manage them.`,
      metadata: { type: "email", data: emails }
    }
  } catch (error) {
    console.error("Email query error:", error)
    return {
      content: "Sorry, I couldn't fetch your emails. Please try again.",
      metadata: {}
    }
  }
}

async function handleEmailAction(intent: any, integrations: Integration[], userId: string, supabaseAdmin: any) {
  return {
    content: "Email action functionality is coming soon!",
    metadata: {}
  }
}

async function handleFileQuery(intent: any, integrations: Integration[], userId: string, supabaseAdmin: any) {
  const fileIntegrations = integrations.filter(i => i.provider === "google-drive" || i.provider === "onedrive" || i.provider === "dropbox" || i.provider === "box")
  
  if (fileIntegrations.length === 0) {
    return {
      content: "You don't have any file storage integrations connected. Please connect Google Drive, OneDrive, Dropbox, or Box to use this feature. You can do this by visiting the [Integrations page](/integrations).",
      metadata: {}
    }
  }

  // If a specific integration was requested, use only that one
  const integrationsToUse = intent.specifiedIntegration 
    ? fileIntegrations.filter(i => i.provider === intent.specifiedIntegration)
    : fileIntegrations

  if (integrationsToUse.length === 0) {
    return {
      content: `I see you want to use ${intent.specifiedIntegration}, but it's not currently connected. You can connect it by visiting the [Integrations page](/integrations) and clicking "Connect" next to ${intent.specifiedIntegration}.`,
      metadata: {}
    }
  }

  try {
    const files = []
    const searchQuery = intent.parameters.query || "document"
    
    for (const integration of integrationsToUse) {
      if (integration.provider === "google-drive") {
        const url = new URL("https://www.googleapis.com/drive/v3/files")
        url.searchParams.set("q", `name contains '${searchQuery}'`)
        url.searchParams.set("pageSize", "10")
        url.searchParams.set("fields", "files(id,name,mimeType,modifiedTime,size)")

        const response = await fetch(url.toString(), {
          headers: {
            Authorization: `Bearer ${integration.access_token}`,
          },
        })

        if (response.ok) {
          const data = await response.json()
          files.push(...data.files.map((file: any) => ({
            ...file,
            provider: "Google Drive",
          })))
        }
      }
      // Add other file storage providers here when implemented
    }

    if (files.length === 0) {
      return {
        content: `I couldn't find any files matching "${searchQuery}" in your connected storage accounts.`,
        metadata: { type: "file", data: [] }
      }
    }

    const fileList = files.map((file: any) => ({
      name: file.name,
      type: file.mimeType,
      modified: file.modifiedTime,
      size: file.size,
      provider: file.provider,
      id: file.id,
    }))

    const integrationName = integrationsToUse[0].provider === "google-drive" ? "Google Drive" : 
                           integrationsToUse[0].provider === "onedrive" ? "OneDrive" :
                           integrationsToUse[0].provider === "dropbox" ? "Dropbox" : "Box"

    return {
      content: `I found ${files.length} files matching "${searchQuery}" in your ${integrationName}:\\n\\n${fileList.map(f => `• ${f.name} (${f.provider})`).join("\\n")}`,
      metadata: { type: "file", data: fileList }
    }
  } catch (error) {
    console.error("File query error:", error)
    return {
      content: "Sorry, I couldn't search your files. Please try again.",
      metadata: {}
    }
  }
}

async function handleFileAction(intent: any, integrations: Integration[], userId: string, supabaseAdmin: any) {
  return {
    content: "File action functionality is coming soon!",
    metadata: {}
  }
}

async function handleSocialQuery(intent: any, integrations: Integration[], userId: string, supabaseAdmin: any) {
  const socialIntegrations = integrations.filter(i => 
    ["twitter", "facebook", "instagram", "linkedin", "tiktok", "youtube"].includes(i.provider)
  )
  
  if (socialIntegrations.length === 0) {
    return {
      content: "You don't have any social media integrations connected. Please connect Twitter, Facebook, Instagram, LinkedIn, TikTok, or YouTube to use this feature. You can do this by visiting the [Integrations page](/integrations).",
      metadata: {}
    }
  }

  // If a specific integration was requested, use only that one
  const integrationsToUse = intent.specifiedIntegration 
    ? socialIntegrations.filter(i => i.provider === intent.specifiedIntegration)
    : socialIntegrations

  if (integrationsToUse.length === 0) {
    return {
      content: `I see you want to use ${intent.specifiedIntegration}, but it's not currently connected. You can connect it by visiting the [Integrations page](/integrations) and clicking "Connect" next to ${intent.specifiedIntegration}.`,
      metadata: {}
    }
  }

  try {
    const posts = []
    const platform = intent.parameters.platform || integrationsToUse[0].provider
    
    for (const integration of integrationsToUse) {
      if (integration.provider === platform) {
        if (platform === "twitter") {
          // Twitter API v2 endpoint for user tweets
          const url = new URL("https://api.twitter.com/2/users/me/tweets")
          url.searchParams.set("max_results", "10")
          url.searchParams.set("tweet.fields", "created_at,public_metrics")

          const response = await fetch(url.toString(), {
            headers: {
              Authorization: `Bearer ${integration.access_token}`,
            },
          })

          if (response.ok) {
            const data = await response.json()
            posts.push(...(data.data || []).map((post: any) => ({
              ...post,
              provider: "Twitter",
            })))
          }
        }
        // Add other social platforms here when implemented
      }
    }

    if (posts.length === 0) {
      return {
        content: `I couldn't find any recent posts from your ${platform} account.`,
        metadata: { type: "social", data: [] }
      }
    }

    return {
      content: `I found ${posts.length} recent posts from your ${platform} account.`,
      metadata: { type: "social", data: posts }
    }
  } catch (error) {
    console.error("Social query error:", error)
    return {
      content: "Sorry, I couldn't fetch your social media posts. Please try again.",
      metadata: {}
    }
  }
}

async function handleSocialAction(intent: any, integrations: Integration[], userId: string, supabaseAdmin: any) {
  return {
    content: "Social action functionality is coming soon!",
    metadata: {}
  }
}

async function handleCRMQuery(intent: any, integrations: Integration[], userId: string, supabaseAdmin: any) {
  const crmIntegrations = integrations.filter(i => 
    ["hubspot", "airtable"].includes(i.provider)
  )
  
  if (crmIntegrations.length === 0) {
    return {
      content: "You don't have any CRM integrations connected. Please connect HubSpot or Airtable to use this feature. You can do this by visiting the [Integrations page](/integrations).",
      metadata: {}
    }
  }

  // If a specific integration was requested, use only that one
  const integrationsToUse = intent.specifiedIntegration 
    ? crmIntegrations.filter(i => i.provider === intent.specifiedIntegration)
    : crmIntegrations

  if (integrationsToUse.length === 0) {
    return {
      content: `I see you want to use ${intent.specifiedIntegration}, but it's not currently connected. You can connect it by visiting the [Integrations page](/integrations) and clicking "Connect" next to ${intent.specifiedIntegration}.`,
      metadata: {}
    }
  }

  try {
    const data = []
    const platform = intent.parameters.platform || integrationsToUse[0].provider
    
    for (const integration of integrationsToUse) {
      if (integration.provider === platform) {
        if (platform === "hubspot") {
          // HubSpot contacts endpoint
          const url = new URL("https://api.hubapi.com/crm/v3/objects/contacts")
          url.searchParams.set("limit", "10")

          const response = await fetch(url.toString(), {
            headers: {
              Authorization: `Bearer ${integration.access_token}`,
              "Content-Type": "application/json",
            },
          })

          if (response.ok) {
            const responseData = await response.json()
            data.push(...(responseData.results || []).map((contact: any) => ({
              ...contact,
              provider: "HubSpot",
            })))
          }
        }
        // Add other CRM platforms here when implemented
      }
    }

    if (data.length === 0) {
      return {
        content: `I couldn't find any data from your ${platform} account.`,
        metadata: { type: "crm", data: [] }
      }
    }

    return {
      content: `I found ${data.length} records from your ${platform} account.`,
      metadata: { type: "crm", data: data }
    }
  } catch (error) {
    console.error("CRM query error:", error)
    return {
      content: "Sorry, I couldn't fetch your CRM data. Please try again.",
      metadata: {}
    }
  }
}

async function handleCRMAction(intent: any, integrations: Integration[], userId: string, supabaseAdmin: any) {
  return {
    content: "CRM action functionality is coming soon!",
    metadata: {}
  }
}

async function handleEcommerceQuery(intent: any, integrations: Integration[], userId: string, supabaseAdmin: any) {
  const ecommerceIntegrations = integrations.filter(i => 
    ["shopify", "stripe", "paypal", "gumroad"].includes(i.provider)
  )
  
  if (ecommerceIntegrations.length === 0) {
    return {
      content: "You don't have any e-commerce integrations connected. Please connect Shopify, Stripe, PayPal, or Gumroad to use this feature. You can do this by visiting the [Integrations page](/integrations).",
      metadata: {}
    }
  }

  // If a specific integration was requested, use only that one
  const integrationsToUse = intent.specifiedIntegration 
    ? ecommerceIntegrations.filter(i => i.provider === intent.specifiedIntegration)
    : ecommerceIntegrations

  if (integrationsToUse.length === 0) {
    return {
      content: `I see you want to use ${intent.specifiedIntegration}, but it's not currently connected. You can connect it by visiting the [Integrations page](/integrations) and clicking "Connect" next to ${intent.specifiedIntegration}.`,
      metadata: {}
    }
  }

  try {
    const data = []
    const platform = intent.parameters.platform || integrationsToUse[0].provider
    
    for (const integration of integrationsToUse) {
      if (integration.provider === platform) {
        if (platform === "shopify") {
          // Shopify orders endpoint
          const url = new URL(`${integration.base_url}/admin/api/2023-10/orders.json`)
          url.searchParams.set("limit", "10")
          url.searchParams.set("status", "any")

          const response = await fetch(url.toString(), {
            headers: {
              "X-Shopify-Access-Token": integration.access_token || "",
              "Content-Type": "application/json",
            },
          })

          if (response.ok) {
            const responseData = await response.json()
            data.push(...(responseData.orders || []).map((order: any) => ({
              ...order,
              provider: "Shopify",
            })))
          }
        }
        // Add other e-commerce platforms here when implemented
      }
    }

    if (data.length === 0) {
      return {
        content: `I couldn't find any orders from your ${platform} account.`,
        metadata: { type: "ecommerce", data: [] }
      }
    }

    return {
      content: `I found ${data.length} orders from your ${platform} account.`,
      metadata: { type: "ecommerce", data: data }
    }
  } catch (error) {
    console.error("E-commerce query error:", error)
    return {
      content: "Sorry, I couldn't fetch your e-commerce data. Please try again.",
      metadata: {}
    }
  }
}

async function handleEcommerceAction(intent: any, integrations: Integration[], userId: string, supabaseAdmin: any) {
  return {
    content: "E-commerce action functionality is coming soon!",
    metadata: {}
  }
}

async function handleDeveloperQuery(intent: any, integrations: Integration[], userId: string, supabaseAdmin: any) {
  const developerIntegrations = integrations.filter(i => 
    ["github", "gitlab"].includes(i.provider)
  )
  
  if (developerIntegrations.length === 0) {
    return {
      content: "You don't have any developer tool integrations connected. Please connect GitHub or GitLab to use this feature. You can do this by visiting the [Integrations page](/integrations).",
      metadata: {}
    }
  }

  // If a specific integration was requested, use only that one
  const integrationsToUse = intent.specifiedIntegration 
    ? developerIntegrations.filter(i => i.provider === intent.specifiedIntegration)
    : developerIntegrations

  if (integrationsToUse.length === 0) {
    return {
      content: `I see you want to use ${intent.specifiedIntegration}, but it's not currently connected. You can connect it by visiting the [Integrations page](/integrations) and clicking "Connect" next to ${intent.specifiedIntegration}.`,
      metadata: {}
    }
  }

  try {
    const data = []
    const platform = intent.parameters.platform || integrationsToUse[0].provider
    
    for (const integration of integrationsToUse) {
      if (integration.provider === platform) {
        if (platform === "github") {
          // GitHub repositories endpoint
          const url = new URL("https://api.github.com/user/repos")
          url.searchParams.set("sort", "updated")
          url.searchParams.set("per_page", "10")

          const response = await fetch(url.toString(), {
            headers: {
              Authorization: `Bearer ${integration.access_token}`,
              "Accept": "application/vnd.github.v3+json",
            },
          })

          if (response.ok) {
            const responseData = await response.json()
            data.push(...responseData.map((repo: any) => ({
              ...repo,
              provider: "GitHub",
            })))
          }
        }
        // Add other developer platforms here when implemented
      }
    }

    if (data.length === 0) {
      return {
        content: `I couldn't find any repositories from your ${platform} account.`,
        metadata: { type: "developer", data: [] }
      }
    }

    return {
      content: `I found ${data.length} repositories from your ${platform} account.`,
      metadata: { type: "developer", data: data }
    }
  } catch (error) {
    console.error("Developer query error:", error)
    return {
      content: "Sorry, I couldn't fetch your developer data. Please try again.",
      metadata: {}
    }
  }
}

async function handleDeveloperAction(intent: any, integrations: Integration[], userId: string, supabaseAdmin: any) {
  return {
    content: "Developer action functionality is coming soon!",
    metadata: {}
  }
}

async function handleProductivityQuery(intent: any, integrations: Integration[], userId: string, supabaseAdmin: any) {
  const productivityIntegrations = integrations.filter(i => 
    ["notion", "trello", "airtable"].includes(i.provider)
  )
  
  if (productivityIntegrations.length === 0) {
    return {
      content: "You don't have any productivity tool integrations connected. Please connect Notion, Trello, or Airtable to use this feature. You can do this by visiting the [Integrations page](/integrations).",
      metadata: {}
    }
  }

  // If a specific integration was requested, use only that one
  const integrationsToUse = intent.specifiedIntegration 
    ? productivityIntegrations.filter(i => i.provider === intent.specifiedIntegration)
    : productivityIntegrations

  if (integrationsToUse.length === 0) {
    return {
      content: `I see you want to use ${intent.specifiedIntegration}, but it's not currently connected. You can connect it by visiting the [Integrations page](/integrations) and clicking "Connect" next to ${intent.specifiedIntegration}.`,
      metadata: {}
    }
  }

  try {
    const data = []
    
    for (const integration of integrationsToUse) {
      console.log(`Processing ${integration.provider} integration...`)
      
      if (integration.provider === "notion") {
        // Only do this for the 'what notion pages do I have' intent or similar
        if (intent.message && /what.*notion.*pages.*have|list.*notion.*pages/i.test(intent.message)) {
          try {
            console.log("[Notion Debug] Intent: ", intent.message);
            console.log("[Notion Debug] Found Notion integration: ", !!integration);
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 15000); // 15s timeout

            // Fetch all top-level pages
            const searchResponse = await fetch("https://api.notion.com/v1/search", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${integration.access_token}`,
                "Notion-Version": "2022-06-28",
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                filter: { value: "page", property: "object" },
                page_size: 100,
                sort: { direction: "descending", timestamp: "last_edited_time" }
              }),
              signal: controller.signal,
            })

            clearTimeout(timeout);

            if (!searchResponse.ok) {
              throw new Error(`Notion search failed: ${searchResponse.status}`);
            }
            const pagesData = await searchResponse.json();
            console.log("[Notion Debug] Raw Notion API results:", JSON.stringify(pagesData.results, null, 2));
            const mainPages = [];

            for (const page of pagesData.results || []) {
              // Get page title
              let pageTitle = "Untitled Page";
              if (page.title && page.title.length > 0) {
                pageTitle = page.title[0].plain_text;
              } else if (page.properties) {
                for (const [key, prop] of Object.entries(page.properties)) {
                  const typedProp = prop as any;
                  if (typedProp.title && typedProp.title.length > 0) {
                    pageTitle = typedProp.title[0].plain_text;
                    break;
                  } else if (typedProp.rich_text && typedProp.rich_text.length > 0) {
                    pageTitle = typedProp.rich_text[0].plain_text;
                    break;
                  }
                }
              }

              // Fetch subpages (children) with error handling and timeout
              let subpages = [];
              try {
                const subController = new AbortController();
                const subTimeout = setTimeout(() => subController.abort(), 15000);
                const childrenResponse = await fetch(`https://api.notion.com/v1/blocks/${page.id}/children`, {
                  method: "GET",
                  headers: {
                    Authorization: `Bearer ${integration.access_token}`,
                    "Notion-Version": "2022-06-28",
                  },
                  signal: subController.signal,
                });
                clearTimeout(subTimeout);
                if (childrenResponse.ok) {
                  const childrenData = await childrenResponse.json();
                  subpages = (childrenData.results || [])
                    .filter((block: any) => block.type === 'child_page')
                    .map((block: any) => ({
                      id: block.id,
                      title: block.child_page?.title || "Untitled Subpage",
                      url: `https://notion.so/${block.id.replace(/-/g, '')}`
                    }));
                }
              } catch (subErr) {
                console.error("Notion subpage fetch error:", subErr);
              }

              mainPages.push({
                id: page.id,
                title: pageTitle,
                url: page.url,
                subpages
              });
            }

            console.log("[Notion Debug] Pages fetched: ", mainPages.length);

            return {
              content: `Here are your Notion pages:`,
              metadata: { type: "notion_page_hierarchy", pages: mainPages }
            };
          } catch (err) {
            console.error("Notion fetch error:", err);
            return {
              content: "Sorry, I couldn't fetch your Notion pages. Please try again.",
              metadata: { type: "notion_page_hierarchy", pages: [] }
            };
          }
        }
      } else if (integration.provider === "trello") {
        // Trello boards endpoint
        const response = await fetch("https://api.trello.com/1/members/me/boards", {
          headers: {
            Authorization: `Bearer ${integration.access_token}`,
          },
        })

        if (response.ok) {
          const responseData = await response.json()
          const boards = responseData.map((board: any) => ({
            id: board.id,
            title: board.name,
            url: board.url,
            provider: "Trello",
          }))
          data.push(...boards)
        }
      } else if (integration.provider === "airtable") {
        // Airtable bases endpoint
        const response = await fetch("https://api.airtable.com/v0/meta/bases", {
          headers: {
            Authorization: `Bearer ${integration.access_token}`,
          },
        })

        if (response.ok) {
          const responseData = await response.json()
          const bases = (responseData.bases || []).map((base: any) => ({
            id: base.id,
            title: base.name,
            provider: "Airtable",
          }))
          data.push(...bases)
        }
      }
    }

    if (data.length === 0) {
      return {
        content: `I couldn't find any content from your productivity tools.`,
        metadata: { type: "productivity", data: [] }
      }
    }

    const platform = intent.specifiedIntegration || "productivity tools"
    return {
      content: `I found ${data.length} items from your ${platform}.`,
      metadata: { type: "productivity", data: data }
    }
  } catch (error) {
    console.error("Productivity query error:", error)
    return {
      content: "Sorry, I couldn't fetch your productivity data. Please try again.",
      metadata: {}
    }
  }
}

async function handleProductivityAction(intent: any, integrations: Integration[], userId: string, supabaseAdmin: any) {
  return {
    content: "Productivity action functionality is coming soon!",
    metadata: {}
  }
}

async function handleCommunicationQuery(intent: any, integrations: Integration[], userId: string, supabaseAdmin: any) {
  const communicationIntegrations = integrations.filter(i => 
    ["slack", "discord"].includes(i.provider)
  )
  
  if (communicationIntegrations.length === 0) {
    return {
      content: "You don't have any communication integrations connected. Please connect Slack or Discord to use this feature. You can do this by visiting the [Integrations page](/integrations).",
      metadata: {}
    }
  }

  // If a specific integration was requested, use only that one
  const integrationsToUse = intent.specifiedIntegration 
    ? communicationIntegrations.filter(i => i.provider === intent.specifiedIntegration)
    : communicationIntegrations

  if (integrationsToUse.length === 0) {
    return {
      content: `I see you want to use ${intent.specifiedIntegration}, but it's not currently connected. You can connect it by visiting the [Integrations page](/integrations) and clicking "Connect" next to ${intent.specifiedIntegration}.`,
      metadata: {}
    }
  }

  try {
    const data = []
    const platform = intent.parameters.platform || integrationsToUse[0].provider
    
    for (const integration of integrationsToUse) {
      if (integration.provider === platform) {
        if (platform === "slack") {
          // Slack API endpoint for getting channels
          const url = new URL("https://slack.com/api/conversations.list")
          url.searchParams.set("limit", "10")

          const response = await fetch(url.toString(), {
            headers: {
              Authorization: `Bearer ${integration.access_token}`,
            },
          })

          if (response.ok) {
            const responseData = await response.json()
            data.push(...(responseData.channels || []).map((channel: any) => ({
              ...channel,
              provider: "Slack",
            })))
          }
        }
        // Add other communication platforms here when implemented
      }
    }

    if (data.length === 0) {
      return {
        content: `I couldn't find any channels in your ${platform} account.`,
        metadata: { type: "communication", data: [] }
      }
    }

    return {
      content: `I found ${data.length} channels in your ${platform} account.`,
      metadata: { type: "communication", data: data }
    }
  } catch (error) {
    console.error("Communication query error:", error)
    return {
      content: "Sorry, I couldn't fetch your communication data. Please try again.",
      metadata: {}
    }
  }
}

async function handleCommunicationAction(intent: any, integrations: Integration[], userId: string, supabaseAdmin: any) {
  return {
    content: "Communication action functionality is coming soon!",
    metadata: {}
  }
}