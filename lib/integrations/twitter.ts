import fetch from 'node-fetch';

export async function getTwitterMentionsForDropdown(integration: any, params: any) {
  const accessToken = integration.access_token;
  if (!accessToken) throw new Error('No access token');

  try {
    // Get the current user's ID
    const userResponse = await fetch('https://api.twitter.com/2/users/me', {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    
    if (!userResponse.ok) {
      const errorText = await userResponse.text();
      console.error('Twitter user info error:', userResponse.status, errorText);
      throw new Error(`Failed to get user info: ${userResponse.status} - ${errorText}`);
    }
    
    const userData = await userResponse.json();
    const userId = userData.data.id;
    console.log('Twitter user ID:', userId);

    // Fetch recent mentions
    const url = new URL(`https://api.twitter.com/2/users/${userId}/mentions`);
    url.searchParams.set('max_results', '20');
    url.searchParams.set('tweet.fields', 'created_at,text');
    
    console.log('Fetching mentions from:', url.toString());
    
    const response = await fetch(url.toString(), {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Twitter mentions error:', response.status, errorText);
      
      // Handle specific error cases
      if (response.status === 403) {
        throw new Error('Insufficient permissions. Please reconnect your Twitter account with tweet.read scope.');
      } else if (response.status === 401) {
        throw new Error('Authentication failed. Please reconnect your Twitter account.');
      } else {
        throw new Error(`Failed to fetch mentions: ${response.status} - ${errorText}`);
      }
    }
    
    const data = await response.json();
    console.log('Twitter mentions response:', data);
    
    const mentions = data.data || [];
    console.log('Found mentions:', mentions.length);
    
    // If no mentions found, return empty array (will show "No mentions found" in dropdown)
    if (mentions.length === 0) {
      console.log('No mentions found, returning empty array');
      return [];
    }
    
    // Map to dropdown options
    return mentions.map((tweet: any) => ({
      value: tweet.id,
      label: `${tweet.text.slice(0, 60)}${tweet.text.length > 60 ? '…' : ''} (${tweet.id})`
    }));
  } catch (error) {
    console.error('Twitter mentions dropdown error:', error);
    throw error;
  }
} 