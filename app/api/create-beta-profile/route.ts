import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

// Create a service role client to bypass RLS
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
)

export async function POST(request: Request) {
  try {
    const { userId, username, fullName, email } = await request.json()

    if (!userId || !username) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // First check if profile already exists
    const { data: existingProfile } = await supabaseAdmin
      .from('user_profiles')
      .select('id')
      .eq('id', userId)
      .single()

    let profileResult

    if (existingProfile) {
      // Update existing profile
      profileResult = await supabaseAdmin
        .from('user_profiles')
        .update({
          username: username.toLowerCase().trim(),
          full_name: fullName,
          role: 'beta-pro',
          updated_at: new Date().toISOString()
        })
        .eq('id', userId)
        .select()
        .single()
    } else {
      // Create new profile
      profileResult = await supabaseAdmin
        .from('user_profiles')
        .insert({
          id: userId,
          username: username.toLowerCase().trim(),
          full_name: fullName,
          role: 'beta-pro',
          provider: 'email',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single()
    }

    if (profileResult.error) {
      console.error('Profile creation/update error:', profileResult.error)
      return NextResponse.json(
        { error: profileResult.error.message },
        { status: 500 }
      )
    }

    // Update beta tester status to converted
    if (email) {
      await supabaseAdmin
        .from('beta_testers')
        .update({
          status: 'converted',
          conversion_date: new Date().toISOString()
        })
        .eq('email', email)
        .eq('status', 'active')
    }

    return NextResponse.json({
      success: true,
      profile: profileResult.data
    })

  } catch (error) {
    console.error('Error in create-beta-profile:', error)
    return NextResponse.json(
      { error: 'Failed to create profile' },
      { status: 500 }
    )
  }
}