import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// In-memory rate limiting store (consider using Redis in production)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>()

// Rate limiting configuration
const RATE_LIMIT = {
  maxAttempts: 3, // Maximum attempts
  windowMs: 15 * 60 * 1000, // 15 minutes window
  blockDurationMs: 60 * 60 * 1000, // 1 hour block after exceeding limit
}

function checkRateLimit(identifier: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now()
  const record = rateLimitStore.get(identifier)

  // Clean up expired entries
  if (record && record.resetTime < now) {
    rateLimitStore.delete(identifier)
  }

  // Check if user is currently blocked
  if (record && record.count >= RATE_LIMIT.maxAttempts) {
    const timeUntilReset = record.resetTime - now
    if (timeUntilReset > 0) {
      return { 
        allowed: false, 
        retryAfter: Math.ceil(timeUntilReset / 1000) // seconds
      }
    }
    // Block period expired, reset
    rateLimitStore.delete(identifier)
  }

  // Check current window
  if (!record || record.resetTime < now) {
    // Start new window
    rateLimitStore.set(identifier, {
      count: 1,
      resetTime: now + RATE_LIMIT.windowMs
    })
    return { allowed: true }
  }

  // Increment count in current window
  record.count++
  
  // If limit exceeded, extend the reset time to block duration
  if (record.count >= RATE_LIMIT.maxAttempts) {
    record.resetTime = now + RATE_LIMIT.blockDurationMs
    return { 
      allowed: false, 
      retryAfter: Math.ceil(RATE_LIMIT.blockDurationMs / 1000)
    }
  }

  return { allowed: true }
}

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json()

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      )
    }

    // Rate limiting based on email and IP
    const clientIp = request.headers.get('x-forwarded-for') || 
                     request.headers.get('x-real-ip') || 
                     'unknown'
    
    // Check rate limits for both email and IP
    const emailRateLimit = checkRateLimit(`email:${email}`)
    const ipRateLimit = checkRateLimit(`ip:${clientIp}`)

    if (!emailRateLimit.allowed) {
      return NextResponse.json(
        { 
          error: 'Too many requests. Please try again later.',
          retryAfter: emailRateLimit.retryAfter 
        },
        { 
          status: 429,
          headers: {
            'Retry-After': String(emailRateLimit.retryAfter || 3600)
          }
        }
      )
    }

    if (!ipRateLimit.allowed) {
      return NextResponse.json(
        { 
          error: 'Too many requests from this IP. Please try again later.',
          retryAfter: ipRateLimit.retryAfter 
        },
        { 
          status: 429,
          headers: {
            'Retry-After': String(ipRateLimit.retryAfter || 3600)
          }
        }
      )
    }

    // Create Supabase client
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!, // Use service role for admin operations
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value
          },
          set(name: string, value: string, options: any) {
            cookieStore.set({ name, value, ...options })
          },
          remove(name: string, options: any) {
            cookieStore.set({ name, value: '', ...options })
          },
        },
      }
    )

    // Check if user exists and is not already confirmed
    const { data: userData, error: userError } = await supabase.auth.admin.getUserByEmail(email)

    if (userError || !userData.user) {
      // Don't reveal if email exists or not for security
      return NextResponse.json(
        { message: 'If an account exists with this email, a confirmation link has been sent.' },
        { status: 200 }
      )
    }

    // Check if email is already confirmed
    if (userData.user.email_confirmed_at) {
      return NextResponse.json(
        { error: 'Email is already confirmed. Please sign in.' },
        { status: 400 }
      )
    }

    // Check if user was created more than 24 hours ago (expired signup)
    const createdAt = new Date(userData.user.created_at!)
    const hoursSinceCreation = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60)
    
    if (hoursSinceCreation > 24) {
      return NextResponse.json(
        { error: 'Signup link has expired. Please register again.' },
        { status: 400 }
      )
    }

    // Resend confirmation email
    const baseUrl = request.headers.get('origin') || process.env.NEXT_PUBLIC_SITE_URL
    
    const { error: resendError } = await supabase.auth.resend({
      type: 'signup',
      email: email,
      options: {
        emailRedirectTo: `${baseUrl}/api/auth/callback?type=email-confirmation`
      }
    })

    if (resendError) {
      console.error('Error resending confirmation:', resendError)
      return NextResponse.json(
        { error: 'Failed to resend confirmation email. Please try again.' },
        { status: 500 }
      )
    }

    // Log the resend attempt for monitoring
    console.log(`Confirmation email resent to: ${email} from IP: ${clientIp}`)

    return NextResponse.json(
      { message: 'Confirmation email has been resent. Please check your inbox.' },
      { status: 200 }
    )

  } catch (error) {
    console.error('Resend confirmation error:', error)
    return NextResponse.json(
      { error: 'An error occurred. Please try again.' },
      { status: 500 }
    )
  }
}

// Clean up old rate limit entries periodically
if (typeof global !== 'undefined' && !(global as any).rateLimitCleanupInterval) {
  (global as any).rateLimitCleanupInterval = setInterval(() => {
    const now = Date.now()
    for (const [key, value] of rateLimitStore.entries()) {
      if (value.resetTime < now) {
        rateLimitStore.delete(key)
      }
    }
  }, 60 * 1000) // Clean up every minute
}