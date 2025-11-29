/**
 * Check Microsoft Outlook token scopes
 * Run with: node scripts/check-microsoft-token-scopes.js
 */

const { createClient } = require('@supabase/supabase-js')
const crypto = require('crypto')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
)

// Simple decrypt function (matching your encryption)
function safeDecrypt(encryptedText) {
  try {
    if (!encryptedText) return null

    const key = process.env.ENCRYPTION_KEY || process.env.ENCRYPTION_MASTER_KEY
    if (!key) {
      console.error('No encryption key found')
      return null
    }

    const parts = encryptedText.split(':')
    if (parts.length !== 2) {
      console.error('Invalid encrypted format')
      return null
    }

    const iv = Buffer.from(parts[0], 'hex')
    const encryptedData = Buffer.from(parts[1], 'hex')

    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(key, 'hex'), iv)
    let decrypted = decipher.update(encryptedData)
    decrypted = Buffer.concat([decrypted, decipher.final()])

    return decrypted.toString()
  } catch (error) {
    console.error('Decryption error:', error.message)
    return null
  }
}

async function checkTokenScopes() {
  try {
    console.log('🔍 Checking Microsoft Outlook integration...\n')

    // Get all Microsoft integrations
    const { data: integrations, error } = await supabase
      .from('integrations')
      .select('*')
      .or('provider.like.microsoft%,provider.eq.onedrive,provider.eq.teams')

    if (error) {
      console.error('Error fetching integrations:', error)
      return
    }

    if (!integrations || integrations.length === 0) {
      console.log('❌ No Microsoft integrations found')
      return
    }

    for (const integration of integrations) {
      console.log(`\n📧 Provider: ${integration.provider}`)
      console.log(`   Status: ${integration.status}`)
      console.log(`   User ID: ${integration.user_id}`)
      console.log(`   Expires at: ${integration.expires_at}`)

      const now = new Date()
      const expiresAt = new Date(integration.expires_at)
      const isExpired = expiresAt < now

      console.log(`   Expired: ${isExpired ? '⚠️  YES' : '✅ NO'}`)

      if (integration.scopes && integration.scopes.length > 0) {
        console.log(`\n   📋 Granted Scopes:`)
        integration.scopes.forEach(scope => {
          console.log(`      - ${scope}`)
        })
      } else {
        console.log(`\n   ⚠️  No scopes found in database`)
      }

      // Try to decrypt and test the token
      if (integration.access_token) {
        const accessToken = safeDecrypt(integration.access_token)
        if (accessToken) {
          console.log(`\n   🔑 Testing access token...`)

          // Test token by calling Microsoft Graph
          const response = await fetch('https://graph.microsoft.com/v1.0/me', {
            headers: {
              'Authorization': `Bearer ${accessToken}`
            }
          })

          if (response.ok) {
            const userData = await response.json()
            console.log(`   ✅ Token is valid`)
            console.log(`   👤 User: ${userData.displayName} (${userData.mail || userData.userPrincipalName})`)
          } else {
            console.log(`   ❌ Token test failed: ${response.status} ${response.statusText}`)
            const errorData = await response.text()
            console.log(`   Error: ${errorData}`)
          }
        } else {
          console.log(`   ❌ Failed to decrypt access token`)
        }
      }

      console.log('\n' + '='.repeat(60))
    }

    console.log('\n✅ Check complete')

  } catch (error) {
    console.error('Error:', error)
  }
}

checkTokenScopes()
