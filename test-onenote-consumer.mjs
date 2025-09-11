#!/usr/bin/env node

/**
 * Test if this is a Microsoft consumer account vs work account issue
 * Consumer accounts (gmail.com, outlook.com) might need different handling
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

async function testConsumerAccount() {
  try {
    console.log('\n🔍 Testing Microsoft Account Type & OneNote Access\n')
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
    
    // Decrypt token
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
    
    // Check account type
    console.log('1️⃣ Checking Microsoft Account Type...')
    const userResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    })
    
    if (userResponse.ok) {
      const userData = await userResponse.json()
      console.log('   Email:', userData.mail || userData.userPrincipalName)
      console.log('   ID:', userData.id)
      
      // Check if it's a consumer account
      const isConsumer = userData.userPrincipalName?.includes('gmail.com') || 
                        userData.mail?.includes('gmail.com') ||
                        userData.userPrincipalName?.includes('outlook.com') ||
                        userData.userPrincipalName?.includes('hotmail.com') ||
                        userData.userPrincipalName?.includes('live.com')
      
      if (isConsumer) {
        console.log('   Account Type: 🏠 Microsoft Consumer Account (Personal)')
        console.log('\n   ⚠️  IMPORTANT: Consumer accounts might need special handling!')
      } else {
        console.log('   Account Type: 🏢 Microsoft Work/School Account')
      }
    }
    
    // Test different API versions and endpoints
    console.log('\n2️⃣ Testing Various OneNote API Approaches...')
    console.log('-'.repeat(60))
    
    const endpoints = [
      // Standard Graph API
      { url: 'https://graph.microsoft.com/v1.0/me/onenote/notebooks', desc: 'Graph v1.0 (Standard)' },
      { url: 'https://graph.microsoft.com/beta/me/onenote/notebooks', desc: 'Graph Beta' },
      
      // Without /me prefix (using delegated permissions differently)
      { url: 'https://graph.microsoft.com/v1.0/users/me/onenote/notebooks', desc: 'Users/me path' },
      
      // Try with specific user ID
      { url: `https://graph.microsoft.com/v1.0/users/555d08fd46099096/onenote/notebooks`, desc: 'Direct user ID' },
      
      // Legacy consumer endpoints
      { url: 'https://www.onenote.com/api/v1.0/me/notes/notebooks', desc: 'Legacy Consumer API v1.0' },
      { url: 'https://www.onenote.com/api/beta/me/notes/notebooks', desc: 'Legacy Consumer API Beta' },
    ]
    
    let workingEndpoint = null
    
    for (const endpoint of endpoints) {
      process.stdout.write(`   ${endpoint.desc}... `)
      
      const response = await fetch(endpoint.url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      })
      
      if (response.ok) {
        const data = await response.json()
        console.log(`✅ WORKS! Found ${data.value?.length || data.length || 0} notebooks`)
        workingEndpoint = endpoint
        break
      } else {
        console.log(`❌ ${response.status}`)
      }
    }
    
    // If nothing works, try creating a new notebook to test write permissions
    if (!workingEndpoint) {
      console.log('\n3️⃣ Testing if we can create a notebook...')
      
      const createResponse = await fetch('https://graph.microsoft.com/v1.0/me/onenote/notebooks', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          displayName: `ChainReact Test ${Date.now()}`
        })
      })
      
      if (createResponse.ok) {
        console.log('   ✅ Created notebook successfully!')
        console.log('   This means write permissions work but read might be broken')
      } else {
        console.log('   ❌ Cannot create notebook either')
      }
    }
    
    // Check if it's a tenant restriction issue
    console.log('\n4️⃣ Checking for tenant restrictions...')
    
    const tenantResponse = await fetch('https://graph.microsoft.com/v1.0/organization', {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    })
    
    if (tenantResponse.ok) {
      const orgData = await tenantResponse.json()
      if (orgData.value && orgData.value.length > 0) {
        console.log('   Organization:', orgData.value[0].displayName)
        console.log('   Tenant ID:', orgData.value[0].id)
        console.log('   ⚠️  This is an organizational account, OneNote might be restricted')
      } else {
        console.log('   No organization found (personal account)')
      }
    } else if (tenantResponse.status === 403) {
      console.log('   Personal Microsoft account (no organization)')
    }
    
    // Test with different auth header formats
    console.log('\n5️⃣ Testing alternative authentication methods...')
    
    // Try without Bearer prefix (some APIs accept raw token)
    const rawTokenResponse = await fetch('https://graph.microsoft.com/v1.0/me/onenote/notebooks', {
      headers: {
        'Authorization': accessToken, // No "Bearer" prefix
        'Accept': 'application/json'
      }
    })
    console.log('   Without Bearer prefix:', rawTokenResponse.ok ? '✅' : `❌ ${rawTokenResponse.status}`)
    
    // Try with X-Auth-Token header
    const xAuthResponse = await fetch('https://graph.microsoft.com/v1.0/me/onenote/notebooks', {
      headers: {
        'X-Auth-Token': accessToken,
        'Accept': 'application/json'
      }
    })
    console.log('   With X-Auth-Token header:', xAuthResponse.ok ? '✅' : `❌ ${xAuthResponse.status}`)
    
    // Summary and recommendations
    console.log('\n' + '=' .repeat(60))
    console.log('📋 DIAGNOSIS & RECOMMENDATIONS:\n')
    
    if (workingEndpoint) {
      console.log('✅ Found working endpoint:', workingEndpoint.desc)
      console.log('   Update the code to use this endpoint!')
    } else {
      console.log('❌ No working OneNote endpoint found')
      console.log('\nLikely causes:')
      console.log('1. Consumer account needs app to be registered differently')
      console.log('2. OneNote might be disabled for this account')
      console.log('3. Token is missing critical claims/permissions')
      console.log('4. Account type mismatch (consumer app with work account or vice versa)')
      
      console.log('\nRecommended fixes:')
      console.log('1. Register app at https://apps.dev.microsoft.com for consumer accounts')
      console.log('2. Or use Azure AD B2C for mixed account types')
      console.log('3. Check if OneNote is available in your Microsoft 365 subscription')
      console.log('4. Try using a native @outlook.com account instead of Gmail')
    }
    
    console.log('\n✅ Diagnosis complete\n')
    
  } catch (error) {
    console.error('\n❌ Test failed:', error)
  }
}

testConsumerAccount().then(() => process.exit(0))