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
    
    // Use the modern crypto API
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(key, 'hex'), iv);
    decipher.setAutoPadding(false);
    let decrypted = decipher.update(encrypted, null, 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted.replace(/\0+$/, ''); // Remove padding
  } catch (error) {
    console.error('Decryption error:', error);
    return null;
  }
}

async function testOneNoteWithCurl() {
  console.log('🔍 Testing OneNote API with curl...\n');

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

    // Test OneNote API endpoints
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
        name: 'OneNote Sections',
        url: 'https://graph.microsoft.com/v1.0/me/onenote/sections'
      },
      {
        name: 'OneNote Pages',
        url: 'https://graph.microsoft.com/v1.0/me/onenote/pages'
      },
      {
        name: 'OneNote Beta Notebooks',
        url: 'https://graph.microsoft.com/beta/me/onenote/notebooks'
      },
      {
        name: 'OneDrive Root (Fallback)',
        url: 'https://graph.microsoft.com/v1.0/me/drive/root/children'
      },
      {
        name: 'OneDrive Search for OneNote files',
        url: 'https://graph.microsoft.com/v1.0/me/drive/root/search(q=\'.onetoc2\')'
      }
    ];

    console.log('\n🔍 Testing endpoints with curl...\n');

    for (const endpoint of endpoints) {
      console.log(`📋 Testing: ${endpoint.name}`);
      console.log(`🔗 URL: ${endpoint.url}`);
      
      const curlCommand = `curl -s -H "Authorization: Bearer ${accessToken}" -H "Content-Type: application/json" "${endpoint.url}"`;
      
      try {
        const { execSync } = await import('child_process');
        const result = execSync(curlCommand, { encoding: 'utf8' });
        
        try {
          const data = JSON.parse(result);
          
          if (data.error) {
            console.log(`❌ Error: ${data.error.message || JSON.stringify(data.error)}`);
          } else if (data.value) {
            const count = data.value.length;
            console.log(`✅ Success! Found ${count} items`);
            
            if (count > 0 && endpoint.name.includes('Notebooks')) {
              console.log('📋 Notebooks:');
              data.value.forEach((notebook, index) => {
                console.log(`  ${index + 1}. ${notebook.displayName || notebook.name || 'Untitled'} (ID: ${notebook.id})`);
              });
            } else if (count > 0 && endpoint.name.includes('Sections')) {
              console.log('📋 Sections:');
              data.value.forEach((section, index) => {
                console.log(`  ${index + 1}. ${section.displayName || section.name || 'Untitled'} (ID: ${section.id})`);
              });
            } else if (count > 0 && endpoint.name.includes('Pages')) {
              console.log('📋 Pages:');
              data.value.forEach((page, index) => {
                console.log(`  ${index + 1}. ${page.title || page.name || 'Untitled'} (ID: ${page.id})`);
              });
            } else if (count > 0 && endpoint.name.includes('OneDrive')) {
              // Look for OneNote files
              const oneNoteFiles = data.value.filter(item => 
                item.name?.endsWith('.onetoc2') || 
                item.name?.endsWith('.one') ||
                item.name?.toLowerCase().includes('onenote')
              );
              
              if (oneNoteFiles.length > 0) {
                console.log(`📋 OneNote files in OneDrive: ${oneNoteFiles.length}`);
                oneNoteFiles.forEach((file, index) => {
                  console.log(`  ${index + 1}. ${file.name} (ID: ${file.id})`);
                });
              } else {
                console.log('📋 No OneNote files found in OneDrive');
              }
            }
          } else {
            console.log('✅ Success! (No items returned)');
          }
        } catch (parseError) {
          console.log(`❌ Failed to parse JSON: ${result.substring(0, 200)}...`);
        }
      } catch (execError) {
        console.log(`❌ Curl command failed: ${execError.message}`);
      }
      
      console.log('');
    }

    console.log('✅ OneNote API testing completed!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testOneNoteWithCurl(); 