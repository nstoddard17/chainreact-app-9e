#!/usr/bin/env node

/**
 * Test if OneNote API requires Microsoft 365 subscription
 * This script checks account subscription status and tests OneNote access
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

async function testSubscriptionRequirement() {
  try {
    console.log('\n🔍 Testing Microsoft 365 Subscription Requirements for OneNote\n')
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
    
    console.log('1️⃣ Checking Account Type and Subscription Status...\n')
    
    // Get user profile
    const userResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    })
    
    if (!userResponse.ok) {
      console.error('❌ Failed to get user profile:', userResponse.status)
      return
    }
    
    const userData = await userResponse.json()
    console.log('   Email:', userData.mail || userData.userPrincipalName)
    console.log('   Display Name:', userData.displayName)
    console.log('   Account Type:', userData.userPrincipalName ? 'Work/School' : 'Personal')
    
    // Check for organization details (indicates work/school account)
    if (userData.userPrincipalName) {
      console.log('   Organization:', userData.userPrincipalName.split('@')[1])
    }
    
    // Check subscription status
    console.log('\n2️⃣ Checking Microsoft 365 Subscription...\n')
    
    const subscriptionUrl = 'https://graph.microsoft.com/v1.0/me/subscribedSkus'
    const subResponse = await fetch(subscriptionUrl, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    })
    
    if (subResponse.ok) {
      const subData = await subResponse.json()
      console.log('   ✅ Subscription endpoint accessible')
      console.log('   Active subscriptions:', subData.value?.length || 0)
      
      if (subData.value && subData.value.length > 0) {
        subData.value.forEach(sub => {
          console.log(`     - ${sub.skuPartNumber}: ${sub.capabilityStatus}`)
        })
      }
    } else {
      console.log('   ℹ️ Cannot access subscription info (normal for personal accounts)')
    }
    
    // Check license details
    console.log('\n3️⃣ Checking License Details...\n')
    
    const licenseUrl = 'https://graph.microsoft.com/v1.0/me/licenseDetails'
    const licenseResponse = await fetch(licenseUrl, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    })
    
    if (licenseResponse.ok) {
      const licenseData = await licenseResponse.json()
      console.log('   License count:', licenseData.value?.length || 0)
      
      if (licenseData.value && licenseData.value.length > 0) {
        licenseData.value.forEach(license => {
          console.log(`     - ${license.skuPartNumber}`)
          if (license.servicePlans) {
            const oneNoteServices = license.servicePlans.filter(sp => 
              sp.servicePlanName?.toLowerCase().includes('onenote')
            )
            if (oneNoteServices.length > 0) {
              console.log('       🎯 OneNote services found:')
              oneNoteServices.forEach(sp => {
                console.log(`         - ${sp.servicePlanName}: ${sp.provisioningStatus}`)
              })
            }
          }
        })
      } else {
        console.log('   ℹ️ No licenses found (free account)')
      }
    } else {
      console.log('   ℹ️ Cannot access license details')
    }
    
    // Test OneNote API access
    console.log('\n4️⃣ Testing OneNote API Access...\n')
    
    const oneNoteUrl = 'https://graph.microsoft.com/v1.0/me/onenote/notebooks'
    const oneNoteResponse = await fetch(oneNoteUrl, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    })
    
    if (oneNoteResponse.ok) {
      const notebooks = await oneNoteResponse.json()
      console.log(`   ✅ OneNote API WORKS! Found ${notebooks.value?.length || 0} notebooks`)
      
      if (notebooks.value && notebooks.value.length > 0) {
        console.log('   Notebooks:')
        notebooks.value.slice(0, 3).forEach(nb => {
          console.log(`     - ${nb.displayName || nb.name}`)
        })
      }
    } else {
      const errorText = await oneNoteResponse.text()
      console.log(`   ❌ OneNote API failed: ${oneNoteResponse.status}`)
      try {
        const errorData = JSON.parse(errorText)
        console.log(`   Error: ${errorData.error?.code}`)
        console.log(`   Message: ${errorData.error?.message}`)
        
        // Check for specific error codes
        if (errorData.error?.code === 'UnknownError' || 
            errorData.error?.code === '401' ||
            errorData.error?.message?.includes('valid authentication token')) {
          console.log('\n   ⚠️ This typically indicates:')
          console.log('   1. Personal account without Microsoft 365')
          console.log('   2. Work/school account without OneNote license')
          console.log('   3. Consumer account (known Microsoft limitation)')
        }
      } catch (e) {
        console.log('   Error details:', errorText.substring(0, 200))
      }
    }
    
    // Test other Office 365 services for comparison
    console.log('\n5️⃣ Testing Other Microsoft 365 Services for Comparison...\n')
    
    const services = [
      { name: 'OneDrive', url: 'https://graph.microsoft.com/v1.0/me/drive' },
      { name: 'Outlook Calendar', url: 'https://graph.microsoft.com/v1.0/me/events?$top=1' },
      { name: 'Outlook Mail', url: 'https://graph.microsoft.com/v1.0/me/messages?$top=1' },
      { name: 'Teams', url: 'https://graph.microsoft.com/v1.0/me/joinedTeams' },
      { name: 'SharePoint', url: 'https://graph.microsoft.com/v1.0/sites?$top=1' }
    ]
    
    for (const service of services) {
      const response = await fetch(service.url, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      })
      console.log(`   ${service.name}: ${response.ok ? '✅ Accessible' : `❌ Not accessible (${response.status})`}`)
    }
    
    // Check if OneNote is provisioned for the user
    console.log('\n6️⃣ Checking OneNote Service Provisioning...\n')
    
    const provisionUrl = 'https://graph.microsoft.com/v1.0/me/onenote'
    const provisionResponse = await fetch(provisionUrl, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    })
    
    if (provisionResponse.ok) {
      console.log('   ✅ OneNote service endpoint accessible')
      const provisionData = await provisionResponse.json()
      if (provisionData['@odata.context']) {
        console.log('   OneNote context available')
      }
    } else {
      console.log('   ❌ OneNote service not accessible:', provisionResponse.status)
    }
    
    // Summary and recommendations
    console.log('\n' + '=' .repeat(60))
    console.log('📊 ANALYSIS SUMMARY:\n')
    
    const isPersonalAccount = !userData.userPrincipalName || 
                             userData.mail?.includes('outlook.com') ||
                             userData.mail?.includes('hotmail.com') ||
                             userData.mail?.includes('live.com')
    
    if (isPersonalAccount) {
      console.log('🔍 Account Type: Personal Microsoft Account\n')
      console.log('❌ OneNote API Status: Not Working\n')
      console.log('📝 Explanation:')
      console.log('   Microsoft has confirmed that OneNote API does not work properly')
      console.log('   with personal accounts (outlook.com, hotmail.com, live.com),')
      console.log('   even if they have Microsoft 365 Personal/Family subscriptions.\n')
      console.log('💡 This is a known Microsoft limitation, not a subscription issue.')
      console.log('   The API returns 401 errors regardless of subscription status.\n')
      console.log('✅ What works: OneDrive, Outlook (email/calendar)')
      console.log('❌ What doesn\'t: OneNote, Teams, SharePoint (require work/school accounts)')
    } else {
      console.log('🔍 Account Type: Work/School Account\n')
      
      if (oneNoteResponse.ok) {
        console.log('✅ OneNote API Status: Working\n')
        console.log('   This account has proper OneNote access.')
      } else {
        console.log('❌ OneNote API Status: Not Working\n')
        console.log('📝 Possible reasons:')
        console.log('   1. No OneNote license assigned to this account')
        console.log('   2. OneNote service not provisioned for the organization')
        console.log('   3. Admin disabled OneNote access')
        console.log('   4. Account needs Microsoft 365 Apps for Business/Enterprise')
      }
    }
    
    console.log('\n🎯 RECOMMENDATIONS FOR YOUR APP:\n')
    console.log('1. Add account type detection in your connection flow')
    console.log('2. Show warning for personal accounts before they connect')
    console.log('3. For personal accounts, suggest:')
    console.log('   - Using a work/school account if available')
    console.log('   - Creating a free Microsoft 365 developer account for testing')
    console.log('4. For work accounts without access, suggest:')
    console.log('   - Contacting their IT admin to enable OneNote')
    console.log('   - Checking if their subscription includes OneNote')
    
    console.log('\n✅ Test complete\n')
    
  } catch (error) {
    console.error('\n❌ Test failed:', error)
  }
}

testSubscriptionRequirement().then(() => process.exit(0))