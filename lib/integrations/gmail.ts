import { google } from 'googleapis';
import { createClient } from '@supabase/supabase-js';

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

export class GmailService {
  private supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  private gmail;

  constructor(accessToken: string) {
    oauth2Client.setCredentials({ access_token: accessToken });
    this.gmail = google.gmail({ version: 'v1', auth: oauth2Client });
  }

  static async refreshToken(userId: string, integrationId: string): Promise<string | null> {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    
    const { data: integration, error } = await supabase
      .from('integrations')
      .select('refresh_token, consecutive_failures')
      .eq('user_id', userId)
      .eq('id', integrationId)
      .single();

    if (error || !integration || !integration.refresh_token) {
      console.error('No refresh token found for this integration.');
      return null;
    }

    try {
      oauth2Client.setCredentials({ refresh_token: integration.refresh_token });
      const { credentials } = await oauth2Client.refreshAccessToken();
      const { access_token, expiry_date } = credentials;

      if (access_token) {
        // Update the integration with the new token and expiration
        await supabase
          .from('integrations')
          .update({ 
            access_token, 
            expires_at: expiry_date ? new Date(expiry_date).toISOString() : null 
          })
          .eq('id', integrationId);
        
        return access_token;
      }
      return null;
    } catch (refreshError) {
      console.error('Failed to refresh access token:', refreshError);
      
      // Mark integration as needing re-authorization
      try {
        await supabase
          .from('integrations')
          .update({
            status: 'needs_reauthorization',
            last_failure_at: new Date().toISOString(),
            consecutive_failures: (integration.consecutive_failures || 0) + 1,
            disconnect_reason: 'Token refresh failed'
          })
          .eq('id', integrationId);
        
        console.log(`Marked Gmail integration ${integrationId} for reauthorization due to refresh failure`);
      } catch (updateError) {
        console.error('Failed to update integration status:', updateError);
      }
      
      return null;
    }
  }

  async sendEmail(params: { to: string; subject: string; body: string; cc?: string; bcc?: string; }) {
    const { to, subject, body, cc, bcc } = params;
    const rawMessage = [
      `From: me`,
      `To: ${to}`,
      cc ? `Cc: ${cc}` : '',
      bcc ? `Bcc: ${bcc}` : '',
      `Subject: ${subject}`,
      '',
      body
    ].filter(Boolean).join('\n');

    const encodedMessage = Buffer.from(rawMessage).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    try {
      const response = await this.gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: encodedMessage
        }
      });
      return response.data;
    } catch (error) {
      console.error('Failed to send email:', error);
      throw new Error('Could not send email via Gmail.');
    }
  }
}

export async function getGoogleContacts(accessToken: string) {
  const oauth2Client = new google.auth.OAuth2()
  oauth2Client.setCredentials({ access_token: accessToken })

  const people = google.people({ version: "v1", auth: oauth2Client })

  try {
    const response = await people.people.connections.list({
      resourceName: "people/me",
      personFields: "names,emailAddresses",
      pageSize: 200, // Adjust as needed
    })

    const contacts =
      response.data.connections
        ?.map((person) => {
          const primaryName = person.names?.find(
            (name) => name.metadata?.primary,
          )
          const primaryEmail = person.emailAddresses?.find(
            (email) => email.metadata?.primary,
          )

          if (primaryName && primaryEmail) {
            return {
              name: primaryName.displayName,
              email: primaryEmail.value,
            }
          }
          return null
        })
        .filter((contact) => contact !== null) || []

    return contacts
  } catch (error) {
    console.error("Failed to get Google contacts:", error)
    throw new Error("Failed to get Google contacts")
  }
}

export async function getEnhancedGoogleContacts(accessToken: string) {
  const oauth2Client = new google.auth.OAuth2()
  oauth2Client.setCredentials({ access_token: accessToken })

  const people = google.people({ version: "v1", auth: oauth2Client })

  try {
    const response = await people.people.connections.list({
      resourceName: "people/me",
      personFields: "names,emailAddresses,photos",
      pageSize: 500, // Get more contacts
    })

    const contacts =
      response.data.connections
        ?.map((person) => {
          const names = person.names || []
          const emailAddresses = person.emailAddresses || []
          const photos = person.photos || []

          const primaryName = names.find((name) => name.metadata?.primary)
          const displayName = primaryName?.displayName || 
                             names[0]?.displayName || 
                             'Unknown Contact'

          // Get all email addresses for this contact (to handle aliases)
          const emails = emailAddresses
            .filter((email) => email.value && isValidContactEmail(email.value))
            .map((email) => ({
              email: email.value!,
              isPrimary: email.metadata?.primary || false,
              type: email.type || 'other'
            }))

          if (emails.length === 0) return null

          const primaryEmail = emails.find(e => e.isPrimary) || emails[0]
          const photo = photos.find(p => p.metadata?.primary)?.url

          return {
            name: displayName,
            email: primaryEmail.email,
            allEmails: emails.map(e => e.email), // For alias detection
            photo: photo,
            type: 'google_contact',
            aliases: emails.length > 1 ? emails.slice(1).map(e => e.email) : []
          }
        })
        .filter((contact) => contact !== null) || []

    return contacts
  } catch (error) {
    console.error("Failed to get enhanced Google contacts:", error)
    throw new Error("Failed to get enhanced Google contacts")
  }
}

function isValidContactEmail(email: string): boolean {
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
  return emailRegex.test(email.trim())
}
