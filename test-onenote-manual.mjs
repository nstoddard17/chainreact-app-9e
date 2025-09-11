#!/usr/bin/env node

/**
 * Manual OneNote API test with detailed debugging
 * Run with: node test-onenote-manual.mjs
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

async function manualOneNoteTest() {
  try {
    console.log('\n🔍 Manual OneNote API Test\n')
    console.log('=' .repeat(60))
    
    // Step 1: Fetch the most recent OneNote integration
    console.log('\n1️⃣ Fetching OneNote integration from database...')
    const { data: integrations, error } = await supabase
      .from('integrations')
      .select('*')
      .in('provider', ['onenote', 'microsoft-onenote'])
      .order('updated_at', { ascending: false })
      .limit(1)
    
    if (error || !integrations || integrations.length === 0) {
      console.error('❌ No OneNote integrations found')
      return
    }
    
    const integration = integrations[0]
    console.log('✅ Found integration:')
    console.log('   ID:', integration.id)
    console.log('   Provider:', integration.provider)
    console.log('   Status:', integration.status)
    console.log('   Updated:', new Date(integration.updated_at).toLocaleString())
    console.log('   Expires:', integration.expires_at ? new Date(integration.expires_at).toLocaleString() : 'N/A')
    
    // Step 2: Decrypt the token
    console.log('\n2️⃣ Decrypting access token...')
    
    const crypto = await import('crypto')
    
    function decrypt(encryptedData) {
      try {
        // Use the actual encryption key from environment
        const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "0123456789abcdef0123456789abcdef"
        // The key needs to be exactly 32 bytes for AES-256
        const key = Buffer.from(ENCRYPTION_KEY.slice(0, 32))
        
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
        // Try as plain text if decryption fails
        console.log('   ⚠️ Token appears to be plain text or decryption failed')
        return encryptedData
      }
    }
    
    const accessToken = decrypt(integration.access_token)
    console.log('✅ Token obtained (length:', accessToken.length + ')')
    
    // Step 3: Analyze token format
    console.log('\n3️⃣ Analyzing token format...')
    const tokenParts = accessToken.split('.')
    if (tokenParts.length === 3) {
      console.log('   Token is a JWT (3 parts)')
      try {
        const header = JSON.parse(Buffer.from(tokenParts[0], 'base64').toString())
        const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString())
        
        console.log('\n   📋 Token Header:')
        console.log('   Algorithm:', header.alg)
        console.log('   Type:', header.typ)
        
        console.log('\n   📋 Token Payload:')
        console.log('   Audience:', payload.aud)
        console.log('   Issuer:', payload.iss)
        console.log('   App:', payload.app_displayname || payload.appid)
        console.log('   Scopes:', payload.scp || 'Not specified')
        console.log('   Expires:', new Date(payload.exp * 1000).toLocaleString())
        
        // Check if token is expired
        const now = Date.now() / 1000
        if (payload.exp < now) {
          console.log('   ❌ TOKEN IS EXPIRED!')
        } else {
          console.log('   ✅ Token is valid for', Math.floor((payload.exp - now) / 60), 'more minutes')
        }
        
        // Check for OneNote scopes
        if (payload.scp) {
          const scopes = payload.scp.split(' ')
          const hasNotes = scopes.some(s => s.includes('Notes'))
          console.log('   Has Notes scope:', hasNotes ? '✅' : '❌')
        }
      } catch (e) {
        console.log('   Could not decode JWT:', e.message)
      }
    } else {
      console.log('   Token is opaque (not a JWT)')
      console.log('   Token preview:', accessToken.substring(0, 50) + '...')
    }
    
    // Step 4: Test basic Microsoft Graph endpoints
    console.log('\n4️⃣ Testing Microsoft Graph endpoints...')
    console.log('=' .repeat(60))
    
    async function testEndpoint(url, description) {
      console.log(`\n📍 Testing: ${description}`)
      console.log(`   URL: ${url}`)
      
      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          }
        })
        
        console.log(`   Status: ${response.status} ${response.statusText}`)
        console.log(`   Headers:`)
        const importantHeaders = ['x-ms-ags-diagnostic', 'request-id', 'client-request-id', 'www-authenticate']
        for (const header of importantHeaders) {
          const value = response.headers.get(header)
          if (value) {
            console.log(`     ${header}: ${value.substring(0, 100)}`)
          }
        }
        
        if (response.ok) {
          const data = await response.json()
          console.log('   ✅ SUCCESS!')
          if (data.value) {
            console.log(`   Result: Found ${data.value.length} items`)
          } else if (data.displayName) {
            console.log(`   Result: ${data.displayName}`)
          } else if (data.id) {
            console.log(`   Result: Resource ID: ${data.id}`)
          }
          return { success: true, data }
        } else {
          const errorText = await response.text()
          console.log('   ❌ FAILED!')
          
          try {
            const errorData = JSON.parse(errorText)
            console.log('   Error Code:', errorData.error?.code)
            console.log('   Error Message:', errorData.error?.message)
            if (errorData.error?.innerError) {
              console.log('   Inner Error:', JSON.stringify(errorData.error.innerError, null, 2))
            }
          } catch (e) {
            console.log('   Error Response:', errorText.substring(0, 200))
          }
          return { success: false, error: errorText }
        }
      } catch (error) {
        console.log('   ❌ Network Error:', error.message)
        return { success: false, error: error.message }
      }
    }
    
    // Test endpoints in order
    await testEndpoint('https://graph.microsoft.com/v1.0/me', 'User Profile')
    await testEndpoint('https://graph.microsoft.com/v1.0/me/drive', 'OneDrive')
    await testEndpoint('https://graph.microsoft.com/v1.0/me/onenote', 'OneNote Service Root')
    await testEndpoint('https://graph.microsoft.com/v1.0/me/onenote/notebooks', 'OneNote Notebooks')
    
    // Step 5: Try different authentication methods
    console.log('\n5️⃣ Testing alternative authentication methods...')
    console.log('=' .repeat(60))
    
    // Try with different auth header format
    console.log('\n📍 Testing with lowercase "bearer"...')
    const response1 = await fetch('https://graph.microsoft.com/v1.0/me/onenote/notebooks', {
      headers: {
        'authorization': `bearer ${accessToken}`, // lowercase
        'Accept': 'application/json'
      }
    })
    console.log('   Status:', response1.status)
    
    // Try without Content-Type
    console.log('\n📍 Testing without Content-Type header...')
    const response2 = await fetch('https://graph.microsoft.com/v1.0/me/onenote/notebooks', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    })
    console.log('   Status:', response2.status)
    
    // Step 6: Check if we need token refresh
    console.log('\n6️⃣ Checking token refresh...')
    console.log('=' .repeat(60))
    
    if (integration.refresh_token) {
      console.log('✅ Refresh token available')
      
      const clientId = process.env.ONENOTE_CLIENT_ID || process.env.MICROSOFT_CLIENT_ID
      const clientSecret = process.env.ONENOTE_CLIENT_SECRET || process.env.MICROSOFT_CLIENT_SECRET
      
      if (!clientId || !clientSecret) {
        console.log('❌ OAuth credentials not found in environment')
      } else {
        console.log('✅ OAuth credentials found')
        console.log('\n🔄 Attempting token refresh...')
        
        const refreshToken = decrypt(integration.refresh_token)
        
        const refreshResponse = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
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
        
        console.log('   Refresh Status:', refreshResponse.status)
        
        if (refreshResponse.ok) {
          const newTokenData = await refreshResponse.json()
          console.log('   ✅ Token refreshed successfully!')
          
          // Test with new token
          console.log('\n   Testing OneNote with refreshed token...')
          const testResponse = await fetch('https://graph.microsoft.com/v1.0/me/onenote/notebooks', {
            headers: {
              'Authorization': `Bearer ${newTokenData.access_token}`,
              'Accept': 'application/json'
            }
          })
          
          console.log('   Status:', testResponse.status)
          if (testResponse.ok) {
            const data = await testResponse.json()
            console.log('   ✅ SUCCESS with new token! Found', data.value?.length || 0, 'notebooks')
            
            // Offer to update the database
            console.log('\n   💾 Would you like to update the database with the new token?')
            console.log('   Run: node test-onenote-manual.mjs --update-token')
          } else {
            const error = await testResponse.text()
            console.log('   ❌ Still failing with new token')
            console.log('   Error:', error.substring(0, 200))
          }
        } else {
          const error = await refreshResponse.text()
          console.log('   ❌ Token refresh failed')
          console.log('   Error:', error.substring(0, 200))
        }
      }
    } else {
      console.log('❌ No refresh token available')
    }
    
    console.log('\n' + '=' .repeat(60))
    console.log('✅ Test complete\n')
    
  } catch (error) {
    console.error('\n❌ Test failed:', error)
  }
}

// Run the test
manualOneNoteTest().then(() => process.exit(0))