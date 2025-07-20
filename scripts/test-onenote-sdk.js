// Test script for OneNote API with Microsoft Graph SDK
import 'isomorphic-fetch';
import { Client } from '@microsoft/microsoft-graph-client';
import dotenv from 'dotenv';
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

// Custom authentication provider for Microsoft Graph Client
class TokenProvider {
  constructor(accessToken) {
    this.accessToken = accessToken;
  }

  getAccessToken() {
    return Promise.resolve(this.accessToken);
  }
}

async function testOneNoteWithSDK() {
  console.log('🔍 Testing OneNote API with Microsoft Graph SDK...');
  
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
    
    // Initialize Microsoft Graph Client
    console.log('\n🔍 Step 3: Initializing Microsoft Graph Client...');
    const client = Client.init({
      authProvider: (done) => {
        done(null, refreshData.access_token);
      },
      debugLogging: true
    });
    
    // Test different Microsoft Graph endpoints
    console.log('\n📊 Testing user profile with SDK...');
    try {
      const user = await client.api('/me').get();
      console.log('✅ User profile works!');
      console.log('👤 User:', user.displayName, `(${user.userPrincipalName})`);
    } catch (error) {
      console.log('❌ Error getting user profile:', error.message);
    }
    
    console.log('\n📊 Testing OneDrive with SDK...');
    try {
      const drive = await client.api('/me/drive').get();
      console.log('✅ OneDrive works!');
      console.log('📁 Drive type:', drive.driveType);
    } catch (error) {
      console.log('❌ Error getting OneDrive:', error.message);
    }
    
    // Test OneNote endpoints with SDK
    console.log('\n📊 Testing OneNote notebooks with SDK...');
    try {
      const notebooks = await client.api('/me/onenote/notebooks').get();
      console.log('✅ SUCCESS! OneNote notebooks work with SDK!');
      console.log(`Found ${notebooks.value.length} notebooks`);
      if (notebooks.value.length > 0) {
        console.log('First notebook:', notebooks.value[0].displayName);
      }
    } catch (error) {
      console.log('❌ Error getting OneNote notebooks:', error.message);
      console.log('Error details:', error);
    }
    
    console.log('\n📊 Testing OneNote sections with SDK...');
    try {
      const sections = await client.api('/me/onenote/sections').get();
      console.log('✅ OneNote sections work with SDK!');
      console.log(`Found ${sections.value.length} sections`);
    } catch (error) {
      console.log('❌ Error getting OneNote sections:', error.message);
    }
    
    console.log('\n📊 Testing OneNote pages with SDK...');
    try {
      const pages = await client.api('/me/onenote/pages').get();
      console.log('✅ OneNote pages work with SDK!');
      console.log(`Found ${pages.value.length} pages`);
    } catch (error) {
      console.log('❌ Error getting OneNote pages:', error.message);
    }
    
    // Try creating a notebook with SDK
    console.log('\n📝 Testing notebook creation with SDK...');
    try {
      const newNotebook = await client.api('/me/onenote/notebooks').post({
        displayName: 'Test Notebook SDK ' + new Date().toISOString()
      });
      console.log('✅ Successfully created notebook with SDK!');
      console.log('Notebook ID:', newNotebook.id);
    } catch (error) {
      console.log('❌ Error creating notebook with SDK:', error.message);
      if (error.statusCode) {
        console.log(`Status code: ${error.statusCode}`);
      }
      if (error.body) {
        try {
          const errorBody = JSON.parse(error.body);
          console.log('Error body:', errorBody);
        } catch {
          console.log('Error body:', error.body);
        }
      }
    }
    
    console.log('\n✅ SDK test completed');
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

testOneNoteWithSDK(); 