import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createAdminClient } from "@/lib/supabase/admin"
import { decrypt } from "@/lib/security/encryption"
import { getBaseUrl } from "@/lib/utils/getBaseUrl"
import { EmailCacheService } from "@/lib/services/emailCacheService"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
const supabase = createClient(supabaseUrl, supabaseKey)

interface DataFetcher {
  [key: string]: (integration: any, options?: any) => Promise<any[] | { data: any[], error?: { message: string } }>
}

// Add comprehensive error handling and fix API calls
export async function POST(req: NextRequest) {
  console.log('🚀 [SERVER] fetch-user-data API route called')
  
  try {
    const body = await req.json();
    const { integrationId, dataType, options = {} } = body;

    console.log('🔍 [SERVER] fetch-user-data request parsed:', { integrationId, dataType, options });

    if (!integrationId || !dataType) {
      console.log('❌ [SERVER] Missing required parameters');
      return Response.json({ error: 'Missing required parameters' }, { status: 400 });
    }
    
    // Route gmail-recent-recipients to Gmail data API
    if (dataType === 'gmail-recent-recipients') {
      console.log('🔍 [SERVER] Routing Gmail recent recipients to Gmail API, original integrationId:', integrationId);
      
      try {
        // First, get the integration that made this request
        const { data: requestingIntegration, error: requestingError } = await supabase
          .from('integrations')
          .select('*')
          .eq('id', integrationId)
          .single();

        if (requestingError || !requestingIntegration) {
          console.error('❌ [SERVER] Requesting integration not found:', requestingError);
          return Response.json({ error: 'Requesting integration not found' }, { status: 404 });
        }

        // If the requesting integration is not Gmail, find a Gmail integration for the same user
        let gmailIntegrationId = integrationId;
        
        if (requestingIntegration.provider !== 'gmail') {
          console.log('🔍 [SERVER] Non-Gmail integration requesting Gmail data, finding Gmail integration for user:', requestingIntegration.user_id);
          
          const { data: gmailIntegration, error: gmailError } = await supabase
            .from('integrations')
            .select('*')
            .eq('user_id', requestingIntegration.user_id)
            .eq('provider', 'gmail')
            .eq('status', 'connected')
            .single();

          if (gmailError || !gmailIntegration) {
            console.error('❌ [SERVER] Gmail integration not found for user:', gmailError);
            return Response.json({ error: 'Gmail integration required for recipient suggestions' }, { status: 404 });
          }
          
          gmailIntegrationId = gmailIntegration.id;
          console.log('✅ [SERVER] Found Gmail integration for cross-provider request:', gmailIntegrationId);
        }
        
        const baseUrl = req.nextUrl.origin
        const gmailApiResponse = await fetch(`${baseUrl}/api/integrations/gmail/data`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            integrationId: gmailIntegrationId,
            dataType,
            options
          })
        });

        if (!gmailApiResponse.ok) {
          const error = await gmailApiResponse.json();
          console.error(`❌ [SERVER] Gmail API error:`, error);
          return Response.json(error, { status: gmailApiResponse.status });
        }

        const gmailResult = await gmailApiResponse.json();
        console.log(`✅ [SERVER] Gmail API completed for ${dataType}, result length:`, gmailResult.data?.length || 'unknown');

        return Response.json(gmailResult);
        
      } catch (error: any) {
        console.error(`❌ [SERVER] Gmail API routing error:`, error);
        return Response.json({ error: 'Failed to route Gmail request' }, { status: 500 });
      }
    }

    // Get integration by ID
    const { data: integration, error: integrationError } = await supabase
      .from('integrations')
      .select('*')
      .eq('id', integrationId)
      .single();

    if (integrationError || !integration) {
      console.error('❌ [SERVER] Integration not found:', integrationError);
      return Response.json({ error: 'Integration not found' }, { status: 404 });
    }

    // Handle Gmail recent recipients with original working method (no contacts permission needed)
    if (integration.provider === 'gmail' && dataType === 'gmail-recent-recipients') {
      console.log(`🔄 [SERVER] Using original Gmail recipients method`);
      
      try {
        // Validate integration has access token
        if (!integration.access_token) {
          throw new Error("Gmail authentication required. Please reconnect your account.")
        }

        // Decrypt the access token
        const { decrypt } = await import('@/lib/security/encryption')
        const accessToken = decrypt(integration.access_token)

        // Get recent sent messages (last 50) - original working approach
        const messagesResponse = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages?labelIds=SENT&maxResults=50`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
          }
        )

        if (!messagesResponse.ok) {
          if (messagesResponse.status === 401) {
            throw new Error("Gmail authentication expired. Please reconnect your account.")
          }
          const errorText = await messagesResponse.text().catch(() => "Unknown error")
          throw new Error(`Gmail API error: ${messagesResponse.status} - ${errorText}`)
        }

        const messagesData = await messagesResponse.json()
        const messages = messagesData.messages || []

        if (messages.length === 0) {
          return Response.json({ data: [] })
        }

        // Get detailed information for each message
        const messageDetails = await Promise.all(
          messages.slice(0, 25).map(async (message: { id: string }) => {
            try {
              const response = await fetch(
                `https://gmail.googleapis.com/gmail/v1/users/me/messages/${message.id}?format=metadata&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Bcc`,
                {
                  headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "application/json",
                  },
                }
              )

              if (!response.ok) return null
              
              const data = await response.json()
              return data.payload?.headers || []
            } catch (error) {
              console.warn(`Failed to fetch message ${message.id}:`, error)
              return null
            }
          })
        )

        // Extract all recipient email addresses
        const recipients = new Map<string, { email: string; name?: string; frequency: number }>()

        messageDetails
          .filter(headers => headers !== null)
          .forEach(headers => {
            headers.forEach((header: { name: string; value: string }) => {
              if (['To', 'Cc', 'Bcc'].includes(header.name)) {
                // Parse email addresses from the header value
                const emailRegex = /(?:"?([^"<>]+?)"?\s*)?<([^<>]+)>|([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g
                let match

                while ((match = emailRegex.exec(header.value)) !== null) {
                  const name = match[1]?.trim()
                  const email = (match[2] || match[3])?.trim().toLowerCase()

                  if (email && email.includes('@')) {
                    const existing = recipients.get(email)
                    if (existing) {
                      existing.frequency += 1
                    } else {
                      recipients.set(email, {
                        email,
                        name: name || undefined,
                        frequency: 1
                      })
                    }
                  }
                }
              }
            })
          })

        // Convert to array and sort by frequency
        const recipientArray = Array.from(recipients.values())
          .sort((a, b) => b.frequency - a.frequency)
          .slice(0, 20)
          .map(recipient => ({
            value: recipient.email,
            label: recipient.name ? `${recipient.name} <${recipient.email}>` : recipient.email,
            email: recipient.email,
            name: recipient.name
          }))

        console.log(`✅ [SERVER] Original Gmail method: Found ${recipientArray.length} recipients`)
        return Response.json({ data: recipientArray })

      } catch (error: any) {
        console.error(`❌ [SERVER] Gmail recipients error:`, error)
        return Response.json({ 
          error: error.message || 'Failed to get Gmail recipients' 
        }, { status: 500 })
      }
    }

    // Route Google (Drive/Docs/Sheets) requests to dedicated Google data API
    if (integration.provider?.startsWith('google') && (
      dataType.startsWith('google-') || 
      dataType === 'google-calendars' || 
      dataType === 'google-contacts'
    )) {
      console.log(`🔄 [SERVER] Routing Google request to dedicated API: ${dataType}`);
      
      try {
        const baseUrl = req.nextUrl.origin
        const googleApiResponse = await fetch(`${baseUrl}/api/integrations/google/data`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            integrationId,
            dataType,
            options
          })
        });

        if (!googleApiResponse.ok) {
          const error = await googleApiResponse.json();
          console.error(`❌ [SERVER] Google API error:`, error);
          return Response.json(error, { status: googleApiResponse.status });
        }

        const googleResult = await googleApiResponse.json();
        console.log(`✅ [SERVER] Google API completed for ${dataType}, result length:`, googleResult.data?.length || 'unknown');

        return Response.json(googleResult);
        
      } catch (error: any) {
        console.error(`❌ [SERVER] Google API routing error:`, error);
        return Response.json({ error: 'Failed to route Google request' }, { status: 500 });
      }
    }

    // Route other Gmail requests to dedicated Gmail data API
    if (integration.provider === 'gmail' && (
      dataType === 'gmail_labels' ||
      dataType === 'gmail_recipients' ||
      dataType === 'gmail_signatures'
    )) {
      console.log(`🔄 [SERVER] Routing Gmail request to dedicated API: ${dataType}`);
      
      try {
        const baseUrl = req.nextUrl.origin
        const gmailApiResponse = await fetch(`${baseUrl}/api/integrations/gmail/data`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            integrationId,
            dataType,
            options
          })
        });

        if (!gmailApiResponse.ok) {
          const error = await gmailApiResponse.json();
          console.error(`❌ [SERVER] Gmail API error:`, error);
          return Response.json(error, { status: gmailApiResponse.status });
        }

        const gmailResult = await gmailApiResponse.json();
        console.log(`✅ [SERVER] Gmail API completed for ${dataType}, result length:`, gmailResult.data?.length || 'unknown');

        // Return the Gmail API response directly (it's already in the correct format)
        return Response.json(gmailResult);
        
      } catch (error: any) {
        console.error(`❌ [SERVER] Gmail API routing error:`, error);
        return Response.json({ error: 'Failed to route Gmail request' }, { status: 500 });
      }
    }

    // Route Slack requests to dedicated Slack data API
    if (integration.provider === 'slack' && (
      dataType === 'slack_channels' ||
      dataType === 'slack_users'
    )) {
      console.log(`🔄 [SERVER] Routing Slack request to dedicated API: ${dataType}`);
      
      try {
        const baseUrl = req.nextUrl.origin
        const slackApiResponse = await fetch(`${baseUrl}/api/integrations/slack/data`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            integrationId,
            dataType,
            options
          })
        });

        if (!slackApiResponse.ok) {
          const error = await slackApiResponse.json();
          console.error(`❌ [SERVER] Slack API error:`, error);
          return Response.json(error, { status: slackApiResponse.status });
        }

        const slackResult = await slackApiResponse.json();
        console.log(`✅ [SERVER] Slack API completed for ${dataType}, result length:`, slackResult.data?.length || 'unknown');

        // Return the Slack API response directly (it's already in the correct format)
        return Response.json(slackResult);
        
      } catch (error: any) {
        console.error(`❌ [SERVER] Slack API routing error:`, error);
        return Response.json({ error: 'Failed to route Slack request' }, { status: 500 });
      }
    }

    // Route Google requests to dedicated Google data API
    if (integration.provider.startsWith('google') && (
      dataType === 'google-drive-folders' ||
      dataType === 'google-drive-files' ||
      dataType === 'google-calendars' ||
      dataType === 'google-contacts' ||
      dataType === 'google-sheets_spreadsheets' ||
      dataType === 'google-sheets_sheets' ||
      dataType === 'google-sheets_columns' ||
      dataType === 'google-sheets_enhanced-preview'
    )) {
      console.log(`🔄 [SERVER] Routing Google request to dedicated API:`, {
        dataType,
        integrationId,
        provider: integration.provider,
        status: integration.status,
        options
      });
      
      try {
        const baseUrl = req.nextUrl.origin
        const requestPayload = {
          integrationId,
          dataType,
          options
        }
        
        console.log(`🚀 [SERVER] Making Google API request:`, requestPayload);
        
        const googleApiResponse = await fetch(`${baseUrl}/api/integrations/google/data`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestPayload)
        });

        console.log(`📡 [SERVER] Google API response:`, {
          status: googleApiResponse.status,
          statusText: googleApiResponse.statusText,
          ok: googleApiResponse.ok,
          headers: Object.fromEntries(googleApiResponse.headers.entries())
        });

        if (!googleApiResponse.ok) {
          let error;
          try {
            error = await googleApiResponse.json();
          } catch (parseError) {
            const errorText = await googleApiResponse.text().catch(() => 'Unknown error');
            error = { error: `Failed to parse error response: ${errorText}` };
          }
          console.error(`❌ [SERVER] Google API error:`, {
            status: googleApiResponse.status,
            error,
            requestPayload
          });
          return Response.json(error, { status: googleApiResponse.status });
        }

        const googleResult = await googleApiResponse.json();
        console.log(`✅ [SERVER] Google API completed for ${dataType}:`, {
          resultLength: googleResult.data?.length || 'unknown',
          success: googleResult.success,
          hasData: !!googleResult.data
        });

        // Return the Google API response directly (it's already in the correct format)
        return Response.json(googleResult);
        
      } catch (error: any) {
        console.error(`❌ [SERVER] Google API routing error:`, {
          error: error.message,
          stack: error.stack,
          dataType,
          integrationId
        });
        return Response.json({ error: 'Failed to route Google request' }, { status: 500 });
      }
    }

    // Route Notion requests to dedicated Notion data API
    if (integration.provider === 'notion' && (
      dataType === 'notion_users' ||
      dataType === 'notion_templates' ||
      dataType === 'notion_databases' ||
      dataType === 'notion_pages' ||
      dataType === 'notion_workspaces' ||
      dataType === 'notion_database_properties'
    )) {
      console.log(`🔄 [SERVER] Routing Notion request to dedicated API: ${dataType}`);
      
      try {
        const baseUrl = req.nextUrl.origin
        const notionApiResponse = await fetch(`${baseUrl}/api/integrations/notion/data`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            integrationId,
            dataType,
            options
          })
        });

        if (!notionApiResponse.ok) {
          const error = await notionApiResponse.json();
          console.error(`❌ [SERVER] Notion API error:`, error);
          return Response.json(error, { status: notionApiResponse.status });
        }

        const notionResult = await notionApiResponse.json();
        console.log(`✅ [SERVER] Notion API completed for ${dataType}, result length:`, notionResult.data?.length || 'unknown');
        
        // Return the Notion API response directly (it's already in the correct format)
        return Response.json(notionResult);
        
      } catch (error: any) {
        console.error(`❌ [SERVER] Notion API routing error:`, error);
        return Response.json({ error: 'Failed to route Notion request' }, { status: 500 });
      }
    }

    // Route Discord requests to dedicated Discord data API
    if (integration.provider === 'discord' && (
      dataType === 'discord_guilds' ||
      dataType === 'discord_channels' ||
      dataType === 'discord_categories' ||
      dataType === 'discord_members' ||
      dataType === 'discord_roles' ||
      dataType === 'discord_messages' ||
      dataType === 'discord_reactions' ||
      dataType === 'discord_banned_users' ||
      dataType === 'discord_users'
    )) {
      console.log(`🔄 [SERVER] Routing Discord request to dedicated API: ${dataType}`);
      
      try {
        const baseUrl = req.nextUrl.origin
        const discordApiResponse = await fetch(`${baseUrl}/api/integrations/discord/data`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            integrationId,
            dataType,
            options
          })
        });

        if (!discordApiResponse.ok) {
          const error = await discordApiResponse.json();
          console.error(`❌ [SERVER] Discord API error:`, error);
          return Response.json(error, { status: discordApiResponse.status });
        }

        const discordResult = await discordApiResponse.json();
        console.log(`✅ [SERVER] Discord API completed for ${dataType}, result length:`, discordResult.data?.length || 'unknown');
        
        // Return the Discord API response directly (it's already in the correct format)
        return Response.json(discordResult);
        
      } catch (error: any) {
        console.error(`❌ [SERVER] Discord API routing error:`, error);
        return Response.json({ error: 'Failed to route Discord request' }, { status: 500 });
      }
    }

    // Route Facebook requests to dedicated Facebook data API
    if (integration.provider === 'facebook' && (
      dataType === 'facebook_pages'
    )) {
      console.log(`🔄 [SERVER] Routing Facebook request to dedicated API: ${dataType}`);
      
      try {
        const baseUrl = req.nextUrl.origin
        const facebookApiResponse = await fetch(`${baseUrl}/api/integrations/facebook/data`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            integrationId,
            dataType,
            options
          })
        });

        if (!facebookApiResponse.ok) {
          const error = await facebookApiResponse.json();
          console.error(`❌ [SERVER] Facebook API error:`, error);
          return Response.json(error, { status: facebookApiResponse.status });
        }

        const facebookResult = await facebookApiResponse.json();
        console.log(`✅ [SERVER] Facebook API completed for ${dataType}, result length:`, facebookResult.data?.length || 'unknown');
        
        // Return the Facebook API response directly (it's already in the correct format)
        return Response.json(facebookResult);
        
      } catch (error: any) {
        console.error(`❌ [SERVER] Facebook API routing error:`, error);
        return Response.json({ error: 'Failed to route Facebook request' }, { status: 500 });
      }
    }

    // Route Twitter requests to dedicated Twitter data API
    if (integration.provider === 'twitter' && (
      dataType === 'twitter_mentions'
    )) {
      console.log(`🔄 [SERVER] Routing Twitter request to dedicated API: ${dataType}`);
      
      try {
        const baseUrl = req.nextUrl.origin
        const twitterApiResponse = await fetch(`${baseUrl}/api/integrations/twitter/data`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            integrationId,
            dataType,
            options
          })
        });

        if (!twitterApiResponse.ok) {
          const error = await twitterApiResponse.json();
          console.error(`❌ [SERVER] Twitter API error:`, error);
          return Response.json(error, { status: twitterApiResponse.status });
        }

        const twitterResult = await twitterApiResponse.json();
        console.log(`✅ [SERVER] Twitter API completed for ${dataType}, result length:`, twitterResult.data?.length || 'unknown');
        
        // Return the Twitter API response directly (it's already in the correct format)
        return Response.json(twitterResult);
        
      } catch (error: any) {
        console.error(`❌ [SERVER] Twitter API routing error:`, error);
        return Response.json({ error: 'Failed to route Twitter request' }, { status: 500 });
      }
    }

    // OneNote integration delegation
    if ((
      dataType === 'onenote_notebooks' ||
      dataType === 'onenote_sections' ||
      dataType === 'onenote_pages'
    )) {
      console.log(`🔄 [SERVER] Routing OneNote request to dedicated API: ${dataType}`);
      
      try {
        const baseUrl = req.nextUrl.origin
        const oneNoteApiResponse = await fetch(`${baseUrl}/api/integrations/onenote/data`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            integrationId,
            dataType,
            options
          })
        });

        if (!oneNoteApiResponse.ok) {
          const error = await oneNoteApiResponse.json();
          console.error(`❌ [SERVER] OneNote API error:`, error);
          return Response.json(error, { status: oneNoteApiResponse.status });
        }

        const oneNoteResult = await oneNoteApiResponse.json();
        console.log(`✅ [SERVER] OneNote API success:`, {
          dataType,
          resultCount: oneNoteResult.data?.length || 0
        });

        // Return the OneNote API response directly (it's already in the correct format)
        return Response.json(oneNoteResult);
        
      } catch (error: any) {
        console.error(`❌ [SERVER] OneNote API routing error:`, error);
        return Response.json({ error: 'Failed to route OneNote request' }, { status: 500 });
      }
    }

    // Outlook integration delegation
    if ((
      dataType === 'outlook_folders' ||
      dataType === 'outlook_messages' ||
      dataType === 'outlook_contacts' ||
      dataType === 'outlook_calendar_events' ||
      dataType === 'outlook_calendars' ||
      dataType === 'outlook_signatures'
    )) {
      console.log(`🔄 [SERVER] Routing Outlook request to dedicated API: ${dataType}`);
      
      try {
        const baseUrl = req.nextUrl.origin
        const outlookApiResponse = await fetch(`${baseUrl}/api/integrations/outlook/data`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            integrationId,
            dataType,
            options
          })
        });

        if (!outlookApiResponse.ok) {
          const error = await outlookApiResponse.json();
          console.error(`❌ [SERVER] Outlook API error:`, error);
          return Response.json(error, { status: outlookApiResponse.status });
        }

        const outlookResult = await outlookApiResponse.json();
        console.log(`✅ [SERVER] Outlook API success:`, {
          dataType,
          resultCount: outlookResult.data?.length || 0
        });

        // Return the Outlook API response directly (it's already in the correct format)
        return Response.json(outlookResult);
        
      } catch (error: any) {
        console.error(`❌ [SERVER] Outlook API routing error:`, error);
        return Response.json({ error: 'Failed to route Outlook request' }, { status: 500 });
      }
    }

    // HubSpot integration delegation
    if ((
      dataType === 'hubspot_contacts' ||
      dataType === 'hubspot_companies' ||
      dataType === 'hubspot_deals' ||
      dataType === 'hubspot_pipelines' ||
      dataType === 'hubspot_deal_stages' ||
      dataType === 'hubspot_owners' ||
      dataType === 'hubspot_contact_properties' ||
      dataType === 'hubspot_deal_properties'
    )) {
      console.log(`🔄 [SERVER] Routing HubSpot request to dedicated API: ${dataType}`);
      
      try {
        const baseUrl = req.nextUrl.origin
        const hubspotApiResponse = await fetch(`${baseUrl}/api/integrations/hubspot/data`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            integrationId,
            dataType,
            options
          })
        });

        if (!hubspotApiResponse.ok) {
          const error = await hubspotApiResponse.json();
          console.error(`❌ [SERVER] HubSpot API error:`, error);
          return Response.json(error, { status: hubspotApiResponse.status });
        }

        const hubspotResult = await hubspotApiResponse.json();
        console.log(`✅ [SERVER] HubSpot API success:`, {
          dataType,
          resultCount: hubspotResult.data?.length || 0
        });

        // Return the HubSpot API response directly (it's already in the correct format)
        return Response.json(hubspotResult);
        
      } catch (error: any) {
        console.error(`❌ [SERVER] HubSpot API routing error:`, error);
        return Response.json({ error: 'Failed to route HubSpot request' }, { status: 500 });
      }
    }

    // Airtable integration delegation
    if ((
      dataType === 'airtable_bases' ||
      dataType === 'airtable_tables' ||
      dataType === 'airtable_user_records' ||
      dataType === 'airtable_feedback_records' ||
      dataType === 'airtable_task_records' ||
      dataType === 'airtable_project_records' ||
      dataType === 'airtable_fields' ||
      dataType === 'airtable_field_values' ||
      dataType === 'airtable_records'
    )) {
      console.log(`🔄 [SERVER] Routing Airtable request to dedicated API: ${dataType}`);
      
      try {
        const baseUrl = req.nextUrl.origin
        const airtableApiResponse = await fetch(`${baseUrl}/api/integrations/airtable/data`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            integrationId,
            dataType,
            options
          })
        });

        if (!airtableApiResponse.ok) {
          const error = await airtableApiResponse.json();
          console.error(`❌ [SERVER] Airtable API error:`, error);
          return Response.json(error, { status: airtableApiResponse.status });
        }

        const airtableResult = await airtableApiResponse.json();
        console.log(`✅ [SERVER] Airtable API success:`, {
          dataType,
          resultCount: airtableResult.data?.length || 0
        });

        // Return the Airtable API response directly (it's already in the correct format)
        return Response.json(airtableResult);
        
      } catch (error: any) {
        console.error(`❌ [SERVER] Airtable API routing error:`, error);
        return Response.json({ error: 'Failed to route Airtable request' }, { status: 500 });
      }
    }

    // Trello integration delegation
    if ((
      dataType === 'trello-boards' ||
      dataType === 'trello-lists' ||
      dataType === 'trello-board-templates' ||
      dataType === 'trello-list-templates' ||
      dataType === 'trello-card-templates' ||
      dataType === 'trello_lists' ||
      dataType === 'trello_cards'
    )) {
      console.log(`🔄 [SERVER] Routing Trello request to dedicated API: ${dataType}`);
      
      try {
        const baseUrl = req.nextUrl.origin
        const trelloApiResponse = await fetch(`${baseUrl}/api/integrations/trello/data`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            integrationId,
            dataType,
            options
          })
        });

        if (!trelloApiResponse.ok) {
          const error = await trelloApiResponse.json();
          console.error(`❌ [SERVER] Trello API error:`, error);
          return Response.json(error, { status: trelloApiResponse.status });
        }

        const trelloResult = await trelloApiResponse.json();
        console.log(`✅ [SERVER] Trello API success:`, {
          dataType,
          resultCount: trelloResult.data?.length || 0
        });

        // Return the Trello API response directly (it's already in the correct format)
        return Response.json(trelloResult);
        
      } catch (error: any) {
        console.error(`❌ [SERVER] Trello API routing error:`, error);
        return Response.json({ error: 'Failed to route Trello request' }, { status: 500 });
      }
    }

    // OneDrive integration delegation
    if ((
      dataType === 'onedrive-folders'
    )) {
      console.log(`🔄 [SERVER] Routing OneDrive request to dedicated API: ${dataType}`);
      
      try {
        const baseUrl = req.nextUrl.origin
        const onedriveApiResponse = await fetch(`${baseUrl}/api/integrations/onedrive/data`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            integrationId,
            dataType,
            options
          })
        });

        if (!onedriveApiResponse.ok) {
          const error = await onedriveApiResponse.json();
          console.error(`❌ [SERVER] OneDrive API error:`, error);
          return Response.json(error, { status: onedriveApiResponse.status });
        }

        const onedriveResult = await onedriveApiResponse.json();
        console.log(`✅ [SERVER] OneDrive API success:`, {
          dataType,
          resultCount: onedriveResult.data?.length || 0
        });

        // Return the OneDrive API response directly (it's already in the correct format)
        return Response.json(onedriveResult);
        
      } catch (error: any) {
        console.error(`❌ [SERVER] OneDrive API routing error:`, error);
        return Response.json({ error: 'Failed to route OneDrive request' }, { status: 500 });
      }
    }

    // Gumroad integration delegation
    if ((
      dataType === 'gumroad_products'
    )) {
      console.log(`🔄 [SERVER] Routing Gumroad request to dedicated API: ${dataType}`);
      
      try {
        const baseUrl = req.nextUrl.origin
        const gumroadApiResponse = await fetch(`${baseUrl}/api/integrations/gumroad/data`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            integrationId,
            dataType,
            options
          })
        });

        if (!gumroadApiResponse.ok) {
          const error = await gumroadApiResponse.json();
          console.error(`❌ [SERVER] Gumroad API error:`, error);
          return Response.json(error, { status: gumroadApiResponse.status });
        }

        const gumroadResult = await gumroadApiResponse.json();
        console.log(`✅ [SERVER] Gumroad API success:`, {
          dataType,
          resultCount: gumroadResult.data?.length || 0
        });

        // Return the Gumroad API response directly (it's already in the correct format)
        return Response.json(gumroadResult);
        
      } catch (error: any) {
        console.error(`❌ [SERVER] Gumroad API routing error:`, error);
        return Response.json({ error: 'Failed to route Gumroad request' }, { status: 500 });
      }
    }

    // Blackbaud integration delegation
    if ((
      dataType === 'blackbaud_constituents'
    )) {
      console.log(`🔄 [SERVER] Routing Blackbaud request to dedicated API: ${dataType}`);
      
      try {
        const baseUrl = req.nextUrl.origin
        const blackbaudApiResponse = await fetch(`${baseUrl}/api/integrations/blackbaud/data`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            integrationId,
            dataType,
            options
          })
        });

        if (!blackbaudApiResponse.ok) {
          const error = await blackbaudApiResponse.json();
          console.error(`❌ [SERVER] Blackbaud API error:`, error);
          return Response.json(error, { status: blackbaudApiResponse.status });
        }

        const blackbaudResult = await blackbaudApiResponse.json();
        console.log(`✅ [SERVER] Blackbaud API success:`, {
          dataType,
          resultCount: blackbaudResult.data?.length || 0
        });

        // Return the Blackbaud API response directly (it's already in the correct format)
        return Response.json(blackbaudResult);
        
      } catch (error: any) {
        console.error(`❌ [SERVER] Blackbaud API routing error:`, error);
        return Response.json({ error: 'Failed to route Blackbaud request' }, { status: 500 });
      }
    }

    // Dropbox integration delegation
    if ((
      dataType === 'dropbox-folders'
    )) {
      console.log(`🔄 [SERVER] Routing Dropbox request to dedicated API: ${dataType}`);
      
      try {
        const baseUrl = req.nextUrl.origin
        const dropboxApiResponse = await fetch(`${baseUrl}/api/integrations/dropbox/data`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            integrationId,
            dataType,
            options
          })
        });

        if (!dropboxApiResponse.ok) {
          const error = await dropboxApiResponse.json();
          console.error(`❌ [SERVER] Dropbox API error:`, error);
          return Response.json(error, { status: dropboxApiResponse.status });
        }

        const dropboxResult = await dropboxApiResponse.json();
        console.log(`✅ [SERVER] Dropbox API success:`, {
          dataType,
          resultCount: dropboxResult.data?.length || 0
        });

        // Return the Dropbox API response directly (it's already in the correct format)
        return Response.json(dropboxResult);
        
      } catch (error: any) {
        console.error(`❌ [SERVER] Dropbox API routing error:`, error);
        return Response.json({ error: 'Failed to route Dropbox request' }, { status: 500 });
      }
    }

    // Box integration delegation
    if ((
      dataType === 'box-folders'
    )) {
      console.log(`🔄 [SERVER] Routing Box request to dedicated API: ${dataType}`);
      
      try {
        const baseUrl = req.nextUrl.origin
        const boxApiResponse = await fetch(`${baseUrl}/api/integrations/box/data`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            integrationId,
            dataType,
            options
          })
        });

        if (!boxApiResponse.ok) {
          const error = await boxApiResponse.json();
          console.error(`❌ [SERVER] Box API error:`, error);
          return Response.json(error, { status: boxApiResponse.status });
        }

        const boxResult = await boxApiResponse.json();
        console.log(`✅ [SERVER] Box API success:`, {
          dataType,
          resultCount: boxResult.data?.length || 0
        });

        // Return the Box API response directly (it's already in the correct format)
        return Response.json(boxResult);
        
      } catch (error: any) {
        console.error(`❌ [SERVER] Box API routing error:`, error);
        return Response.json({ error: 'Failed to route Box request' }, { status: 500 });
      }
    }

    // Find the data fetcher for the requested data type (legacy path)
    const dataFetcher = dataFetchers[dataType];
    if (!dataFetcher) {
      return Response.json({ error: `Unsupported data type: ${dataType}` }, { status: 400 });
    }

    // Fetch the data
    try {
      console.log(`🔍 [SERVER] Calling dataFetcher for ${dataType}...`);
      const data = await dataFetcher(integration, options);
      console.log(`✅ [SERVER] Data fetch successful for ${dataType}, result length:`, data?.length || 'unknown');
      return Response.json({ data });
    } catch (error: any) {
      console.error(`❌ [SERVER] Error calling dataFetcher for ${dataType}:`, error);
      
      // Check if it's an authentication error
      if (error.message?.includes('authentication') || error.message?.includes('expired') || 
          error.message?.includes('401') || error.message?.includes('unauthorized')) {
        return Response.json({ 
          error: 'Authentication expired. Please reconnect your account.',
          needsReconnection: true 
        }, { status: 401 });
      }
      
      // Check if it's a rate limit error
      if (error.message?.includes('rate limit') || error.message?.includes('429') || 
          error.message?.includes('too many requests')) {
        return Response.json({ 
          error: 'API rate limit exceeded. Please try again later.',
          retryAfter: 60 
        }, { status: 429 });
      }
      
      return Response.json({ error: error.message || 'Internal server error' }, { status: 500 });
    }
  } catch (error: any) {
    console.error('❌ [SERVER] Unexpected error in fetch-user-data:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    return Response.json({ 
      error: error.message || 'Internal server error',
      type: 'server_error'
    }, { status: 500 });
  }
}

function fallbackFetcher() {
  return {
    data: []
  } as any
}

// Legacy data fetchers - should be empty as all requests are routed to dedicated APIs
const dataFetchers: DataFetcher = {}

// Helper functions
function getPageTitle(page: any): string {
  // First, try the standard title property
  if (page.properties?.title?.title?.[0]?.plain_text) {
    return page.properties.title.title[0].plain_text
  }
  
  // Try the Name property (common alternative)
  if (page.properties?.Name?.title?.[0]?.plain_text) {
    return page.properties.Name.title[0].plain_text
  }
  
  // Search through all properties for any title-like field
  if (page.properties) {
    for (const [key, prop] of Object.entries(page.properties)) {
      const typedProp = prop as any
      
      // Check for title arrays
      if (typedProp.title && Array.isArray(typedProp.title) && typedProp.title.length > 0) {
        const titleText = typedProp.title[0].plain_text
        if (titleText && titleText.trim() !== '') {
          return titleText
        }
      }
      
      // Check for rich_text arrays (another common title format)
      if (typedProp.rich_text && Array.isArray(typedProp.rich_text) && typedProp.rich_text.length > 0) {
        const richText = typedProp.rich_text[0].plain_text
        if (richText && richText.trim() !== '') {
          return richText
        }
      }
    }
  }
  
  // Fallback
  return 'Untitled'
}

// Discord channel permission cache
const channelPermissionCache = new Map<string, { accessible: boolean, timestamp: number }>()
const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes

async function checkChannelPermissions(channelName: string, botToken: string): Promise<boolean> {
  const cacheKey = `${channelName}`
  const cached = channelPermissionCache.get(cacheKey)
  
  // Return cached result if still valid
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.accessible
  }
  
  try {
    // Try to get channel info to check if bot has access
    const channelResponse = await fetch(`https://discord.com/api/v10/channels/${channelName}`, {
      headers: {
        'Authorization': `Bot ${botToken}`,
        'Content-Type': 'application/json',
      },
    })
    
    const accessible = channelResponse.status === 200
    
    // Cache the result for 5 minutes
    channelPermissionCache.set(cacheKey, { accessible, timestamp: Date.now() })
    
    if (accessible) {
      console.log(`📋 Channel ${channelName}: accessible`)
    } else {
      console.log(`❌ Channel ${channelName}: bot cannot access (${channelResponse.status})`)
    }
    
    return accessible
  } catch (error) {
    console.warn(`Failed to check permissions for channel ${channelName}:`, error)
    // If we can't check permissions, assume accessible to avoid breaking functionality
    channelPermissionCache.set(cacheKey, { accessible: true, timestamp: Date.now() })
    return true
  }
}