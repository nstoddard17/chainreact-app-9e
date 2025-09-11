#!/usr/bin/env node

/**
 * Deep OneNote API investigation
 * Tests various hypotheses for why OneNote API keeps returning 401
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

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function deepOneNoteInvestigation() {
  try {
    console.log('\n🔬 Deep OneNote API Investigation\n')
    console.log('=' .repeat(60))
    
    // Fetch integration
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
    
    // Decrypt token
    const crypto = await import('crypto')
    function decrypt(encryptedData) {
      try {
        const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "0123456789abcdef0123456789abcdef"
        const key = Buffer.from(ENCRYPTION_KEY.slice(0, 32))
        const parts = encryptedData.split(':')
        if (parts.length !== 2) throw new Error('Invalid format')
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
    console.log('Token obtained, length:', accessToken.length)
    
    // Test 1: Check account type via user profile
    console.log('\n1️⃣ Checking account type...')
    const userResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    })
    
    if (userResponse.ok) {
      const userData = await userResponse.json()
      console.log('   Display Name:', userData.displayName)
      console.log('   User Principal Name:', userData.userPrincipalName || 'N/A (Personal account)')
      console.log('   Mail:', userData.mail || 'N/A')
      console.log('   ID:', userData.id)
      
      // Check if it's a personal account
      const isPersonal = !userData.userPrincipalName || userData.userPrincipalName.includes('#EXT#')
      console.log('   Account Type:', isPersonal ? '👤 Personal Microsoft Account' : '🏢 Work/School Account')
      
      if (isPersonal) {
        console.log('\n   ⚠️ IMPORTANT: Personal accounts use different OneNote endpoints!')
      }
    }
    
    // Test 2: Try alternative OneNote API endpoints
    console.log('\n2️⃣ Testing alternative OneNote endpoints...')
    
    const endpoints = [
      // Standard Graph API endpoints
      { url: 'https://graph.microsoft.com/v1.0/me/onenote/notebooks', desc: 'Graph v1.0' },
      { url: 'https://graph.microsoft.com/beta/me/onenote/notebooks', desc: 'Graph Beta' },
      
      // Try without /me (using direct user ID if we have it)
      { url: 'https://graph.microsoft.com/v1.0/users/me/onenote/notebooks', desc: 'Users/me path' },
      
      // Legacy OneNote API endpoints (for personal accounts)
      { url: 'https://www.onenote.com/api/v1.0/me/notes/notebooks', desc: 'Legacy OneNote.com API' },
      { url: 'https://www.onenote.com/api/beta/me/notes/notebooks', desc: 'Legacy OneNote.com Beta' },
    ]
    
    for (const endpoint of endpoints) {
      console.log(`\n   Testing: ${endpoint.desc}`)
      console.log(`   URL: ${endpoint.url}`)
      
      const response = await fetch(endpoint.url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      })
      
      if (response.ok) {
        const data = await response.json()
        console.log(`   ✅ SUCCESS! Found ${data.value?.length || data.length || 0} notebooks`)
        if (data.value?.[0] || data[0]) {
          const notebook = data.value?.[0] || data[0]
          console.log(`   First notebook: ${notebook.displayName || notebook.name}`)
        }
        break // Stop testing if we found a working endpoint
      } else {
        console.log(`   ❌ Failed: ${response.status}`)
        if (response.status === 401) {
          const error = await response.text()
          try {
            const errorData = JSON.parse(error)
            console.log(`   Error: ${errorData.error?.code || 'Unknown'}`)
          } catch (e) {
            // Not JSON
          }
        }
      }
    }
    
    // Test 3: Check token claims
    console.log('\n3️⃣ Analyzing token claims...')
    
    // Try to decode as JWT
    const tokenParts = accessToken.split('.')
    if (tokenParts.length === 3) {
      try {
        const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString())
        console.log('   Token is JWT')
        console.log('   Audience:', payload.aud)
        console.log('   Scopes:', payload.scp || 'Not specified')
        console.log('   App ID:', payload.appid)
        console.log('   Tenant:', payload.tid || 'Common')
      } catch (e) {
        console.log('   Could not decode JWT')
      }
    } else {
      console.log('   Token is opaque (not JWT)')
      
      // For opaque tokens, try to introspect
      console.log('\n   Attempting token introspection...')
      const introspectResponse = await fetch('https://graph.microsoft.com/v1.0/me/oauth2PermissionGrants', {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      })
      
      if (introspectResponse.ok) {
        const grants = await introspectResponse.json()
        console.log('   Permission grants found:', grants.value?.length || 0)
        if (grants.value?.[0]) {
          console.log('   Scopes granted:', grants.value[0].scope)
        }
      }
    }
    
    // Test 4: Try to create a test notebook (if we have write permissions)
    console.log('\n4️⃣ Testing notebook creation...')
    
    const createResponse = await fetch('https://graph.microsoft.com/v1.0/me/onenote/notebooks', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        displayName: 'ChainReact Test Notebook'
      })
    })
    
    if (createResponse.ok) {
      const newNotebook = await createResponse.json()
      console.log('   ✅ Successfully created notebook:', newNotebook.displayName)
      console.log('   Notebook ID:', newNotebook.id)
      
      // Try to delete it
      console.log('   Cleaning up test notebook...')
      // Note: OneNote API doesn't support DELETE, notebooks must be deleted manually
      console.log('   ⚠️ Note: Test notebook must be deleted manually from OneNote')
    } else {
      console.log('   ❌ Failed to create notebook:', createResponse.status)
      if (createResponse.status === 401) {
        console.log('   This confirms the token lacks OneNote permissions')
      }
    }
    
    // Test 5: Check if it's a scope issue
    console.log('\n5️⃣ Testing scope requirements...')
    
    // Try minimal scope endpoint first
    const minimalTest = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    })
    console.log('   User.Read scope:', minimalTest.ok ? '✅' : '❌')
    
    // Try Files scope
    const filesTest = await fetch('https://graph.microsoft.com/v1.0/me/drive/root/children', {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    })
    console.log('   Files.Read scope:', filesTest.ok ? '✅' : '❌')
    
    // Try OneNote scope
    const oneNoteTest = await fetch('https://graph.microsoft.com/v1.0/me/onenote/notebooks', {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    })
    console.log('   Notes.Read scope:', oneNoteTest.ok ? '✅' : '❌')
    
    // Test 6: Check OAuth app configuration
    console.log('\n6️⃣ OAuth App Configuration...')
    console.log('   Client ID:', process.env.ONENOTE_CLIENT_ID || process.env.MICROSOFT_CLIENT_ID || 'Not set')
    console.log('   Client ID starts with:', (process.env.ONENOTE_CLIENT_ID || process.env.MICROSOFT_CLIENT_ID || '').substring(0, 8))
    
    // Recommendations
    console.log('\n' + '=' .repeat(60))
    console.log('📋 RECOMMENDATIONS:\n')
    
    if (!oneNoteTest.ok) {
      console.log('1. The token definitely lacks OneNote permissions')
      console.log('2. Possible causes:')
      console.log('   - Azure AD app registration missing Notes.ReadWrite.All permission')
      console.log('   - User didn\'t consent to OneNote permissions during OAuth')
      console.log('   - Organization policy blocking OneNote API access')
      console.log('   - Personal account needs different API endpoints or app registration')
      console.log('\n3. Next steps:')
      console.log('   a) Verify Azure AD app has "Notes.ReadWrite.All" in API permissions')
      console.log('   b) Check if admin consent is required and granted')
      console.log('   c) Try re-registering the app with explicit OneNote permissions')
      console.log('   d) For personal accounts, consider using Live SDK app registration')
    }
    
    console.log('\n✅ Investigation complete\n')
    
  } catch (error) {
    console.error('\n❌ Investigation failed:', error)
  }
}

deepOneNoteInvestigation().then(() => process.exit(0))