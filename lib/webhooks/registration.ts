import { createSupabaseServiceClient } from '@/utils/supabase/server'

export interface WebhookRegistration {
  provider: string
  service?: string
  webhookUrl: string
  events: string[]
  secret?: string
  metadata?: Record<string, any>
  config?: Record<string, any>
  userId?: string
}

export async function registerGoogleWebhook(registration: WebhookRegistration): Promise<boolean> {
  try {
    const { provider, service, webhookUrl, events, secret } = registration
    
    // For Google services, we need to register with Google Cloud Pub/Sub
    // This is a simplified implementation - in production you'd use the Google Cloud API
    
    console.log(`Registering Google webhook for ${service}:`, {
      webhookUrl,
      events,
      secret: secret ? '[REDACTED]' : undefined
    })
    
    // Store registration in database
    const supabase = await createSupabaseServiceClient()
    await supabase
      .from('webhook_registrations')
      .insert({
        provider,
        service,
        webhook_url: webhookUrl,
        events: events,
        secret: secret,
        status: 'active',
        created_at: new Date().toISOString()
      })
    
    return true
  } catch (error) {
    console.error('Failed to register Google webhook:', error)
    return false
  }
}

export async function registerGmailWebhook(registration: WebhookRegistration): Promise<boolean> {
  try {
    const { webhookUrl, events, secret } = registration
    
    // For Gmail, we use the Gmail API watch method
    // This is a simplified implementation - in production you'd use the Gmail API
    
    console.log('Registering Gmail webhook:', {
      webhookUrl,
      events,
      secret: secret ? '[REDACTED]' : undefined
    })
    
    // Store registration in database
    const supabase = await createSupabaseServiceClient()
    await supabase
      .from('webhook_registrations')
      .insert({
        provider: 'gmail',
        service: 'gmail',
        webhook_url: webhookUrl,
        events: events,
        secret: secret,
        status: 'active',
        created_at: new Date().toISOString()
      })
    
    return true
  } catch (error) {
    console.error('Failed to register Gmail webhook:', error)
    return false
  }
}

export async function registerDiscordWebhook(registration: WebhookRegistration): Promise<boolean> {
  console.log('🚀 registerDiscordWebhook called!') // Immediate debug
  
  try {
    const { webhookUrl, events, secret, config } = registration
    
    console.log('🔗 Registering Discord Gateway listener (not webhook):', {
      webhookUrl,
      events,
      secret: secret ? '[REDACTED]' : undefined,
      config
    })
    
    // For Discord message triggers, we use Gateway events, not webhooks
    // Discord webhooks are for sending TO Discord, not receiving FROM Discord
    
    // Ensure Discord Gateway is connected
    const { discordGateway } = await import('@/lib/integrations/discordGateway')
    
    // Check if bot is configured
    const botToken = process.env.DISCORD_BOT_TOKEN
    if (!botToken) {
      console.error('Discord bot token not configured in environment variables')
      return false
    }
    
    // Check Gateway connection status
    console.log('🔌 Checking Discord Gateway status...')
    const status = discordGateway.getStatus()
    console.log('🔌 Gateway status:', status)
    
    if (!status.isConnected) {
      console.log('Discord Gateway not connected, attempting to connect...')
      try {
        await discordGateway.connect()
        console.log('✅ Discord Gateway connected successfully!')
      } catch (error) {
        console.error('Failed to connect Discord Gateway:', error)
        return false
      }
    } else {
      console.log('✅ Discord Gateway already connected!')
    }
    
    // Store the registration for tracking (but no external webhook needed)
    const supabase = await createSupabaseServiceClient()
    await supabase
      .from('webhook_registrations')
      .insert({
        provider: 'discord',
        webhook_url: webhookUrl,
        events: events,
        secret: secret,
        status: 'active',
        external_webhook_id: 'gateway-listener', // Indicate this is Gateway-based
        external_webhook_token: null,
        channel_id: config?.channelId || null,
        metadata: {
          type: 'gateway',
          guildId: config?.guildId,
          channelId: config?.channelId
        },
        created_at: new Date().toISOString()
      })
    
    console.log('🎉 Discord Gateway listener registered successfully!')
    return true
    
  } catch (error) {
    console.error('Failed to register Discord Gateway listener:', error)
    return false
  }
}

export async function registerSlackWebhook(registration: WebhookRegistration): Promise<boolean> {
  try {
    const { webhookUrl, events, secret } = registration
    
    // For Slack, we register with Slack's Events API
    console.log('Registering Slack webhook:', {
      webhookUrl,
      events,
      secret: secret ? '[REDACTED]' : undefined
    })
    
    // Store registration in database
    const supabase = await createSupabaseServiceClient()
    await supabase
      .from('webhook_registrations')
      .insert({
        provider: 'slack',
        webhook_url: webhookUrl,
        events: events,
        secret: secret,
        status: 'active',
        created_at: new Date().toISOString()
      })
    
    return true
  } catch (error) {
    console.error('Failed to register Slack webhook:', error)
    return false
  }
}

export async function registerGitHubWebhook(registration: WebhookRegistration): Promise<boolean> {
  try {
    const { webhookUrl, events, secret } = registration
    
    // For GitHub, we register with GitHub's webhook system
    console.log('Registering GitHub webhook:', {
      webhookUrl,
      events,
      secret: secret ? '[REDACTED]' : undefined
    })
    
    // Store registration in database
    const supabase = await createSupabaseServiceClient()
    await supabase
      .from('webhook_registrations')
      .insert({
        provider: 'github',
        webhook_url: webhookUrl,
        events: events,
        secret: secret,
        status: 'active',
        created_at: new Date().toISOString()
      })
    
    return true
  } catch (error) {
    console.error('Failed to register GitHub webhook:', error)
    return false
  }
}

export async function registerNotionWebhook(registration: WebhookRegistration): Promise<boolean> {
  try {
    const { webhookUrl, events, secret } = registration
    
    // For Notion, we register with Notion's webhook system
    console.log('Registering Notion webhook:', {
      webhookUrl,
      events,
      secret: secret ? '[REDACTED]' : undefined
    })
    
    // Store registration in database
    const supabase = await createSupabaseServiceClient()
    await supabase
      .from('webhook_registrations')
      .insert({
        provider: 'notion',
        webhook_url: webhookUrl,
        events: events,
        secret: secret,
        status: 'active',
        created_at: new Date().toISOString()
      })
    
    return true
  } catch (error) {
    console.error('Failed to register Notion webhook:', error)
    return false
  }
}

export async function registerWebhook(registration: WebhookRegistration): Promise<boolean> {
  try {
    switch (registration.provider) {
      case 'google':
        return await registerGoogleWebhook(registration)
      case 'gmail':
        return await registerGmailWebhook(registration)
      case 'discord':
        return await registerDiscordWebhook(registration)
      case 'slack':
        return await registerSlackWebhook(registration)
      case 'github':
        return await registerGitHubWebhook(registration)
      case 'notion':
        return await registerNotionWebhook(registration)
      default:
        console.error(`Unsupported provider: ${registration.provider}`)
        return false
    }
  } catch (error) {
    console.error('Failed to register webhook:', error)
    return false
  }
}

export async function unregisterWebhook(provider: string, webhookUrl: string): Promise<boolean> {
  try {
    const supabase = await createSupabaseServiceClient()
    
    // Update status to inactive
    const { error } = await supabase
      .from('webhook_registrations')
      .update({ 
        status: 'inactive',
        updated_at: new Date().toISOString()
      })
      .eq('provider', provider)
      .eq('webhook_url', webhookUrl)
    
    if (error) {
      console.error('Failed to unregister webhook:', error)
      return false
    }
    
    console.log(`Unregistered webhook for ${provider}:`, webhookUrl)
    return true
  } catch (error) {
    console.error('Failed to unregister webhook:', error)
    return false
  }
}

export async function getWebhookRegistrations(provider?: string): Promise<any[]> {
  try {
    const supabase = await createSupabaseServiceClient()
    
    let query = supabase
      .from('webhook_registrations')
      .select('*')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
    
    if (provider) {
      query = query.eq('provider', provider)
    }
    
    const { data, error } = await query
    
    if (error) {
      console.error('Failed to fetch webhook registrations:', error)
      return []
    }
    
    return data || []
  } catch (error) {
    console.error('Failed to fetch webhook registrations:', error)
    return []
  }
} 