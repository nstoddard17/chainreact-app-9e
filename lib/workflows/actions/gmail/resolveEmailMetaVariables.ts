import { logger } from '@/lib/utils/logger'
import { createClient } from '@supabase/supabase-js'

/**
 * Email meta-variable resolution utility
 *
 * Resolves meta-variables in email templates based on configured field values:
 * - {{recipient_name}}, {{recipient_email}}, {{recipient_first_name}} - from To field
 * - {{sender_name}}, {{sender_email}}, {{sender_company}}, {{sender_role}} - from From field or user profile
 *
 * These meta-variables ALWAYS show in the variables dropdown and resolve dynamically at runtime.
 */

interface EmailMetaContext {
  to?: string | string[]
  from?: string
  cc?: string | string[]
  bcc?: string | string[]
  userId: string
}

interface ResolvedMetaVariables {
  recipient_name: string
  recipient_email: string
  recipient_first_name: string
  sender_name: string
  sender_email: string
  sender_company: string
  sender_role: string
}

/**
 * Extract email address and name from various formats:
 * - "john@example.com"
 * - "John Doe <john@example.com>"
 * - "john@example.com (John Doe)"
 */
function parseEmailAddress(emailString: string): { email: string; name: string } {
  if (!emailString) {
    return { email: '', name: '' }
  }

  // Format: "John Doe <john@example.com>"
  const angleMatch = emailString.match(/^(.*?)\s*<(.+?)>/)
  if (angleMatch) {
    return {
      name: angleMatch[1].trim().replace(/^["']|["']$/g, ''), // Remove quotes
      email: angleMatch[2].trim()
    }
  }

  // Format: "john@example.com (John Doe)"
  const parenMatch = emailString.match(/^(.+?)\s*\((.+?)\)/)
  if (parenMatch) {
    return {
      email: parenMatch[1].trim(),
      name: parenMatch[2].trim()
    }
  }

  // Format: Just email "john@example.com"
  const emailMatch = emailString.match(/[\w.-]+@[\w.-]+\.\w+/)
  if (emailMatch) {
    const email = emailMatch[0]
    // Try to extract name from email (john.doe@example.com -> John Doe)
    const localPart = email.split('@')[0]
    const nameParts = localPart.split(/[._-]/).map(part =>
      part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
    )
    return {
      email,
      name: nameParts.join(' ')
    }
  }

  return { email: emailString, name: '' }
}

/**
 * Extract first name from full name
 */
function extractFirstName(fullName: string): string {
  if (!fullName) return ''
  const parts = fullName.trim().split(/\s+/)
  return parts[0] || ''
}

/**
 * Fetch sender profile information from Supabase
 */
async function fetchSenderProfile(userId: string): Promise<{ name: string; email: string; company: string; role: string }> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY

    if (!supabaseUrl || !supabaseServiceKey) {
      logger.warn('Supabase credentials not available for sender profile fetch')
      return { name: '', email: '', company: '', role: '' }
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Fetch user profile and auth user data
    const [profileResult, userResult] = await Promise.all([
      supabase
        .from('user_profiles')
        .select('full_name, company, role')
        .eq('id', userId)
        .single(),
      supabase.auth.admin.getUserById(userId)
    ])

    const profile = profileResult.data
    const authUser = userResult.data.user

    return {
      name: profile?.full_name || authUser?.user_metadata?.full_name || '',
      email: authUser?.email || '',
      company: profile?.company || '',
      role: profile?.role || ''
    }
  } catch (error) {
    logger.error('Failed to fetch sender profile:', error)
    return { name: '', email: '', company: '', role: '' }
  }
}

/**
 * Resolve meta-variables based on email context
 */
export async function resolveEmailMetaVariables(
  context: EmailMetaContext
): Promise<ResolvedMetaVariables> {
  const { to, from, userId } = context

  // Resolve recipient variables from To field
  let recipientEmail = ''
  let recipientName = ''

  if (to) {
    const toAddress = Array.isArray(to) ? to[0] : to
    const parsed = parseEmailAddress(toAddress)
    recipientEmail = parsed.email
    recipientName = parsed.name
  }

  const recipientFirstName = extractFirstName(recipientName)

  // Resolve sender variables from From field or user profile
  let senderEmail = ''
  let senderName = ''
  let senderCompany = ''
  let senderRole = ''

  if (from && from !== 'me') {
    // From field is explicitly set
    const parsed = parseEmailAddress(from)
    senderEmail = parsed.email
    senderName = parsed.name
  }

  // Fetch user profile for sender info (company, role, default name/email)
  const profile = await fetchSenderProfile(userId)

  // Use profile data as fallback or primary source
  senderEmail = senderEmail || profile.email
  senderName = senderName || profile.name
  senderCompany = profile.company
  senderRole = profile.role

  return {
    recipient_name: recipientName,
    recipient_email: recipientEmail,
    recipient_first_name: recipientFirstName,
    sender_name: senderName,
    sender_email: senderEmail,
    sender_company: senderCompany,
    sender_role: senderRole
  }
}

/**
 * Apply meta-variable resolution to email body and subject
 */
export async function applyEmailMetaVariables(
  config: {
    to?: string | string[]
    from?: string
    cc?: string | string[]
    bcc?: string | string[]
    subject?: string
    body?: string
  },
  userId: string
): Promise<{ subject: string; body: string }> {
  const { to, from, cc, bcc, subject, body } = config

  // Check if there are any meta-variables to resolve
  const hasMetaVariables = (text: string) => {
    if (!text) return false
    return /{{(recipient_|sender_)/i.test(text)
  }

  if (!hasMetaVariables(subject || '') && !hasMetaVariables(body || '')) {
    // No meta-variables to resolve
    return { subject: subject || '', body: body || '' }
  }

  // Resolve meta-variables
  const metaVars = await resolveEmailMetaVariables({ to, from, cc, bcc, userId })

  // Replace meta-variables in subject and body
  const replacements: Record<string, string> = {
    '{{recipient_name}}': metaVars.recipient_name,
    '{{recipient_email}}': metaVars.recipient_email,
    '{{recipient_first_name}}': metaVars.recipient_first_name,
    '{{sender_name}}': metaVars.sender_name,
    '{{sender_email}}': metaVars.sender_email,
    '{{sender_company}}': metaVars.sender_company,
    '{{sender_role}}': metaVars.sender_role
  }

  let resolvedSubject = subject || ''
  let resolvedBody = body || ''

  for (const [variable, value] of Object.entries(replacements)) {
    const regex = new RegExp(variable.replace(/[{}]/g, '\\$&'), 'gi')
    resolvedSubject = resolvedSubject.replace(regex, value)
    resolvedBody = resolvedBody.replace(regex, value)
  }

  logger.debug('📧 [Meta Variables] Resolved:', {
    hasRecipient: !!metaVars.recipient_email,
    hasSender: !!metaVars.sender_email,
    recipientName: metaVars.recipient_name,
    senderName: metaVars.sender_name
  })

  return { subject: resolvedSubject, body: resolvedBody }
}
