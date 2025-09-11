#!/usr/bin/env node

/**
 * Test using the 'consumers' tenant endpoint for consumer accounts
 * Microsoft has different tenant endpoints: common, organizations, consumers
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

dotenv.config({ path: join(__dirname, '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

async function testConsumerTenant() {
  try {
    console.log('\n🔍 Testing Consumer Tenant Configuration\n')
    console.log('=' .repeat(60))
    
    // Get integration
    const { data: integrations } = await supabase
      .from('integrations')
      .select('*')
      .in('provider', ['onenote', 'microsoft-onenote'])
      .order('updated_at', { ascending: false })
      .limit(1)
    
    if (!integrations || integrations.length === 0) {
      console.error('❌ No OneNote integrations found')
      return
    }
    
    const integration = integrations[0]
    
    // Decrypt tokens
    const crypto = await import('crypto')
    function decrypt(encryptedData) {
      try {
        const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "0123456789abcdef0123456789abcdef"
        const key = Buffer.from(ENCRYPTION_KEY.slice(0, 32))
        const parts = encryptedData.split(':')
        if (parts.length !== 2) return encryptedData
        const iv = Buffer.from(parts[0], 'hex')
        const encrypted = Buffer.from(parts[1], 'hex')
        const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv)
        let decrypted = decipher.update(encrypted)
        decrypted = Buffer.concat([decrypted, decipher.final()])
        return decrypted.toString()
      } catch (error) {
        return encryptedData
      }
    }
    
    const accessToken = decrypt(integration.access_token)
    const refreshToken = decrypt(integration.refresh_token)
    
    console.log('1️⃣ Current token status...')
    console.log('   Has access token:', !!accessToken)
    console.log('   Has refresh token:', !!refreshToken)
    console.log('   Stored scopes:', integration.scopes?.join(', '))
    
    // Test current token
    console.log('\n2️⃣ Testing current token with OneNote API...')
    const testResponse = await fetch('https://graph.microsoft.com/v1.0/me/onenote/notebooks', {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    })
    console.log('   Current token OneNote access:', testResponse.ok ? '✅' : `❌ ${testResponse.status}`)
    
    // Try refreshing with different tenant endpoints
    console.log('\n3️⃣ Testing token refresh with different tenant endpoints...')
    
    const clientId = process.env.ONENOTE_CLIENT_ID || process.env.MICROSOFT_CLIENT_ID
    const clientSecret = process.env.ONENOTE_CLIENT_SECRET || process.env.MICROSOFT_CLIENT_SECRET
    
    if (!clientId || !clientSecret) {
      console.error('❌ OAuth credentials not found')
      return
    }
    
    const tenantEndpoints = [
      { name: 'Common (current)', url: 'https://login.microsoftonline.com/common/oauth2/v2.0/token' },
      { name: 'Consumers', url: 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token' },
      { name: 'Organizations', url: 'https://login.microsoftonline.com/organizations/oauth2/v2.0/token' }
    ]
    
    for (const endpoint of tenantEndpoints) {
      console.log(`\n   Testing: ${endpoint.name}`)
      console.log(`   URL: ${endpoint.url}`)
      
      try {
        const refreshResponse = await fetch(endpoint.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: refreshToken,
            grant_type: 'refresh_token',
            scope: 'offline_access https://graph.microsoft.com/User.Read https://graph.microsoft.com/Notes.ReadWrite.All https://graph.microsoft.com/Files.Read'
          }),
        })
        
        if (refreshResponse.ok) {
          const tokenData = await refreshResponse.json()
          console.log('   ✅ Token refresh successful!')
          console.log('   Token type:', tokenData.token_type)
          console.log('   Scopes returned:', tokenData.scope)
          
          // Test the new token with OneNote
          const oneNoteTest = await fetch('https://graph.microsoft.com/v1.0/me/onenote/notebooks', {
            headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
          })
          
          if (oneNoteTest.ok) {
            const notebooks = await oneNoteTest.json()
            console.log(`   ✅ OneNote API WORKS with this tenant! Found ${notebooks.value?.length || 0} notebooks`)
            
            if (notebooks.value && notebooks.value.length > 0) {
              console.log('   Notebooks:')
              notebooks.value.slice(0, 3).forEach(nb => {
                console.log(`     - ${nb.displayName || nb.name}`)
              })
            }
            
            // If this works, save the configuration
            console.log('\n   🎉 SOLUTION FOUND!')
            console.log(`   Use tenant endpoint: ${endpoint.url}`)
            console.log('   Update your OAuth configuration to use this endpoint')
            
            break // Found working configuration
          } else {
            const errorText = await oneNoteTest.text()
            console.log(`   ❌ OneNote still fails: ${oneNoteTest.status}`)
            try {
              const errorData = JSON.parse(errorText)
              console.log(`   Error: ${errorData.error?.code}: ${errorData.error?.message?.substring(0, 50)}...`)
            } catch (e) {}
          }
        } else {
          const errorText = await refreshResponse.text()
          console.log(`   ❌ Token refresh failed: ${refreshResponse.status}`)
          try {
            const errorData = JSON.parse(errorText)
            console.log(`   Error: ${errorData.error}: ${errorData.error_description?.substring(0, 50)}...`)
          } catch (e) {}
        }
      } catch (error) {
        console.log(`   ❌ Request failed: ${error.message}`)
      }
    }
    
    // Try a completely fresh authentication with consumers tenant
    console.log('\n4️⃣ Recommendation for fresh authentication...')
    console.log('   To use the consumers tenant for new authentications:')
    console.log('   1. Update OAuth authorize URL:')
    console.log('      FROM: https://login.microsoftonline.com/common/oauth2/v2.0/authorize')
    console.log('      TO:   https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize')
    console.log('   2. Update token exchange URL:')
    console.log('      FROM: https://login.microsoftonline.com/common/oauth2/v2.0/token')
    console.log('      TO:   https://login.microsoftonline.com/consumers/oauth2/v2.0/token')
    console.log('   3. This will restrict authentication to personal Microsoft accounts only')
    
    // Test with different API versions
    console.log('\n5️⃣ Testing different API versions...')
    const apiVersions = [
      'v1.0',
      'beta'
    ]
    
    for (const version of apiVersions) {
      const url = `https://graph.microsoft.com/${version}/me/onenote/notebooks`
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      })
      console.log(`   ${version}: ${response.ok ? '✅' : `❌ ${response.status}`}`)
    }
    
    console.log('\n' + '=' .repeat(60))
    console.log('✅ Test complete\n')
    
  } catch (error) {
    console.error('\n❌ Test failed:', error)
  }
}

testConsumerTenant().then(() => process.exit(0))