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
  try {
    const { webhookUrl, events, secret, config } = registration
    
    console.log('🔗 Registering Discord webhook via API:', {
      webhookUrl,
      events,
      secret: secret ? '[REDACTED]' : undefined,
      config
    })
    
    // Get Discord integration details to access token
    const supabase = await createSupabaseServiceClient()
    const { data: integration, error: integrationError } = await supabase
      .from('integrations')
      .select('*')
      .eq('provider', 'discord')
      .eq('user_id', registration.userId)
      .single()
    
    if (integrationError || !integration) {
      console.error('Discord integration not found:', integrationError)
      return false
    }
    
    const accessToken = integration.access_token
    if (!accessToken) {
      console.error('Discord access token not found')
      return false
    }
    
    // Extract channel ID from config - this determines where to create the webhook
    const channelId = config?.channelId
    if (!channelId) {
      console.error('Channel ID not provided in config')
      return false
    }
    
    // Create webhook using Discord API
    const discordResponse = await fetch(`https://discord.com/api/v10/channels/${channelId}/webhooks`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'ChainReact Workflow',
        avatar: null // You can add a base64 encoded image here if desired
      })
    })
    
    if (!discordResponse.ok) {
      const error = await discordResponse.text()
      console.error('Failed to create Discord webhook:', error)
      return false
    }
    
    const discordWebhook = await discordResponse.json()
    console.log('✅ Discord webhook created:', {
      id: discordWebhook.id,
      name: discordWebhook.name,
      channelId: discordWebhook.channel_id
    })
    
    // Store both our internal registration and Discord's webhook info
    await supabase
      .from('webhook_registrations')
      .insert({
        provider: 'discord',
        webhook_url: webhookUrl,
        events: events,
        secret: secret,
        status: 'active',
        external_webhook_id: discordWebhook.id,
        external_webhook_token: discordWebhook.token,
        channel_id: channelId,
        created_at: new Date().toISOString()
      })
    
    // Update the Discord webhook URL to point to our endpoint
    const updateResponse = await fetch(`https://discord.com/api/v10/webhooks/${discordWebhook.id}/${discordWebhook.token}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        url: webhookUrl
      })
    })
    
    if (!updateResponse.ok) {
      console.warn('Failed to update Discord webhook URL, but webhook was created')
    }
    
    console.log('🎉 Discord webhook fully configured!')
    return true
    
  } catch (error) {
    console.error('Failed to register Discord webhook:', error)
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