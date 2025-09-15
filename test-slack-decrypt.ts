// Test script to verify Slack token decryption
import { createClient } from '@supabase/supabase-js'
import { safeDecrypt } from './lib/security/encryption'
import { config } from 'dotenv'

// Load environment variables
config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseKey)

async function testSlackDecryption() {
  console.log('🔍 Testing Slack token decryption...\n')
  
  try {
    // Get a Slack integration
    const { data: integrations, error } = await supabase
      .from('integrations')
      .select('*')
      .eq('provider', 'slack')
      .limit(1)
    
    if (error || !integrations || integrations.length === 0) {
      console.error('❌ No Slack integrations found')
      return
    }
    
    const integration = integrations[0]
    console.log('✅ Found Slack integration')
    console.log('  - Token encrypted:', integration.access_token.includes(':'))
    
    // Get the encryption key from environment
    const encryptionKey = process.env.ENCRYPTION_KEY || "0123456789abcdef0123456789abcdef"
    
    // Decrypt the token
    const decryptedToken = safeDecrypt(integration.access_token, encryptionKey)
    console.log('\n✅ Token decrypted')
    console.log('  - Format:', decryptedToken.substring(0, 5))
    console.log('  - Length:', decryptedToken.length)
    
    // Test with Slack API
    console.log('\n📡 Testing Slack API...')
    const response = await fetch('https://slack.com/api/auth.test', {
      headers: {
        'Authorization': `Bearer ${decryptedToken}`,
      }
    })
    
    const data = await response.json()
    console.log('Auth test result:', {
      ok: data.ok,
      error: data.error,
      team: data.team,
      user: data.user
    })
    
    if (data.ok) {
      // Try to get channels
      const channelsRes = await fetch(
        'https://slack.com/api/conversations.list?types=public_channel,private_channel&limit=5',
        {
          headers: {
            'Authorization': `Bearer ${decryptedToken}`,
          }
        }
      )
      
      const channelsData = await channelsRes.json()
      console.log('\nChannels result:', {
        ok: channelsData.ok,
        error: channelsData.error,
        count: channelsData.channels?.length || 0
      })
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error)
  }
}

testSlackDecryption()