// Test script for OneNote API with personal accounts
// Based on Microsoft documentation showing that OneNote API should work with personal accounts

import fetch from 'node-fetch';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Decrypt function
function decrypt(encryptedData) {
  try {
    // If data is already decrypted, return it
    if (!encryptedData.startsWith('enc:')) {
      return encryptedData;
    }
    
    const encryptionKey = process.env.ENCRYPTION_KEY;
    if (!encryptionKey) {
      throw new Error('Encryption key not found in environment variables');
    }
    
    const data = encryptedData.substring(4); // Remove 'enc:' prefix
    const parts = data.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = Buffer.from(parts[1], 'hex');
    
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(encryptionKey, 'hex'), iv);
    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    
    return decrypted.toString();
  } catch (error) {
    console.error('Decryption error:', error.message);
    return encryptedData; // Return original if decryption fails
  }
}

async function testOneNotePersonal() {
  console.log('🔍 Testing OneNote API with personal accounts...');
  
  try {
    // Get the integration data from the database
    const integrationId = process.argv[2] || '12da7c19-ab74-4112-a7c8-fc04998511df'; // Default to first integration if not provided
    console.log(`📋 Using integration ID: ${integrationId}`);
    
    // Get integration data from database
    console.log('🔍 Step 1: Fetching integration data from database...');
    const { data: integration, error } = await supabase
      .from('integrations')
      .select('*')
      .eq('id', integrationId)
      .single();
    
    if (error) {
      console.error('❌ Error fetching integration:', error.message);
      return;
    }
    
    if (!integration) {
      console.error('❌ Integration not found');
      return;
    }
    
    console.log('✅ Found integration:', integration.name);
    console.log('👤 User ID:', integration.user_id);
    console.log('📊 Status:', integration.status);
    
    // Get the refresh token
    let refreshToken = integration.refresh_token;
    console.log('🔐 Decrypting refresh token...');
    refreshToken = decrypt(refreshToken);
    
    // Refresh the token
    console.log('🔄 Step 2: Refreshing token...');
    const refreshResponse = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: process.env.NEXT_PUBLIC_MICROSOFT_CLIENT_ID,
        client_secret: process.env.MICROSOFT_CLIENT_SECRET,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
        scope: 'User.Read Notes.ReadWrite.All',
      }),
    });
    
    if (!refreshResponse.ok) {
      console.log(`❌ Token refresh failed: ${refreshResponse.status} ${refreshResponse.statusText}`);
      const errorData = await refreshResponse.json();
      console.log('Error details:', errorData);
      return;
    }
    
    const refreshData = await refreshResponse.json();
    console.log('✅ Token refresh successful!');
    console.log(`📋 Scope: ${refreshData.scope}`);
    console.log(`⏰ Expires in: ${refreshData.expires_in} seconds`);
    
    // Test different OneNote API endpoints using the recommended approach
    console.log('\n🔍 Step 3: Testing OneNote API endpoints...');
    
    // Test endpoints with different formats
    const endpoints = [
      // User notebooks - recommended in docs for personal accounts
      { url: 'https://graph.microsoft.com/v1.0/me/onenote/notebooks', name: 'Notebooks (me)' },
      { url: 'https://graph.microsoft.com/v1.0/me/onenote/sections', name: 'Sections (me)' },
      { url: 'https://graph.microsoft.com/v1.0/me/onenote/pages', name: 'Pages (me)' },
      
      // Try beta API
      { url: 'https://graph.microsoft.com/beta/me/onenote/notebooks', name: 'Notebooks (beta)' },
      
      // Try with minimal query parameters
      { url: 'https://graph.microsoft.com/v1.0/me/onenote/notebooks?$top=5', name: 'Notebooks (top 5)' },
      
      // Try with different accept headers
      { url: 'https://graph.microsoft.com/v1.0/me/onenote', name: 'OneNote root', headers: { 'Accept': 'application/json' } },
      
      // Test other Microsoft services for comparison
      { url: 'https://graph.microsoft.com/v1.0/me', name: 'User profile' },
      { url: 'https://graph.microsoft.com/v1.0/me/drive', name: 'OneDrive' },
      { url: 'https://graph.microsoft.com/v1.0/me/mailFolders', name: 'Mail folders' },
    ];
    
    for (const endpoint of endpoints) {
      console.log(`\n📊 Testing: ${endpoint.name}`);
      
      try {
        const headers = {
          'Authorization': `Bearer ${refreshData.access_token}`,
          'Content-Type': 'application/json',
          ...(endpoint.headers || {})
        };
        
        const response = await fetch(endpoint.url, { headers });
        console.log(`Status: ${response.status} ${response.statusText}`);
        
        if (response.ok) {
          const data = await response.json();
          if (endpoint.name.includes('OneNote')) {
            console.log('✅ SUCCESS! OneNote API works with this personal account!');
            
            if (data.value && Array.isArray(data.value)) {
              console.log(`Found ${data.value.length} items`);
              if (data.value.length > 0) {
                console.log('First item:', JSON.stringify(data.value[0], null, 2).substring(0, 200) + '...');
              }
            } else {
              console.log('Response data:', JSON.stringify(data, null, 2).substring(0, 200) + '...');
            }
          } else {
            console.log(`✅ ${endpoint.name} works`);
          }
        } else {
          const errorText = await response.text();
          try {
            const errorData = JSON.parse(errorText);
            console.log(`❌ ${endpoint.name} failed:`, JSON.stringify(errorData, null, 2).substring(0, 300));
          } catch {
            console.log(`❌ ${endpoint.name} failed:`, errorText.substring(0, 300));
          }
        }
      } catch (error) {
        console.log(`❌ Error testing ${endpoint.name}:`, error.message);
      }
    }
    
    // Try creating a new notebook to test write permissions
    console.log('\n📝 Testing notebook creation:');
    try {
      const createResponse = await fetch('https://graph.microsoft.com/v1.0/me/onenote/notebooks', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${refreshData.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          displayName: 'Test Notebook ' + new Date().toISOString()
        })
      });
      
      console.log(`Status: ${createResponse.status} ${createResponse.statusText}`);
      
      if (createResponse.ok) {
        const data = await createResponse.json();
        console.log('✅ Successfully created notebook!');
        console.log('Notebook ID:', data.id);
      } else {
        const errorText = await createResponse.text();
        try {
          const errorData = JSON.parse(errorText);
          console.log('❌ Failed to create notebook:', JSON.stringify(errorData, null, 2).substring(0, 300));
        } catch {
          console.log('❌ Failed to create notebook:', errorText.substring(0, 300));
        }
      }
    } catch (error) {
      console.log('❌ Error creating notebook:', error.message);
    }
    
    console.log('\n✅ Test completed');
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

testOneNotePersonal(); 