import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// Configuration
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Decryption function
function decrypt(encryptedText, key) {
  try {
    const [ivHex, encryptedHex] = encryptedText.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const encrypted = Buffer.from(encryptedHex, 'hex');
    
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(key, 'hex'), iv);
    decipher.setAutoPadding(false);
    let decrypted = decipher.update(encrypted, null, 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted.replace(/\0+$/, '');
  } catch (error) {
    console.error('Decryption error:', error);
    return null;
  }
}

async function debugOneNoteAPI() {
  console.log('🔍 Debugging OneNote API...\n');

  try {
    // Get the integration
    const { data: integrations } = await supabase
      .from('integrations')
      .select('*')
      .eq('provider', 'microsoft-onenote')
      .eq('status', 'connected')
      .limit(1);

    if (!integrations || integrations.length === 0) {
      console.log('❌ No connected OneNote integrations found');
      return;
    }

    const integration = integrations[0];
    console.log(`✅ Found integration: ${integration.id}`);

    // Decrypt the token
    let accessToken = integration.access_token;
    if (accessToken && accessToken.includes(':')) {
      accessToken = decrypt(accessToken, ENCRYPTION_KEY);
      if (!accessToken) {
        console.log('❌ Failed to decrypt access token');
        return;
      }
      console.log('✅ Token decrypted successfully');
    }

    console.log(`🔑 Token preview: ${accessToken.substring(0, 50)}...`);
    console.log(`📏 Token length: ${accessToken.length}`);

    // Test OneNote API endpoints directly
    const endpoints = [
      {
        name: 'OneNote Notebooks (v1.0)',
        url: 'https://graph.microsoft.com/v1.0/me/onenote/notebooks'
      },
      {
        name: 'OneNote Notebooks (with expand)',
        url: 'https://graph.microsoft.com/v1.0/me/onenote/notebooks?$expand=sections&$top=100'
      },
      {
        name: 'OneNote Beta Notebooks',
        url: 'https://graph.microsoft.com/beta/me/onenote/notebooks'
      },
      {
        name: 'OneDrive Root',
        url: 'https://graph.microsoft.com/v1.0/me/drive/root/children'
      },
      {
        name: 'OneDrive Search for .onetoc2',
        url: 'https://graph.microsoft.com/v1.0/me/drive/root/search(q=\'.onetoc2\')'
      },
      {
        name: 'OneDrive Search for OneNote',
        url: 'https://graph.microsoft.com/v1.0/me/drive/root/search(q=\'OneNote\')'
      }
    ];

    console.log('\n🔍 Testing endpoints...\n');

    for (const endpoint of endpoints) {
      console.log(`📋 Testing: ${endpoint.name}`);
      console.log(`🔗 URL: ${endpoint.url}`);
      
      try {
        const response = await fetch(endpoint.url, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        });

        console.log(`📊 Status: ${response.status} ${response.statusText}`);

        if (response.ok) {
          const data = await response.json();
          
          if (data.error) {
            console.log(`❌ API Error: ${data.error.message || JSON.stringify(data.error)}`);
          } else if (data.value) {
            const count = data.value.length;
            console.log(`✅ Success! Found ${count} items`);
            
            if (count > 0) {
              console.log('📋 Items:');
              data.value.forEach((item, index) => {
                const name = item.displayName || item.name || item.title || 'Untitled';
                console.log(`  ${index + 1}. ${name} (ID: ${item.id})`);
                
                // For OneNote notebooks, show more details
                if (endpoint.name.includes('OneNote')) {
                  console.log(`     - Sections: ${item.sections?.length || 0}`);
                  console.log(`     - Last Modified: ${item.lastModifiedDateTime}`);
                  console.log(`     - Web URL: ${item.webUrl}`);
                }
              });
            }
          } else {
            console.log('✅ Success! (No items returned)');
          }
        } else {
          const errorText = await response.text();
          console.log(`❌ HTTP Error: ${errorText}`);
        }
      } catch (error) {
        console.log(`❌ Request failed: ${error.message}`);
      }
      
      console.log('');
    }

    console.log('✅ OneNote API debugging completed!');

  } catch (error) {
    console.error('❌ Debug failed:', error);
  }
}

debugOneNoteAPI(); 