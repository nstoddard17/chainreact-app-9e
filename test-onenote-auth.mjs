#!/usr/bin/env node

/**
 * Test script to debug OneNote authentication issues
 * Run with: node test-onenote-auth.mjs
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

// Import encryption utilities
async function testOneNoteAuth() {
  try {
    console.log('\n🔍 Testing OneNote Authentication...\n')
    
    // Step 1: Check environment variables
    console.log('1️⃣ Checking environment variables...')
    const clientId = process.env.ONENOTE_CLIENT_ID || process.env.MICROSOFT_CLIENT_ID
    const clientSecret = process.env.ONENOTE_CLIENT_SECRET || process.env.MICROSOFT_CLIENT_SECRET
    
    console.log('   Client ID found:', clientId ? `${clientId.substring(0, 8)}...` : '❌ MISSING')
    console.log('   Client Secret found:', clientSecret ? '✅' : '❌ MISSING')
    
    if (!clientId || !clientSecret) {
      console.error('\n❌ Missing OAuth credentials. Please set ONENOTE_CLIENT_ID and ONENOTE_CLIENT_SECRET')
      return
    }
    
    // Step 2: Fetch OneNote integrations from database
    console.log('\n2️⃣ Fetching OneNote integrations from database...')
    const { data: integrations, error } = await supabase
      .from('integrations')
      .select('*')
      .in('provider', ['onenote', 'microsoft-onenote'])
      .eq('status', 'connected')
    
    if (error) {
      console.error('   ❌ Database error:', error)
      return
    }
    
    console.log(`   Found ${integrations?.length || 0} connected OneNote integration(s)`)
    
    if (!integrations || integrations.length === 0) {
      console.log('\n⚠️ No connected OneNote integrations found. Please connect OneNote first.')
      return
    }
    
    // Step 3: Test each integration
    for (const integration of integrations) {
      console.log(`\n3️⃣ Testing integration ${integration.id}...`)
      console.log(`   Provider: ${integration.provider}`)
      console.log(`   Status: ${integration.status}`)
      console.log(`   Has access_token: ${!!integration.access_token}`)
      console.log(`   Has refresh_token: ${!!integration.refresh_token}`)
      
      // Step 4: Try to decrypt the token
      console.log('\n4️⃣ Testing token decryption...')
      
      // Import crypto for decryption
      const crypto = await import('crypto')
      
      // Decrypt function inline (matching the lib/security/encryption.ts implementation)
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
          console.error('   Decryption error:', error.message)
          throw error
        }
      }
      
      let decryptedToken
      try {
        decryptedToken = decrypt(integration.access_token)
        console.log('   ✅ Token decrypted successfully')
        console.log(`   Token preview: ${decryptedToken.substring(0, 20)}...`)
      } catch (decryptError) {
        console.error('   ❌ Failed to decrypt token:', decryptError.message)
        console.log('   Trying as plain text...')
        decryptedToken = integration.access_token
      }
      
      // Step 5: Test Microsoft Graph API directly
      console.log('\n5️⃣ Testing Microsoft Graph API...')
      
      const testEndpoints = [
        'https://graph.microsoft.com/v1.0/me',
        'https://graph.microsoft.com/v1.0/me/onenote/notebooks'
      ]
      
      for (const endpoint of testEndpoints) {
        console.log(`\n   Testing: ${endpoint}`)
        
        try {
          const response = await fetch(endpoint, {
            headers: {
              'Authorization': `Bearer ${decryptedToken}`,
              'Content-Type': 'application/json'
            }
          })
          
          console.log(`   Response status: ${response.status} ${response.statusText}`)
          
          if (response.status === 401) {
            const errorText = await response.text()
            console.log('   ❌ Authentication failed')
            console.log('   Error response:', errorText.substring(0, 200))
            
            // Try to parse error for more details
            try {
              const errorData = JSON.parse(errorText)
              console.log('   Error code:', errorData.error?.code)
              console.log('   Error message:', errorData.error?.message)
              
              if (errorData.error?.code === 'InvalidAuthenticationToken') {
                console.log('\n   🔍 Token appears to be invalid or expired')
                console.log('   Possible causes:')
                console.log('   - Token has expired (needs refresh)')
                console.log('   - Token was not properly encrypted/decrypted')
                console.log('   - Wrong OAuth scopes granted')
              }
            } catch (e) {
              // Not JSON
            }
          } else if (response.ok) {
            const data = await response.json()
            console.log('   ✅ API call successful!')
            
            if (endpoint.includes('notebooks')) {
              console.log(`   Found ${data.value?.length || 0} notebooks`)
              if (data.value && data.value.length > 0) {
                console.log('   First notebook:', data.value[0].displayName || data.value[0].name)
              }
            } else if (data.displayName) {
              console.log(`   User: ${data.displayName}`)
            }
          }
        } catch (fetchError) {
          console.error('   ❌ Request failed:', fetchError.message)
        }
      }
      
      // Step 6: Check if token needs refresh
      if (integration.expires_at) {
        console.log('\n6️⃣ Checking token expiration...')
        const expiresAt = new Date(integration.expires_at)
        const now = new Date()
        const hoursUntilExpiry = (expiresAt - now) / (1000 * 60 * 60)
        
        console.log(`   Expires at: ${expiresAt.toISOString()}`)
        console.log(`   Current time: ${now.toISOString()}`)
        
        if (hoursUntilExpiry < 0) {
          console.log(`   ❌ Token expired ${Math.abs(hoursUntilExpiry).toFixed(1)} hours ago`)
        } else if (hoursUntilExpiry < 1) {
          console.log(`   ⚠️ Token expires in ${hoursUntilExpiry.toFixed(1)} hours`)
        } else {
          console.log(`   ✅ Token valid for ${hoursUntilExpiry.toFixed(1)} more hours`)
        }
      }
    }
    
    console.log('\n✅ OneNote authentication test complete\n')
    
  } catch (error) {
    console.error('\n❌ Test failed:', error)
  }
}

// Run the test
testOneNoteAuth().then(() => process.exit(0))