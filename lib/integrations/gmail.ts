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
      .select('refresh_token')
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
      // TODO: Mark integration as needing re-authorization
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