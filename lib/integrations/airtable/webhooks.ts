/**
 * ⚠️ DEPRECATED FILE (2025-10-03)
 *
 * This file is deprecated and should no longer be used for new code.
 *
 * REASON: Airtable triggers now use the unified TriggerLifecycleManager system
 * which provides proper workflow tracking and lifecycle management.
 *
 * OLD SYSTEM (this file):
 * - Stores webhooks in airtable_webhooks table (no workflow_id tracking)
 * - Manual webhook management
 * - No integration with workflow activation/deactivation
 *
 * NEW SYSTEM (replacement):
 * - File: /lib/triggers/providers/AirtableTriggerLifecycle.ts
 * - Stores in: trigger_resources table (with workflow_id tracking)
 * - Automatic lifecycle: create on activate, delete on deactivate
 * - Unified management via TriggerLifecycleManager
 *
 * MIGRATION PATH:
 * - New workflows automatically use new system
 * - This file kept for backward compatibility only
 * - Will be removed after all existing webhooks migrated
 *
 * SEE: /learning/docs/trigger-lifecycle-audit.md
 */

import { createClient } from "@supabase/supabase-js"
import crypto from "crypto"
import { decrypt } from "@/lib/security/encryption"
import { getWebhookUrl } from "@/lib/utils/getBaseUrl"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * @deprecated Use AirtableTriggerLifecycle instead
 */
export async function ensureAirtableWebhooksForUser(userId: string) {
  console.warn('⚠️ DEPRECATED: ensureAirtableWebhooksForUser() is deprecated. Use AirtableTriggerLifecycle instead.')
  // Fetch Airtable integration access token
  const { data: integ } = await supabase
    .from("integrations")
    .select("access_token")
    .eq("user_id", userId)
    .eq("provider", "airtable")
    .single()
  if (!integ) return

  const encryptionKey = process.env.ENCRYPTION_KEY!
  const token = decrypt(integ.access_token, encryptionKey)

  // Fetch all bases for this user
  const { data: bases } = await supabase
    .from("user_bases")
    .select("base_id,name")
    .eq("user_id", userId)
    .eq("provider", "airtable")

  const notificationUrl = getWebhookUrl("airtable")
  console.log(`📢 Webhook notification URL: ${notificationUrl}`)

  for (const b of bases || []) {
    await ensureWebhookForBase(userId, token, b.base_id, notificationUrl)
  }
}

/**
 * @deprecated Use AirtableTriggerLifecycle instead
 */
export async function ensureAirtableWebhookForBase(userId: string, baseId: string, notificationUrl: string, tableName?: string) {
  console.warn('⚠️ DEPRECATED: ensureAirtableWebhookForBase() is deprecated. Use AirtableTriggerLifecycle instead.')
  // Fetch Airtable integration access token
  const { data: integ } = await supabase
    .from("integrations")
    .select("access_token")
    .eq("user_id", userId)
    .eq("provider", "airtable")
    .single()

  if (!integ) {
    throw new Error('Airtable integration not found')
  }

  const encryptionKey = process.env.ENCRYPTION_KEY!
  const token = decrypt(integ.access_token, encryptionKey)

  return ensureWebhookForBase(userId, token, baseId, notificationUrl, tableName)
}

async function ensureWebhookForBase(userId: string, token: string, baseId: string, notificationUrl: string, tableName?: string) {
  // Check if we already have a webhook
  const { data: existing } = await supabase
    .from("airtable_webhooks")
    .select("id, webhook_id, expiration_time, status, mac_secret_base64, metadata")
    .eq("user_id", userId)
    .eq("base_id", baseId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle()

  const expiringSoon = existing?.expiration_time && new Date(existing.expiration_time).getTime() - Date.now() < 7 * 24 * 3600 * 1000
  let matchedWebhook: { id: string; expiration?: string | null; macSecret?: string | null } | null = existing?.webhook_id
    ? { id: existing.webhook_id, expiration: existing.expiration_time, macSecret: existing.mac_secret_base64 }
    : null

  // First, check the token scopes
  console.log(`🔍 Checking token scopes...`)
  const whoamiRes = await fetch(`https://api.airtable.com/v0/meta/whoami`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`
    }
  })

  if (whoamiRes.ok) {
    const whoamiData = await whoamiRes.json()
    console.log('📋 Token scopes:', whoamiData.scopes)
    if (!whoamiData.scopes?.includes('webhook:manage')) {
      throw new Error('❌ Missing webhook:manage scope. Please reconnect your Airtable integration with the webhook:manage permission.')
    }
    console.log('✅ webhook:manage scope confirmed')
  }

  // Now list all bases to verify this base exists
  console.log(`🔍 Verifying base ${baseId} exists...`)
  const basesRes = await fetch(`https://api.airtable.com/v0/meta/bases`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`
    }
  })

  if (!basesRes.ok) {
    const error = await basesRes.text()
    console.error('❌ Failed to list bases:', error)
    throw new Error('Failed to access Airtable bases. Token may be invalid.')
  }

  const basesData = await basesRes.json()
  const targetBase = basesData.bases.find((b: any) => b.id === baseId)

  if (!targetBase) {
    console.error(`❌ Base ${baseId} not found in user's bases`)
    console.log('Available bases:', basesData.bases.map((b: any) => ({ id: b.id, name: b.name })))
    throw new Error(`Base ${baseId} not found. Please use a valid base ID from your Airtable account.`)
  }

  console.log(`✅ Found base: ${targetBase.name} (${targetBase.id})`)
  console.log(`📝 Permission level: ${targetBase.permissionLevel}`)

  // Look up table ID if a specific table is requested
  let tableId: string | undefined
  if (tableName) {
    console.log(`🔍 Looking up table ID for table: ${tableName}`)

    try {
      const schemaRes = await fetch(`https://api.airtable.com/v0/meta/bases/${baseId}/tables`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`
        }
      })

      if (schemaRes.ok) {
        const schemaData = await schemaRes.json()
        const table = schemaData.tables?.find((t: any) => t.name === tableName)

        if (table) {
          tableId = table.id
          console.log(`✅ Found table ID: ${tableId} for table: ${tableName}`)
        } else {
          console.warn(`⚠️ Table "${tableName}" not found in base. Available tables:`,
            schemaData.tables?.map((t: any) => t.name).join(', '))
        }
      } else {
        console.warn(`⚠️ Could not fetch base schema: ${schemaRes.status}`)
      }
    } catch (error) {
      console.warn(`⚠️ Error fetching table ID:`, error)
    }
  }

  // Check for existing webhooks on this base
  console.log(`🔍 Checking for existing webhooks on base ${baseId}...`)
  const existingWebhooksRes = await fetch(`https://api.airtable.com/v0/bases/${baseId}/webhooks`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`
    }
  })

  if (existingWebhooksRes.ok) {
    const webhooksData = await existingWebhooksRes.json()
    console.log(`📋 Found ${webhooksData.webhooks?.length || 0} existing webhook(s) on this base`)

    if (webhooksData.webhooks && webhooksData.webhooks.length > 0) {
      const allWebhooks = webhooksData.webhooks as any[]

      // Check if any webhook already points at the desired URL
      const ourWebhook = allWebhooks.find(w => w.notificationUrl === notificationUrl)

      if (existing?.webhook_id) {
        const airtableWebhook = allWebhooks.find(w => w.id === existing.webhook_id)

        if (airtableWebhook) {
          const urlMatches = airtableWebhook.notificationUrl === notificationUrl

          if (urlMatches && !expiringSoon && existing.mac_secret_base64) {
            console.log(`✅ Found existing webhook in DB and Airtable with matching URL: ${airtableWebhook.id}`)
            console.log(`   Has MAC Secret: true`)

            await upsertAirtableWebhookRecord(
              userId,
              baseId,
              {
                id: airtableWebhook.id,
                expiration: airtableWebhook.expirationTime || existing.expiration_time || null,
                macSecret: existing.mac_secret_base64
              },
              tableName,
              tableId || existing.metadata?.tableId || null
            )
            return
          }

          if (!urlMatches) {
            console.log(`⚠️ Existing webhook ${airtableWebhook.id} points to ${airtableWebhook.notificationUrl}, expected ${notificationUrl}. Recreating...`)

            try {
              const deleteRes = await fetch(`https://api.airtable.com/v0/bases/${baseId}/webhooks/${airtableWebhook.id}`, {
                method: 'DELETE',
                headers: {
                  Authorization: `Bearer ${token}`
                }
              })

              if (!deleteRes.ok) {
                const errorText = await deleteRes.text()
                console.error(`❌ Failed to delete outdated webhook: ${deleteRes.status}`)
                console.error(`   Error: ${errorText}`)
              } else {
                await supabase
                  .from('airtable_webhooks')
                  .update({ status: 'inactive' })
                  .eq('id', existing.id)
              }
            } catch (err) {
              console.error('❌ Error deleting outdated webhook:', err)
            }
          }
        }
      }

      if (ourWebhook) {
        console.log(`✅ Webhook already exists for our URL: ${ourWebhook.id}`)
        console.log(`   Expires: ${ourWebhook.expirationTime || 'No expiration'}`)
        console.log(`   MAC Secret present: ${!!ourWebhook.macSecretBase64}`)

        if (existing?.webhook_id === ourWebhook.id && existing.mac_secret_base64) {
          console.log('🔐 Using stored MAC secret from database for existing webhook')
          await upsertAirtableWebhookRecord(
            userId,
            baseId,
            {
              id: ourWebhook.id,
              expiration: ourWebhook.expirationTime || existing.expiration_time || null,
              macSecret: existing.mac_secret_base64
            },
            tableName,
            tableId || existing.metadata?.tableId || null
          )
          return
        }

        // IMPORTANT: The list endpoint doesn't return macSecretBase64
        // We need to get it from the individual webhook endpoint
        console.log(`🔑 Fetching webhook details to get MAC secret...`)
        let macSecret = null

        try {
          const webhookDetailRes = await fetch(`https://api.airtable.com/v0/bases/${baseId}/webhooks/${ourWebhook.id}`, {
            headers: {
              Authorization: `Bearer ${token}`
            }
          })

          if (webhookDetailRes.ok) {
            const webhookDetail = await webhookDetailRes.json()
            macSecret = webhookDetail.macSecretBase64
            console.log(`✅ MAC Secret retrieved: ${!!macSecret}`)
            if (!macSecret) {
              console.log('⚠️ WARNING: Webhook exists but has no MAC secret!')
              console.log('   Webhook details:', JSON.stringify(webhookDetail, null, 2))

              // If no MAC secret, we need to delete and recreate the webhook
              console.log('🗑️ Deleting webhook to recreate with MAC secret...')
              const deleteRes = await fetch(`https://api.airtable.com/v0/bases/${baseId}/webhooks/${ourWebhook.id}`, {
                method: 'DELETE',
                headers: {
                  Authorization: `Bearer ${token}`
                }
              })

              if (deleteRes.ok) {
                console.log('✅ Old webhook deleted, creating new one...')
                // Don't return - let it fall through to create a new webhook
              } else {
                console.log('❌ Failed to delete old webhook')
                return // Still return to avoid duplicate webhooks
              }
            }
          } else {
            const errorText = await webhookDetailRes.text()
            console.error(`❌ Failed to fetch webhook details: ${webhookDetailRes.status}`)
            console.error(`   Error: ${errorText}`)
          }
        } catch (err) {
          console.error('❌ Error fetching webhook details:', err)
        }

        // If we have a MAC secret, save and return
        if (macSecret) {
          console.log(`💾 Saving webhook with MAC secret to database...`)

          await upsertAirtableWebhookRecord(
            userId,
            baseId,
            {
              id: ourWebhook.id,
              macSecret,
              expiration: ourWebhook.expirationTime ? new Date(ourWebhook.expirationTime).toISOString() : null
            },
            tableName,
            tableId || existing?.metadata?.tableId || null
          )

          console.log('✅ Webhook saved with MAC secret')
          return // Webhook already exists, no need to create a new one
        }

        // If we get here, either the webhook was deleted or has no MAC secret
        // Continue to create a new webhook
        console.log('⚠️ No valid webhook with MAC secret found, creating new webhook...')
      }

      // Log other webhooks for debugging
      webhooksData.webhooks.forEach((w: any) => {
        console.log(`   - Webhook ${w.id}: ${w.notificationUrl}`)
      })
    }
  } else {
    const error = await existingWebhooksRes.text()
    console.warn(`⚠️ Could not list existing webhooks: ${existingWebhooksRes.status} ${error}`)
  }

  console.log(`✅ Base ${baseId} is accessible (appears in user's base list)`)

  // Create webhook via Airtable API
  const webhookPayload: any = {
    notificationUrl,
    specification: {
      options: {
        filters: {
          dataTypes: ["tableData"]
        }
      }
    }
  }

  // Add recordChangeScope if we have a specific table ID
  if (tableId) {
    webhookPayload.specification.options.filters.recordChangeScope = tableId
    console.log(`🎯 Webhook will monitor only table: ${tableName} (${tableId})`)
  } else if (tableName && !tableId) {
    console.log(`⚠️ Table name provided but ID not found. Webhook will monitor entire base: ${baseId}`)
  } else {
    console.log(`🎯 Webhook will monitor entire base: ${baseId}`)
  }

  console.log(`📤 Creating webhook for base ${baseId} with payload:`, JSON.stringify(webhookPayload, null, 2))

  const res = await fetch(`https://api.airtable.com/v0/bases/${baseId}/webhooks`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(webhookPayload)
  })
  if (!res.ok) {
    const err = await res.text()
    console.error('Failed to create Airtable webhook', res.status, err)

    // Parse error message for better user feedback
    let errorMessage = 'Failed to create Airtable webhook'
    try {
      const errorData = JSON.parse(err)
      if (errorData.error?.type === 'INVALID_PERMISSIONS_OR_MODEL_NOT_FOUND') {
        errorMessage = 'Invalid Airtable permissions or base not found. Please check that your Airtable integration has access to this base.'
      } else if (errorData.error?.type === 'TOO_MANY_WEBHOOKS_BY_OAUTH_INTEGRATION_IN_BASE') {
        console.log('⚠️ Webhook limit reached. Using existing webhooks.')
        await upsertAirtableWebhookRecord(
          userId,
          baseId,
          existing?.webhook_id
            ? {
                id: existing.webhook_id,
                macSecret: existing.mac_secret_base64 || null,
                expiration: existing.expiration_time || null
              }
            : null,
          tableName,
          tableId || existing?.metadata?.tableId || null
        )
        return
      } else if (errorData.error?.message) {
        errorMessage = errorData.error.message
      }
    } catch {
      // If not JSON, use the raw error text
      if (err) errorMessage = err
    }

    throw new Error(errorMessage)
  }
  const data = await res.json()
  console.log(`✅ Webhook created successfully: ${data.id}`)
  console.log(`   Notifications are enabled by default`)

  await upsertAirtableWebhookRecord(
    userId,
    baseId,
    {
      id: data.id,
      macSecret: data.macSecretBase64 || null,
      expiration: data.expirationTime ? new Date(data.expirationTime).toISOString() : null
    },
    tableName,
    tableId || null
  )
}

async function upsertAirtableWebhookRecord(
  userId: string,
  baseId: string,
  webhook: { id: string; macSecret?: string | null; expiration?: string | null } | null,
  tableName?: string,
  tableId?: string | null
) {
  if (!webhook?.id) return

  await supabase
    .from('airtable_webhooks')
    .upsert({
      user_id: userId,
      base_id: baseId,
      webhook_id: webhook.id,
      mac_secret_base64: webhook.macSecret || null,
      expiration_time: webhook.expiration || null,
      status: 'active',
      metadata: {
        tableName: tableName || null,
        tableId: tableId || null,
        scopeType: tableId ? 'table' : 'base'
      }
    }, { onConflict: 'user_id, base_id, webhook_id' })
}

export function validateAirtableSignature(body: string, signatureHeader: string | null, macSecretBase64: string): boolean {
  try {
    if (!macSecretBase64) {
      console.warn('⚠️ Missing MAC secret for Airtable webhook validation')
      return false
    }

    if (!signatureHeader) {
      console.warn('⚠️ Airtable signature header missing')
      return false
    }

    const trimmedHeader = signatureHeader.trim()
    const candidateValues = new Set<string>()

    trimmedHeader.split(',').forEach(part => {
      const segment = part.trim()
      if (!segment) return
      candidateValues.add(segment)

      const equalsIndex = segment.indexOf('=')
      if (equalsIndex >= 0 && equalsIndex < segment.length - 1) {
        candidateValues.add(segment.slice(equalsIndex + 1).trim())
      }
    })

    if (candidateValues.size === 0) {
      candidateValues.add(trimmedHeader)
    }

    const macKey = Buffer.from(macSecretBase64, 'base64')
    const hmac = crypto.createHmac('sha256', macKey)
    hmac.update(body, 'utf8')
    const expectedBase64 = hmac.digest('base64')
    const expectedHex = Buffer.from(expectedBase64, 'base64').toString('hex')

    const expectedBuffers = [
      { buffer: Buffer.from(expectedBase64, 'base64'), encoding: 'base64' as const },
      { buffer: Buffer.from(expectedHex, 'hex'), encoding: 'hex' as const }
    ]

    for (const candidate of candidateValues) {
      if (!candidate) continue

      for (const { buffer: expectedBuffer, encoding } of expectedBuffers) {
        try {
          const providedBuffer = Buffer.from(candidate, encoding)

          if (providedBuffer.length !== expectedBuffer.length) {
            continue
          }

          if (crypto.timingSafeEqual(providedBuffer, expectedBuffer)) {
            return true
          }
        } catch {
          // Ignore decoding errors for this encoding and try the next one
          continue
        }
      }
    }

    console.warn('⚠️ Airtable signature mismatch detected')
    return false
  } catch (error) {
    console.error('❌ Airtable signature validation failed:', error)
    return false
  }
}

/**
 * @deprecated Use AirtableTriggerLifecycle instead
 */
export async function unregisterAirtableWebhook(userId: string, baseId: string) {
  console.warn('⚠️ DEPRECATED: unregisterAirtableWebhook() is deprecated. Use AirtableTriggerLifecycle instead.')
  try {
    // Get webhook details
    const { data: webhook } = await supabase
      .from("airtable_webhooks")
      .select("webhook_id")
      .eq("user_id", userId)
      .eq("base_id", baseId)
      .eq("status", "active")
      .single()

    if (!webhook) return

    // Get Airtable token
    const { data: integ } = await supabase
      .from("integrations")
      .select("access_token")
      .eq("user_id", userId)
      .eq("provider", "airtable")
      .single()

    if (!integ) return

    const encryptionKey = process.env.ENCRYPTION_KEY!
    const token = decrypt(integ.access_token, encryptionKey)

    // Delete webhook via Airtable API
    await fetch(`https://api.airtable.com/v0/bases/${baseId}/webhooks/${webhook.webhook_id}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`
      }
    })

    // Mark as inactive in our database
    await supabase
      .from('airtable_webhooks')
      .update({ status: 'inactive' })
      .eq('webhook_id', webhook.webhook_id)
  } catch (error) {
    console.error('Failed to unregister Airtable webhook:', error)
  }
}

export async function fetchAirtableWebhookPayloads(baseId: string, webhookId: string, cursor?: number) {
  try {
    // Get the user and token for this webhook
    const { data: webhook } = await supabase
      .from("airtable_webhooks")
      .select("user_id")
      .eq("base_id", baseId)
      .eq("webhook_id", webhookId)
      .single()

    if (!webhook) throw new Error('Webhook not found')

    const { data: integ } = await supabase
      .from("integrations")
      .select("access_token")
      .eq("user_id", webhook.user_id)
      .eq("provider", "airtable")
      .single()

    if (!integ) throw new Error('Integration not found')

    const encryptionKey = process.env.ENCRYPTION_KEY!
    const token = decrypt(integ.access_token, encryptionKey)

    // Fetch payloads from Airtable
    let url = `https://api.airtable.com/v0/bases/${baseId}/webhooks/${webhookId}/payloads`
    if (cursor) {
      url += `?cursor=${cursor}`
    }

    console.log(`🔍 Fetching payloads from: ${url}`)
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`❌ Failed to fetch payloads: ${response.status} - ${errorText}`)
      throw new Error(`Failed to fetch payloads: ${response.status}`)
    }

    const data = await response.json()
    console.log(`✅ Successfully fetched ${data.payloads?.length || 0} payloads`)
    return data
  } catch (error) {
    console.error('Failed to fetch Airtable webhook payloads:', error)
    throw error
  }
}

/**
 * @deprecated Use AirtableTriggerLifecycle instead
 */
export async function refreshAirtableWebhook(userId: string, baseId: string) {
  console.warn('⚠️ DEPRECATED: refreshAirtableWebhook() is deprecated. Use AirtableTriggerLifecycle instead.')
  try {
    // Get existing webhook
    const { data: webhook } = await supabase
      .from("airtable_webhooks")
      .select("webhook_id")
      .eq("user_id", userId)
      .eq("base_id", baseId)
      .eq("status", "active")
      .single()

    if (!webhook) return

    // Get Airtable token
    const { data: integ } = await supabase
      .from("integrations")
      .select("access_token")
      .eq("user_id", userId)
      .eq("provider", "airtable")
      .single()

    if (!integ) return

    const encryptionKey = process.env.ENCRYPTION_KEY!
    const token = decrypt(integ.access_token, encryptionKey)

    // Refresh webhook via Airtable API
    const response = await fetch(`https://api.airtable.com/v0/bases/${baseId}/webhooks/${webhook.webhook_id}/refresh`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`
      }
    })

    if (response.ok) {
      const data = await response.json()

      // Update expiration in database
      await supabase
        .from('airtable_webhooks')
        .update({
          expiration_time: data.expirationTime ? new Date(data.expirationTime).toISOString() : null
        })
        .eq('webhook_id', webhook.webhook_id)

      console.log('✅ Airtable webhook refreshed, new expiration:', data.expirationTime)
    }
  } catch (error) {
    console.error('Failed to refresh Airtable webhook:', error)
  }
}

/**
 * @deprecated Use AirtableTriggerLifecycle instead
 */
export async function cleanupInactiveAirtableWebhooks() {
  console.warn('⚠️ DEPRECATED: cleanupInactiveAirtableWebhooks() is deprecated. Use AirtableTriggerLifecycle instead.')
  try {
    // Get all expired webhooks
    const now = new Date()
    const { data: expiredWebhooks } = await supabase
      .from('airtable_webhooks')
      .select('user_id, base_id, webhook_id')
      .eq('status', 'active')
      .lt('expiration_time', now.toISOString())

    if (!expiredWebhooks || expiredWebhooks.length === 0) return

    for (const webhook of expiredWebhooks) {
      // Mark as inactive
      await supabase
        .from('airtable_webhooks')
        .update({ status: 'inactive' })
        .eq('webhook_id', webhook.webhook_id)

      console.log(`Marked webhook ${webhook.webhook_id} as inactive due to expiration`)
    }
  } catch (error) {
    console.error('Failed to cleanup inactive Airtable webhooks:', error)
  }
}
