import { NextResponse } from "next/server"
import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { EmailCacheService } from "@/lib/services/emailCacheService"
import { cookies } from "next/headers"

export async function POST(req: Request) {
  cookies()
  const supabase = await createSupabaseRouteHandlerClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { emails, source, integrationId } = await req.json()

    console.log("Email tracking request:", { emails, source, integrationId })

    if (!emails || !Array.isArray(emails) || !source) {
      return NextResponse.json({ 
        error: "Missing required fields: emails (array), source" 
      }, { status: 400 })
    }

    // Validate integrationId if provided - should be UUID format or undefined
    if (integrationId && (typeof integrationId !== 'string' || integrationId.includes('_'))) {
      console.warn(`Invalid integrationId format: ${integrationId}, skipping integration tracking`)
      // Don't fail the request, just proceed without integrationId
    }

    const emailCache = new EmailCacheService(true)

    // Process emails and extract individual addresses
    const emailsToTrack: Array<{
      email: string
      name?: string
      source: string
      integrationId?: string
      metadata?: Record<string, any>
    }> = []

    emails.forEach((emailData: any) => {
      if (typeof emailData === 'string') {
        // Handle simple email string
        const extractedEmails = extractEmailAddresses(emailData)
        extractedEmails.forEach(({ email, name }) => {
          emailsToTrack.push({
            email,
            name,
            source,
            integrationId: integrationId && !integrationId.includes('_') ? integrationId : undefined,
            metadata: { tracked_from: 'workflow_execution' }
          })
        })
      } else if (emailData.email) {
        // Handle email object
        emailsToTrack.push({
          email: emailData.email,
          name: emailData.name,
          source,
          integrationId: integrationId && !integrationId.includes('_') ? integrationId : undefined,
          metadata: { 
            tracked_from: 'workflow_execution',
            ...emailData.metadata 
          }
        })
      }
    })

    // Track all emails
    await emailCache.trackMultipleEmails(emailsToTrack)

    return NextResponse.json({ 
      success: true, 
      tracked: emailsToTrack.length 
    })

  } catch (error) {
    console.error("Failed to track email usage:", error)
    return NextResponse.json({ 
      error: "Failed to track email usage" 
    }, { status: 500 })
  }
}

export async function GET(req: Request) {
  cookies()
  const supabase = await createSupabaseRouteHandlerClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const url = new URL(req.url)
    const source = url.searchParams.get('source')
    const limit = parseInt(url.searchParams.get('limit') || '50')

    const emailCache = new EmailCacheService(true)
    
    if (url.searchParams.get('stats') === 'true') {
      // Return email statistics
      const stats = await emailCache.getEmailStats()
      return NextResponse.json(stats)
    } else {
      // Return frequent emails
      const frequentEmails = await emailCache.getFrequentEmails(source || undefined, limit)
      return NextResponse.json(frequentEmails)
    }

  } catch (error) {
    console.error("Failed to get email cache data:", error)
    return NextResponse.json({ 
      error: "Failed to get email cache data" 
    }, { status: 500 })
  }
}

function extractEmailAddresses(input: string): { email: string; name?: string }[] {
  const emails: { email: string; name?: string }[] = []
  
  // Split by comma and process each part
  const parts = input.split(',').map(part => part.trim())
  
  parts.forEach(part => {
    // Match "Name <email@domain.com>" format
    const nameEmailMatch = part.match(/^(.+?)\s*<([^>]+)>$/)
    // Match standalone email
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