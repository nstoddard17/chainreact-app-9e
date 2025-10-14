import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createSupabaseRouteHandlerClient } from '@/utils/supabase/server'
import crypto from 'crypto'

import { logger } from '@/lib/utils/logger'

// Function to list page posts using page access token
async function listPagePosts(pageId: string, pageAccessToken: string) {
  logger.debug(`📝 Fetching posts from page ${pageId}...`)
  
  // Check if we have the app secret for appsecret_proof
  const appSecret = process.env.FACEBOOK_CLIENT_SECRET
  if (!appSecret) {
    logger.debug('⚠️ FACEBOOK_CLIENT_SECRET not found, making request without appsecret_proof')
    
    const response = await fetch(
      `https://graph.facebook.com/v17.0/${pageId}/posts?access_token=${pageAccessToken}`
    )
    
    if (!response.ok) {
      const errorText = await response.text()
      logger.error('❌ Failed to fetch posts:', errorText)
      throw new Error(`Failed to fetch posts: ${errorText}`)
    }
    
    const data = await response.json()
    const posts = data.data || []
    
    logger.debug(`✅ Successfully fetched ${posts.length} posts`)
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
    logger.error('❌ Failed to fetch posts:', errorText)
    throw new Error(`Failed to fetch posts: ${errorText}`)
  }
  
  const data = await response.json()
  const posts = data.data || []
  
  logger.debug(`✅ Successfully fetched ${posts.length} posts`)
  return posts
}

export async function POST(request: NextRequest) {
  try {
    logger.debug('🔄 Facebook posts API called')
    
    const body = await request.json()
    const { pageId, userId } = body
    logger.debug('📝 Request body:', { pageId, userId })

    if (!pageId) {
      logger.debug('❌ Missing pageId')
      return errorResponse('Missing pageId' , 400)
    }

    // Get user's Facebook integration
    logger.debug('🔍 Getting Supabase client')
    const supabase = await createSupabaseRouteHandlerClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    logger.debug('👤 User:', user ? { id: user.id } : null)
    
    if (!user) {
      logger.debug('❌ No user found')
      return errorResponse('Unauthorized' , 401)
    }

    // Get Facebook access token
    logger.debug('🔍 Getting Facebook integration for user:', user.id)
    const { data: integration, error: integrationError } = await supabase
      .from('integrations')
      .select('access_token, refresh_token, expires_at')
      .eq('user_id', user.id)
      .eq('provider', 'facebook')
      .single()

    logger.debug('🔍 Integration result:', integration ? { hasToken: !!integration.access_token, expiresAt: integration.expires_at } : null)
    logger.debug('🔍 Integration error:', integrationError)

    if (!integration) {
      logger.debug('❌ Facebook integration not found')
      return errorResponse('Facebook integration not found' , 404)
    }

    // Check if token is expired and refresh if needed
    let userAccessToken = integration.access_token
    
    if (integration.expires_at && new Date(integration.expires_at) <= new Date()) {
      logger.debug('🔄 Token is expired, refreshing...')
      
      if (integration.refresh_token) {
        try {
          const refreshResponse = await fetch(`https://graph.facebook.com/v18.0/oauth/access_token`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
              grant_type: 'fb_exchange_token',
              client_id: process.env.FACEBOOK_CLIENT_ID!,
              client_secret: process.env.FACEBOOK_CLIENT_SECRET!,
              fb_exchange_token: integration.refresh_token,
            }),
          })

          if (refreshResponse.ok) {
            const refreshData = await refreshResponse.json()
            userAccessToken = refreshData.access_token
            logger.debug('✅ Token refreshed successfully')

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
          logger.error('❌ Error refreshing token:', error)
        }
      }
    }

    // Get posts for the specific page using the stored page access token
    let posts
    try {
      posts = await listPagePosts(pageId, userAccessToken)
    } catch (error) {
      logger.error('❌ Error fetching posts:', error)
      return errorResponse('Failed to fetch posts from the page.', 500, { details: error instanceof Error ? error.message : 'Unknown error'
       })
    }

    // Format posts for the dropdown
    const formattedPosts = posts.map((post: any) => ({
      value: post.id,
      label: post.message 
        ? `${post.message.substring(0, 50)}${post.message.length > 50 ? '...' : ''} (${new Date(post.created_time).toLocaleDateString()})`
        : `Post ${post.id} (${new Date(post.created_time).toLocaleDateString()})`
    }))

    logger.debug(`✅ Successfully formatted ${formattedPosts.length} posts`)
    return jsonResponse({ data: formattedPosts })

  } catch (error) {
    logger.error('❌ Error fetching Facebook posts:', error)
    logger.error('❌ Error stack:', error instanceof Error ? error.stack : 'No stack trace')
    return errorResponse('Internal server error' , 500)
  }
} 