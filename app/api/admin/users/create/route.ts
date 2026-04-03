import { NextRequest } from 'next/server'
import { jsonResponse, errorResponse } from '@/lib/utils/api-response'
import { requireAdmin } from '@/lib/utils/admin-auth'
import { createUser } from '@/lib/admin/userActions'
import { sendWelcomeEmail } from '@/lib/services/resend'
import { type UserRole, ROLES } from '@/lib/utils/roles'
import { createClient } from '@supabase/supabase-js'
import { logger } from '@/lib/utils/logger'

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAdmin({ capabilities: ['user_admin'] })
    if (!authResult.isAdmin) return authResult.response

    const body = await request.json()
    const { email, password, full_name, username, role = 'free', send_welcome_email = true } = body

    if (!email || !password) {
      return errorResponse('Email and password are required', 400)
    }

    if (!ROLES[role as UserRole]) {
      return errorResponse('Invalid role specified', 400)
    }

    const { data: newUser, error: createError } = await createUser(authResult.userId, {
      email,
      password,
      full_name,
      username,
      role,
    }, request)

    if (createError) {
      logger.error('Error creating user:', { message: createError.message })
      return errorResponse(createError.message || 'Failed to create user', 400)
    }

    if (!newUser?.user) {
      return errorResponse('Failed to create user', 500)
    }

    // Send welcome email if requested
    if (send_welcome_email) {
      try {
        const adminSupabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SECRET_KEY!
        )
        const { data: linkData } = await adminSupabase.auth.admin.generateLink({
          type: 'magiclink',
          email,
          options: {
            redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/dashboard`,
          },
        })

        await sendWelcomeEmail(
          {
            to: email,
            subject: 'Welcome to ChainReact - Your account has been created',
          },
          {
            username: full_name || username || undefined,
            confirmationUrl: linkData.properties?.action_link || `${process.env.NEXT_PUBLIC_SITE_URL}/auth/login`,
          }
        )
      } catch (emailError) {
        logger.error('Error sending welcome email:', emailError)
      }
    }

    return jsonResponse({
      success: true,
      user: {
        id: newUser.user.id,
        email: newUser.user.email,
        created_at: newUser.user.created_at,
      },
      message: 'User created successfully',
    })
  } catch (error) {
    logger.error('Error in user creation API:', error)
    return errorResponse('Internal server error', 500)
  }
}
