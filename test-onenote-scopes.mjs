#!/usr/bin/env node

/**
 * Test script to check OneNote token scopes
 * Run with: node test-onenote-scopes.mjs
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load environment variables
dotenv.config({ path: join(__dirname, '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function testOneNoteScopes() {
  try {
    console.log('\n🔍 Testing OneNote Token Scopes...\n')
    
    // Fetch OneNote integrations
    const { data: integrations, error } = await supabase
      .from('integrations')
      .select('*')
      .in('provider', ['onenote', 'microsoft-onenote'])
      .eq('status', 'connected')
    
    if (error || !integrations || integrations.length === 0) {
      console.error('❌ No connected OneNote integrations found')
      return
    }
    
    const integration = integrations[0]
    console.log('Found integration:', integration.id)
    console.log('Provider:', integration.provider)
    
    // Import crypto for decryption
    const crypto = await import('crypto')
    
    // Decrypt function
    function decrypt(encryptedData) {
      try {
        const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-key-for-development-only-change-in-prod'
        const key = crypto.createHash('sha256').update(String(ENCRYPTION_KEY)).digest()
        
        const parts = encryptedData.split(':')
        if (parts.length !== 2) {
          throw new Error('Invalid encrypted data format')
        }
        
        const iv = Buffer.from(parts[0], 'hex')
        const encrypted = Buffer.from(parts[1], 'hex')
        
        const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv)
        let decrypted = decipher.update(encrypted)
        decrypted = Buffer.concat([decrypted, decipher.final()])
        
        return decrypted.toString()
      } catch (error) {
        // If decryption fails, token might be plain text
        return encryptedData
      }
    }
    
    const accessToken = decrypt(integration.access_token)
    console.log('\nToken preview:', accessToken.substring(0, 30) + '...')
    
    // Decode the JWT token to check scopes
    console.log('\n📋 Decoding token to check scopes...')
    
    // Parse JWT (access tokens are often JWTs)
    const tokenParts = accessToken.split('.')
    if (tokenParts.length === 3) {
      try {
        const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString())
        console.log('\nToken details:')
        console.log('- Audience (aud):', payload.aud)
        console.log('- Scopes (scp):', payload.scp)
        console.log('- App ID:', payload.app_displayname || payload.appid)
        console.log('- Expires:', new Date(payload.exp * 1000).toISOString())
        
        if (payload.scp) {
          console.log('\n✅ Token scopes:')
          const scopes = payload.scp.split(' ')
          scopes.forEach(scope => console.log(`   - ${scope}`))
          
          const hasNotesScope = scopes.some(s => s.includes('Notes'))
          if (!hasNotesScope) {
            console.log('\n❌ WARNING: Token does not have Notes.ReadWrite scope!')
            console.log('   This is why OneNote API calls are failing.')
          }
        }
      } catch (e) {
        console.log('Could not decode as JWT')
      }
    }
    
    // Test different API endpoints to see which work
    console.log('\n🔍 Testing different Microsoft Graph endpoints...\n')
    
    const endpoints = [
      { url: 'https://graph.microsoft.com/v1.0/me', name: 'User Profile' },
      { url: 'https://graph.microsoft.com/v1.0/me/drive', name: 'OneDrive' },
      { url: 'https://graph.microsoft.com/v1.0/me/onenote', name: 'OneNote Service' },
      { url: 'https://graph.microsoft.com/v1.0/me/onenote/notebooks', name: 'OneNote Notebooks' },
      { url: 'https://graph.microsoft.com/beta/me/onenote/notebooks', name: 'OneNote Notebooks (Beta)' }
    ]
    
    for (const endpoint of endpoints) {
      process.stdout.write(`Testing ${endpoint.name}... `)
      
      try {
        const response = await fetch(endpoint.url, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        })
        
        if (response.ok) {
          console.log(`✅ Success (${response.status})`)
        } else {
          const errorText = await response.text()
          let errorMsg = `❌ Failed (${response.status})`
          
          try {
            const errorData = JSON.parse(errorText)
            if (errorData.error?.code) {
              errorMsg += ` - ${errorData.error.code}: ${errorData.error.message?.substring(0, 50)}...`
            }
          } catch (e) {
            // Not JSON
          }
          
          console.log(errorMsg)
        }
      } catch (error) {
        console.log(`❌ Network error: ${error.message}`)
      }
    }
    
    // Check if we need to refresh the token
    console.log('\n🔄 Checking if token refresh would help...')
    
    if (integration.refresh_token) {
      console.log('Refresh token available: ✅')
      
      const clientId = process.env.ONENOTE_CLIENT_ID || process.env.MICROSOFT_CLIENT_ID
      const clientSecret = process.env.ONENOTE_CLIENT_SECRET || process.env.MICROSOFT_CLIENT_SECRET
      
      if (clientId && clientSecret) {
        console.log('OAuth credentials available: ✅')
        console.log('\nAttempting token refresh with correct scopes...')
        
        const refreshToken = decrypt(integration.refresh_token)
        
        const response = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: refreshToken,
            grant_type: 'refresh_token',
            scope: 'offline_access https://graph.microsoft.com/User.Read https://graph.microsoft.com/Notes.ReadWrite.All'
          }),
        })
        
        if (response.ok) {
          const data = await response.json()
          console.log('✅ Token refresh successful!')
          
          // Decode the new token
          console.log('\nNew token received, length:', data.access_token.length)
          const newTokenParts = data.access_token.split('.')
          console.log('Token parts:', newTokenParts.length)
          
          if (newTokenParts.length === 3) {
            try {
              const payload = JSON.parse(Buffer.from(newTokenParts[1], 'base64').toString())
              console.log('\nNew token scopes:', payload.scp)
            } catch (e) {
              console.log('Could not decode token payload:', e.message)
            }
          } else {
            console.log('Token is not a JWT (might be an opaque token)')
          }
          
          // Test OneNote with new token
          console.log('\nTesting OneNote with new token...')
          const testResponse = await fetch('https://graph.microsoft.com/v1.0/me/onenote/notebooks', {
            headers: {
              'Authorization': `Bearer ${data.access_token}`,
              'Content-Type': 'application/json'
            }
          })
          
          if (testResponse.ok) {
            const notebooks = await testResponse.json()
            console.log(`✅ Success! Found ${notebooks.value?.length || 0} notebooks`)
            
            // Update the integration with the new working token
            console.log('\n📝 Updating integration with new token...')
            
            // Encrypt the new tokens
            function encrypt(text) {
              const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-key-for-development-only-change-in-prod'
              const key = crypto.createHash('sha256').update(String(ENCRYPTION_KEY)).digest()
              const iv = crypto.randomBytes(16)
              const cipher = crypto.createCipheriv('aes-256-cbc', key, iv)
              let encrypted = cipher.update(text)
              encrypted = Buffer.concat([encrypted, cipher.final()])
              return iv.toString('hex') + ':' + encrypted.toString('hex')
            }
            
            const encryptedAccessToken = encrypt(data.access_token)
            const encryptedRefreshToken = data.refresh_token ? encrypt(data.refresh_token) : integration.refresh_token
            
            const expiresAt = data.expires_in
              ? new Date(Date.now() + data.expires_in * 1000).toISOString()
              : undefined
            
            const { error: updateError } = await supabase
              .from('integrations')
              .update({
                access_token: encryptedAccessToken,
                refresh_token: encryptedRefreshToken,
                expires_at: expiresAt,
                updated_at: new Date().toISOString()
              })
              .eq('id', integration.id)
            
            if (updateError) {
              console.error('❌ Failed to update integration:', updateError)
            } else {
              console.log('✅ Integration updated with new token!')
              console.log('   Token expires at:', expiresAt)
            }
          } else {
            console.log(`❌ Still failing: ${testResponse.status}`)
            const errorText = await testResponse.text()
            console.log('Error:', errorText.substring(0, 200))
          }
        } else {
          const errorText = await response.text()
          console.log('❌ Token refresh failed:', response.status)
          console.log('Error:', errorText.substring(0, 200))
        }
      }
    }
    
    console.log('\n✅ Test complete\n')
    
  } catch (error) {
    console.error('\n❌ Test failed:', error)
  }
}

// Run the test
testOneNoteScopes().then(() => process.exit(0))