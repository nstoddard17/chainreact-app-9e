// Test the Slack data API route
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

import { logger } from '@/lib/utils/logger'

config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

async function testSlackAPI() {
  logger.debug('🔍 Testing Slack API route...\n')
  
  try {
    // Get Slack integration ID
    const { data: integrations } = await supabase
      .from('integrations')
      .select('id')
      .eq('provider', 'slack')
      .limit(1)
    
    if (!integrations || integrations.length === 0) {
      logger.error('No Slack integration found')
      return
    }
    
    const integrationId = integrations[0].id
    logger.debug('Using integration ID:', integrationId)
    
    // Call the API route
    const response = await fetch('http://localhost:3000/api/integrations/slack/data', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        integrationId,
        dataType: 'slack_channels',
        options: {}
      })
    })
    
    const responseText = await response.text()
    logger.debug('\nResponse status:', response.status)
    logger.debug('Raw response:', responseText.substring(0, 500))
    
    try {
      const data = JSON.parse(responseText)
      if (data.success) {
        logger.debug('\n✅ Channels loaded successfully!')
        logger.debug('Channel count:', data.data?.length || 0)
        logger.debug('Sample channels:', data.data?.slice(0, 3).map((c: any) => c.name))
      } else {
        logger.debug('\n❌ Failed to load channels:', data.error)
      }
    } catch (e) {
      logger.error('Failed to parse response as JSON')
    }
    
  } catch (error) {
    logger.error('Test failed:', error)
  }
}

testSlackAPI()