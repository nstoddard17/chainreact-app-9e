import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseRouteHandlerClient } from '@/utils/supabase/server'
import crypto from 'crypto'

// Function to list page posts using page access token
async function listPagePosts(pageId: string, pageAccessToken: string) {
  console.log(`📝 Fetching posts from page ${pageId}...`)
  
  // Check if we have the app secret for appsecret_proof
  const appSecret = process.env.FACEBOOK_CLIENT_SECRET
  if (!appSecret) {
    console.log('⚠️ FACEBOOK_CLIENT_SECRET not found, making request without appsecret_proof')
    
    const response = await fetch(
      `https://graph.facebook.com/v17.0/${pageId}/posts?access_token=${pageAccessToken}`
    )
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error('❌ Failed to fetch posts:', errorText)
      throw new Error(`Failed to fetch posts: ${errorText}`)
    }
    
    const data = await response.json()
    const posts = data.data || []
    
    console.log(`✅ Successfully fetched ${posts.length} posts`)
    return posts
  }
  
  // Generate appsecret_proof for secure server-side calls
  const appsecret_proof = crypto
    .createHmac('sha256', appSecret)
    .update(pageAccessToken)
    .digest('hex')
  
  const response = await fetch(
    `https://graph.facebook.com/v17.0/${pageId}/posts?access_token=${pageAccessToken}&appsecret_proof=${appsecret_proof}`
  )
  
  if (!response.ok) {
    const errorText = await response.text()
    console.error('❌ Failed to fetch posts:', errorText)
    throw new Error(`Failed to fetch posts: ${errorText}`)
  }
  
  const data = await response.json()
  const posts = data.data || []
  
  console.log(`✅ Successfully fetched ${posts.length} posts`)
  return posts
}

export async function POST(request: NextRequest) {
  try {
    console.log('🔄 Facebook posts API called')
    
    const body = await request.json()
    const { pageId, userId } = body
    console.log('📝 Request body:', { pageId, userId })

    if (!pageId) {
      console.log('❌ Missing pageId')
      return NextResponse.json({ error: 'Missing pageId' }, { status: 400 })
    }

    // Get user's Facebook integration
    console.log('🔍 Getting Supabase client')
    const supabase = await createSupabaseRouteHandlerClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    console.log('👤 User:', user ? { id: user.id } : null)
    
    if (!user) {
      console.log('❌ No user found')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get Facebook access token
    console.log('🔍 Getting Facebook integration for user:', user.id)
    const { data: integration, error: integrationError } = await supabase
      .from('integrations')
      .select('access_token, refresh_token, expires_at')
      .eq('user_id', user.id)
      .eq('provider', 'facebook')
      .single()

    console.log('🔍 Integration result:', integration ? { hasToken: !!integration.access_token, expiresAt: integration.expires_at } : null)
    console.log('🔍 Integration error:', integrationError)

    if (!integration) {
      console.log('❌ Facebook integration not found')
      return NextResponse.json({ error: 'Facebook integration not found' }, { status: 404 })
    }

    // Check if token is expired and refresh if needed
    let userAccessToken = integration.access_token
    
    if (integration.expires_at && new Date(integration.expires_at) <= new Date()) {
      console.log('🔄 Token is expired, refreshing...')
      
      if (integration.refresh_token) {
        try {
          const refreshResponse = await fetch(`https://graph.facebook.com/v18.0/oauth/access_token`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
              grant_type: 'fb_exchange_token',
              client_id: process.env.NEXT_PUBLIC_FACEBOOK_CLIENT_ID!,
              client_secret: process.env.FACEBOOK_CLIENT_SECRET!,
              fb_exchange_token: integration.refresh_token,
            }),
          })

          if (refreshResponse.ok) {
            const refreshData = await refreshResponse.json()
            userAccessToken = refreshData.access_token
            console.log('✅ Token refreshed successfully')

            // Update the token in the database
            await supabase
              .from('integrations')
              .update({
                access_token: userAccessToken,
                expires_at: new Date(Date.now() + (refreshData.expires_in * 1000)).toISOString(),
              })
              .eq('user_id', user.id)
              .eq('provider', 'facebook')
          }
        } catch (error) {
          console.error('❌ Error refreshing token:', error)
        }
      }
    }

    // Get posts for the specific page using the stored page access token
    let posts
    try {
      posts = await listPagePosts(pageId, userAccessToken)
    } catch (error) {
      console.error('❌ Error fetching posts:', error)
      return NextResponse.json({ 
        error: 'Failed to fetch posts from the page.',
        details: error instanceof Error ? error.message : 'Unknown error'
      }, { status: 500 })
    }

    // Format posts for the dropdown
    const formattedPosts = posts.map((post: any) => ({
      value: post.id,
      label: post.message 
        ? `${post.message.substring(0, 50)}${post.message.length > 50 ? '...' : ''} (${new Date(post.created_time).toLocaleDateString()})`
        : `Post ${post.id} (${new Date(post.created_time).toLocaleDateString()})`
    }))

    console.log(`✅ Successfully formatted ${formattedPosts.length} posts`)
    return NextResponse.json({ data: formattedPosts })

  } catch (error) {
    console.error('❌ Error fetching Facebook posts:', error)
    console.error('❌ Error stack:', error instanceof Error ? error.stack : 'No stack trace')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
} 