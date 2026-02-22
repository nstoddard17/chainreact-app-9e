import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { jsonResponse, errorResponse } from '@/lib/utils/api-response'
import { decrypt } from '@/lib/security/encryption'

import { logger } from '@/lib/utils/logger'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY!

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return errorResponse('Unauthorized', 401)
    }

    const token = authHeader.substring(7)
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return errorResponse('Unauthorized', 401)
    }

    const { data: integration, error: integrationError } = await supabase
      .from('integrations')
      .select('*')
      .eq('user_id', user.id)
      .in('provider', ['google-drive', 'google-docs', 'google-sheets'])
      .limit(1)
      .maybeSingle()

    if (integrationError || !integration) {
      return errorResponse('Google Drive not connected', 400)
    }

    const encryptionKey = process.env.ENCRYPTION_KEY!
    const accessToken = decrypt(integration.access_token, encryptionKey)

    return jsonResponse({
      accessToken,
      provider: integration.provider
    })
  } catch (error: any) {
    logger.error('Error fetching Google Drive access token:', error)
    return errorResponse(error.message || 'Failed to fetch access token', 500)
  }
}
