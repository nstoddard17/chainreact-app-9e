#!/usr/bin/env node

/**
 * Test OneNote after fresh reconnection
 * This will check if the new token has the right permissions
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

async function testFreshOneNoteConnection() {
  try {
    console.log('\n🔄 Testing Fresh OneNote Connection\n')
    console.log('=' .repeat(60))
    
    // Get the most recent OneNote integration
    console.log('1️⃣ Fetching latest OneNote integration...')
    const { data: integrations, error } = await supabase
      .from('integrations')
      .select('*')
      .in('provider', ['onenote', 'microsoft-onenote'])
      .order('updated_at', { ascending: false })
      .limit(1)
    
    if (error || !integrations || integrations.length === 0) {
      console.error('❌ No OneNote integrations found')
      console.log('\n📝 Please reconnect OneNote first, then run this test again')
      return
    }
    
    const integration = integrations[0]
    console.log('✅ Found integration:')
    console.log('   ID:', integration.id)
    console.log('   Provider:', integration.provider)
    console.log('   Status:', integration.status)
    console.log('   Updated:', new Date(integration.updated_at).toLocaleString())
    
    // Check how recently it was updated
    const minutesAgo = (Date.now() - new Date(integration.updated_at).getTime()) / 1000 / 60
    if (minutesAgo > 5) {
      console.log(`\n⚠️  This integration was updated ${minutesAgo.toFixed(1)} minutes ago`)
      console.log('   If you just reconnected, there might be a sync issue')
    } else {
      console.log(`\n✅ Integration was updated ${minutesAgo.toFixed(1)} minutes ago (fresh!)`)
    }
    
    // Check stored scopes
    if (integration.scopes) {
      console.log('\n2️⃣ Checking stored scopes...')
      console.log('   Scopes in database:', integration.scopes)
      const hasNotesScope = integration.scopes.some(s => s.includes('Notes'))
      console.log('   Has Notes scope:', hasNotesScope ? '✅ YES' : '❌ NO')
    }
    
    // Decrypt the token
    console.log('\n3️⃣ Decrypting access token...')
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
        console.log('   ⚠️ Failed to decrypt, using as-is')
        return encryptedData
      }
    }
    
    const accessToken = decrypt(integration.access_token)
    console.log('   Token length:', accessToken.length)
    
    // Check if it's a JWT and decode it
    const tokenParts = accessToken.split('.')
    if (tokenParts.length === 3) {
      console.log('   Token type: JWT')
      try {
        const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString())
        console.log('   Token audience:', payload.aud)
        console.log('   Token scopes:', payload.scp || 'Not in token')
        if (payload.scp) {
          const scopes = payload.scp.split(' ')
          console.log('   Decoded scopes:')
          scopes.forEach(scope => {
            const icon = scope.includes('Notes') ? '✅' : '  '
            console.log(`     ${icon} ${scope}`)
          })
        }
      } catch (e) {
        console.log('   Could not decode JWT payload')
      }
    } else {
      console.log('   Token type: Opaque')
    }
    
    // Test API endpoints
    console.log('\n4️⃣ Testing Microsoft Graph API endpoints...')
    console.log('-'.repeat(60))
    
    async function testEndpoint(url, description) {
      process.stdout.write(`   ${description}... `)
      
      try {
        const response = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          }
        })
        
        if (response.ok) {
          const data = await response.json()
          if (data.value !== undefined) {
            console.log(`✅ Success! Found ${data.value.length} items`)
            return { success: true, count: data.value.length, data: data.value }
          } else {
            console.log(`✅ Success!`)
            return { success: true, data }
          }
        } else {
          const errorText = await response.text()
          let errorMsg = `❌ Failed (${response.status})`
          try {
            const errorData = JSON.parse(errorText)
            if (errorData.error?.message) {
              errorMsg += ` - ${errorData.error.message.substring(0, 50)}...`
            }
          } catch (e) {}
          console.log(errorMsg)
          return { success: false, status: response.status, error: errorText }
        }
      } catch (error) {
        console.log(`❌ Network error: ${error.message}`)
        return { success: false, error: error.message }
      }
    }
    
    // Test endpoints in order
    const userResult = await testEndpoint('https://graph.microsoft.com/v1.0/me', 'User Profile')
    const driveResult = await testEndpoint('https://graph.microsoft.com/v1.0/me/drive', 'OneDrive')
    const oneNoteResult = await testEndpoint('https://graph.microsoft.com/v1.0/me/onenote', 'OneNote Service')
    const notebooksResult = await testEndpoint('https://graph.microsoft.com/v1.0/me/onenote/notebooks', 'OneNote Notebooks')
    
    // If notebooks work, try to get sections
    if (notebooksResult.success && notebooksResult.data && notebooksResult.data.length > 0) {
      console.log('\n5️⃣ Found notebooks! Testing sections...')
      const firstNotebook = notebooksResult.data[0]
      console.log(`   Using notebook: ${firstNotebook.displayName || firstNotebook.name}`)
      
      const sectionsUrl = `https://graph.microsoft.com/v1.0/me/onenote/notebooks/${firstNotebook.id}/sections`
      const sectionsResult = await testEndpoint(sectionsUrl, 'Notebook Sections')
      
      if (sectionsResult.success && sectionsResult.data && sectionsResult.data.length > 0) {
        console.log('\n6️⃣ Found sections! Testing pages...')
        const firstSection = sectionsResult.data[0]
        console.log(`   Using section: ${firstSection.displayName || firstSection.name}`)
        
        const pagesUrl = `https://graph.microsoft.com/v1.0/me/onenote/sections/${firstSection.id}/pages`
        await testEndpoint(pagesUrl, 'Section Pages')
      }
    }
    
    // Summary
    console.log('\n' + '=' .repeat(60))
    console.log('📊 SUMMARY:\n')
    
    if (notebooksResult.success) {
      console.log('✅ OneNote API is working!')
      console.log(`   - Found ${notebooksResult.count || 0} notebooks`)
      if (notebooksResult.data && notebooksResult.data.length > 0) {
        console.log('   - Notebooks:')
        notebooksResult.data.slice(0, 3).forEach(nb => {
          console.log(`     • ${nb.displayName || nb.name}`)
        })
      }
      console.log('\n🎉 Your OneNote integration is now properly configured!')
    } else {
      console.log('❌ OneNote API is still not working')
      console.log('\nPossible issues:')
      console.log('1. Token might be cached - try clearing browser cookies and reconnecting')
      console.log('2. Azure AD changes might not have propagated yet (wait 5-10 minutes)')
      console.log('3. The app might need admin consent in your organization')
      console.log('4. Try disconnecting and reconnecting OneNote one more time')
    }
    
    console.log('\n✅ Test complete\n')
    
  } catch (error) {
    console.error('\n❌ Test failed:', error)
  }
}

// Run the test
testFreshOneNoteConnection().then(() => process.exit(0))