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
    const { username } = await request.json()

    if (!username || username.length < 3) {
      return NextResponse.json({ available: false, error: 'Username too short' })
    }

    // Use service role to bypass RLS
    const { data, error } = await supabaseAdmin
      .from('user_profiles')
      .select('username')
      .eq('username', username)
      .single()

    if (error) {
      // PGRST116 means no row found - username is available
      if (error.code === 'PGRST116') {
        return NextResponse.json({ available: true })
      }
      // For any other error, log it but assume available
      console.log('Username check error:', error)
      return NextResponse.json({ available: true })
    }

    // If we found data, username is taken
    return NextResponse.json({ available: false })

  } catch (error) {
    console.error('Username availability check failed:', error)
    // Default to available on error - actual constraint will be enforced at signup
    return NextResponse.json({ available: true })
  }
}