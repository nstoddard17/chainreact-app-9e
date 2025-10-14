import fetch from 'node-fetch';

import { logger } from '@/lib/utils/logger'

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
      logger.error('Twitter user info error:', userResponse.status, errorText);
      throw new Error(`Failed to get user info: ${userResponse.status} - ${errorText}`);
    }
    
    const userData = await userResponse.json();
    const userId = userData.data.id;
    logger.debug('Twitter user ID:', userId);

    // Fetch recent mentions
    const url = new URL(`https://api.twitter.com/2/users/${userId}/mentions`);
    url.searchParams.set('max_results', '20');
    url.searchParams.set('tweet.fields', 'created_at,text');
    
    logger.debug('Fetching mentions from:', url.toString());
    
    const response = await fetch(url.toString(), {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Twitter mentions error:', response.status, errorText);
      
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
    logger.debug('Twitter mentions response:', data);
    
    const mentions = data.data || [];
    logger.debug('Found mentions:', mentions.length);
    
    // If no mentions found, return empty array (will show "No mentions found" in dropdown)
    if (mentions.length === 0) {
      logger.debug('No mentions found, returning empty array');
      return [];
    }
    
    // Map to dropdown options
    return mentions.map((tweet: any) => ({
      value: tweet.id,
      label: `${tweet.text.slice(0, 60)}${tweet.text.length > 60 ? '…' : ''} (${tweet.id})`
    }));
  } catch (error) {
    logger.error('Twitter mentions dropdown error:', error);
    throw error;
  }
} 