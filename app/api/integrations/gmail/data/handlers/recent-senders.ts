import { GmailIntegration, GmailDataHandler } from '../types';
import { validateGmailIntegration, makeGmailApiRequest, getGmailAccessToken } from '../utils';

interface SenderAddress {
  value: string;
  label: string;
  email: string;
  group: string;
}

/**
 * Get recent email senders for Gmail New Email trigger filtering
 * Returns senders from the last 20 received emails + contacts, grouped with headers
 */
export const getGmailRecentSenders: GmailDataHandler<SenderAddress> = async (integration: GmailIntegration) => {
  // Validate integration and get decrypted access token
  validateGmailIntegration(integration);
  const accessToken = getGmailAccessToken(integration);

  console.log('[Gmail Recent Senders] Starting fetch with integration:', {
    hasToken: !!accessToken,
    tokenLength: accessToken?.length,
    integrationId: integration.id
  });

  // Fetch recent received emails (inbox + other folders)
  const messagesResponse = await makeGmailApiRequest(
    'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=20&labelIds=INBOX',
    accessToken
  );

  if (!messagesResponse.ok) {
    const errorText = await messagesResponse.text();
    console.error('[Gmail Recent Senders] Failed to fetch messages:', {
      status: messagesResponse.status,
      statusText: messagesResponse.statusText,
      error: errorText
    });
    throw new Error(`Failed to fetch messages: ${messagesResponse.statusText}`);
  }

  const messagesData = await messagesResponse.json();
  const messages = messagesData.messages || [];

  console.log('[Gmail Recent Senders] Found messages:', messages.length);

  // Fetch details for each message to get sender addresses
  const senderSet = new Set<string>();
  const senderDetails: { email: string; name?: string }[] = [];

  await Promise.all(
    messages.map(async (message: { id: string }) => {
      try {
        const detailResponse = await makeGmailApiRequest(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${message.id}?format=metadata&metadataHeaders=From`,
          accessToken
        );

        if (!detailResponse.ok) return;

        const detail = await detailResponse.json();
        const fromHeader = detail.payload?.headers?.find(
          (h: any) => h.name.toLowerCase() === 'from'
        );

        if (fromHeader?.value) {
          // Parse "Name <email@domain.com>" format
          const match = fromHeader.value.match(/^(.+?)\s*<(.+?)>$|^(.+)$/);
          const name = match?.[1]?.trim();
          const email = match?.[2]?.trim() || match?.[3]?.trim();

          if (email && !senderSet.has(email.toLowerCase())) {
            senderSet.add(email.toLowerCase());
            senderDetails.push({ email, name });
          }
        }
      } catch (error) {
        console.error(`Error fetching message ${message.id}:`, error);
      }
    })
  );

  // Fetch contacts (if scope available)
  const contactSet = new Set<string>();
  const contactDetails: { email: string; name?: string }[] = [];

  try {
    const contactsResponse = await makeGmailApiRequest(
      'https://people.googleapis.com/v1/people/me/connections?personFields=names,emailAddresses&pageSize=20',
      accessToken
    );

    if (contactsResponse.ok) {
      const contactsData = await contactsResponse.json();
      const connections = contactsData.connections || [];

      connections.forEach((person: any) => {
        const name = person.names?.[0]?.displayName;
        const emails = person.emailAddresses || [];

        emails.forEach((emailObj: any) => {
          const email = emailObj.value;
          if (email && !senderSet.has(email.toLowerCase()) && !contactSet.has(email.toLowerCase())) {
            contactSet.add(email.toLowerCase());
            contactDetails.push({ email, name });
          }
        });
      });
    }
  } catch (error) {
    console.warn('Could not fetch contacts (may need additional scope):', error);
  }

  // Build grouped results
  const results: SenderAddress[] = [];

  // Add recent senders
  senderDetails.forEach(({ email, name }) => {
    results.push({
      value: email,
      label: name ? `${name} <${email}>` : email,
      email,
      group: 'Recent Senders',
    });
  });

  // Add contacts
  contactDetails.forEach(({ email, name }) => {
    results.push({
      value: email,
      label: name ? `${name} <${email}>` : email,
      email,
      group: 'Your Contacts',
    });
  });

  console.log('[Gmail Recent Senders] Returning results:', {
    total: results.length,
    recentSenders: senderDetails.length,
    contacts: contactDetails.length
  });

  return results;
};
