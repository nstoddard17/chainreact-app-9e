import { NextResponse, type NextRequest } from 'next/server'
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createSupabaseRouteHandlerClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

import { logger } from '@/lib/utils/logger'

export const dynamic = 'force-dynamic'

function deriveRoleFromMetadata(metadata: Record<string, any> | undefined): string {
  if (!metadata) return 'free'

  const metadataRole = metadata.role || metadata.account_role || metadata.membership_role
  if (metadataRole && typeof metadataRole === 'string') {
    return metadataRole
  }

  if (metadata.is_beta_tester === true || metadata.beta_tester === true) {
    return 'beta-pro'
  }

  return 'free'
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseRouteHandlerClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return errorResponse('Not authenticated' , 401)
    }

    const adminClient = createAdminClient()

    const {
      data: existingProfile,
      error: profileError,
    } = await adminClient
      .from('user_profiles')
      .select(
        'id, email, username, full_name, first_name, last_name, role, admin, provider, avatar_url, company, job_title, secondary_email, phone_number, created_at, updated_at'
      )
      .eq('id', user.id)
      .maybeSingle()

    if (existingProfile) {
      return jsonResponse({ profile: existingProfile })
    }

    if (profileError && profileError.code && profileError.code !== 'PGRST116') {
      logger.error('Service profile lookup failed:', profileError)
      return errorResponse(profileError.message , 500)
    }

    const userResponse = await adminClient.auth.admin.getUserById(user.id)

    if (userResponse.error || !userResponse.data?.user) {
      logger.error('Unable to load auth user for profile creation:', userResponse.error)
      return errorResponse('Failed to load user metadata' , 500)
    }

    const authUser = userResponse.data.user
    const metadata = authUser.user_metadata || {}
    const fullName = metadata.full_name || metadata.name || ''
    const firstName = metadata.first_name || metadata.given_name || (fullName ? fullName.split(' ')[0] : '')
    const lastName = metadata.last_name || metadata.family_name || (fullName ? fullName.split(' ').slice(1).join(' ') : '')
    const derivedRole = deriveRoleFromMetadata(metadata)
    const provider =
      authUser.app_metadata?.provider ||
      authUser.app_metadata?.providers?.[0] ||
      (authUser.identities?.[0]?.provider ?? 'email')

    const insertPayload = {
      id: authUser.id,
      email: authUser.email,
      username: metadata.username ?? null,
      full_name: fullName || null,
      first_name: firstName || null,
      last_name: lastName || null,
      role: derivedRole,
      provider,
      avatar_url: metadata.avatar_url || metadata.picture || null,
      company: metadata.company || null,
      job_title: metadata.job_title || null,
      secondary_email: metadata.secondary_email || null,
      phone_number: metadata.phone_number || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    const {
      data: createdProfile,
      error: insertError,
    } = await adminClient
      .from('user_profiles')
      .insert(insertPayload)
      .select(
        'id, email, username, full_name, first_name, last_name, role, admin, provider, avatar_url, company, job_title, secondary_email, phone_number, created_at, updated_at'
      )
      .single()

    if (insertError) {
      logger.error('Failed to create user profile via service route:', insertError)
      return errorResponse(insertError.message , 500)
    }

    return jsonResponse({ profile: createdProfile })
  } catch (error) {
    logger.error('Unexpected error in auth profile route:', error)
    return errorResponse('Internal server error' , 500)
  }
}
