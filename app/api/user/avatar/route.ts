import { createSupabaseRouteHandlerClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    const supabase = await createSupabaseRouteHandlerClient()

    // Get the authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get the avatar path from query params
    const { searchParams } = new URL(request.url)
    const avatarUrl = searchParams.get('url')

    if (!avatarUrl) {
      return NextResponse.json({ error: 'No avatar URL provided' }, { status: 400 })
    }

    // Extract the path from the full URL
    // Example: https://...supabase.co/storage/v1/object/public/user-avatars/userId/avatar.png
    const pathMatch = avatarUrl.match(/\/user-avatars\/(.+?)(\?|$)/)
    if (!pathMatch) {
      return NextResponse.json({ error: 'Invalid avatar URL' }, { status: 400 })
    }

    const filePath = pathMatch[1]

    // Create a signed URL that expires in 1 hour
    const { data, error } = await supabase.storage
      .from('user-avatars')
      .createSignedUrl(filePath, 3600) // 1 hour expiry

    if (error) {
      console.error('Error creating signed URL:', error)
      return NextResponse.json({ error: 'Failed to generate signed URL' }, { status: 500 })
    }

    return NextResponse.json({ signedUrl: data.signedUrl })
  } catch (error) {
    console.error('Avatar API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
