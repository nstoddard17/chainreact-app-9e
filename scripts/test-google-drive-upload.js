const { createClient } = require('@supabase/supabase-js')

// Load environment variables
require('dotenv').config()

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function testGoogleDriveUpload() {
  try {
    console.log('🔍 Testing Google Drive integration...')
    
    // Get a Google Drive integration
    const { data: integrations, error } = await supabase
      .from('integrations')
      .select('*')
      .eq('provider', 'google-drive')
      .eq('status', 'connected')
      .limit(1)
    
    if (error) {
      console.error('❌ Error fetching integrations:', error)
      return
    }
    
    if (!integrations || integrations.length === 0) {
      console.log('❌ No Google Drive integrations found')
      return
    }
    
    const integration = integrations[0]
    console.log('✅ Found Google Drive integration:', {
      id: integration.id,
      userId: integration.user_id,
      hasAccessToken: !!integration.access_token,
      hasRefreshToken: !!integration.refresh_token,
      expiresAt: integration.expires_at,
      scopes: integration.scopes,
      accessTokenLength: integration.access_token?.length || 0,
      isEncrypted: integration.access_token?.includes(':') || false
    })
    
    // Check if token is expired
    if (integration.expires_at) {
      const expiresAt = new Date(integration.expires_at)
      const now = new Date()
      const isExpired = expiresAt < now
      const minutesUntilExpiry = Math.floor((expiresAt - now) / (1000 * 60))
      
      console.log('⏰ Token expiry info:', {
        expiresAt: expiresAt.toISOString(),
        isExpired,
        minutesUntilExpiry: isExpired ? 'EXPIRED' : minutesUntilExpiry
      })
    }
    
    // Test basic API connectivity with a simple GET request
    console.log('🔍 Testing Google Drive API connectivity...')
    
    const response = await fetch('https://www.googleapis.com/drive/v3/about?fields=user', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${integration.access_token}`,
        'Content-Type': 'application/json'
      }
    })
    
    console.log('📥 API Response status:', response.status)
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error('❌ Google Drive API error:', errorText)
      
      try {
        const error = JSON.parse(errorText)
        console.error('❌ Parsed error:', error)
        
        if (error.error?.code === 401) {
          console.log('🔑 Token appears to be invalid or expired')
        }
      } catch (e) {
        console.error('❌ Raw error response:', errorText)
      }
    } else {
      const result = await response.json()
      console.log('✅ API connectivity successful!')
      console.log('👤 User info:', result.user)
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error)
  }
}

// Run the test
testGoogleDriveUpload() 