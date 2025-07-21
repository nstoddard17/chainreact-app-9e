#!/usr/bin/env node

/**
 * OneNote Integration Test Script
 * 
 * This script helps debug OneNote integration issues by testing:
 * 1. Database connection and integration lookup
 * 2. Token decryption
 * 3. Token validation and refresh
 * 4. OneNote API calls
 */

import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

// Configuration
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing Supabase configuration')
  console.error('Please set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

if (!ENCRYPTION_KEY) {
  console.error('❌ Missing encryption key')
  console.error('Please set ENCRYPTION_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

// Decryption function (simplified version)
function decrypt(encryptedData, secret) {
  try {
    const [iv, encrypted] = encryptedData.split(':')
    const decipher = crypto.createDecipher('aes-256-cbc', secret)
    let decrypted = decipher.update(encrypted, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    return decrypted
  } catch (error) {
    throw new Error(`Decryption failed: ${error.message}`)
  }
}

async function testOneNoteIntegration() {
  console.log('🔍 Testing OneNote Integration...\n')

  try {
    // Step 1: Find OneNote integrations
    console.log('📋 Step 1: Looking for OneNote integrations...')
    const { data: integrations, error } = await supabase
      .from('integrations')
      .select('*')
      .eq('provider', 'microsoft-onenote')

    if (error) {
      console.error('❌ Database error:', error)
      return
    }

    console.log(`📊 Found ${integrations.length} OneNote integration(s)`)
    
    if (integrations.length === 0) {
      console.log('⚠️  No OneNote integrations found. Users need to connect OneNote first.')
      return
    }

    // Step 2: Test each integration
    for (const integration of integrations) {
      console.log(`\n🔍 Testing integration ID: ${integration.id}`)
      console.log(`👤 User ID: ${integration.user_id}`)
      console.log(`📊 Status: ${integration.status}`)
      console.log(`🔑 Has access token: ${!!integration.access_token}`)
      console.log(`🔄 Has refresh token: ${!!integration.refresh_token}`)
      console.log(`⏰ Expires at: ${integration.expires_at}`)

      if (integration.status !== 'connected') {
        console.log('⚠️  Integration not connected, skipping...')
        continue
      }

      // Step 3: Test token decryption
      console.log('\n🔐 Step 3: Testing token decryption...')
      try {
        let accessToken = integration.access_token
        let refreshToken = integration.refresh_token

        if (accessToken && accessToken.includes(':')) {
          accessToken = decrypt(accessToken, ENCRYPTION_KEY)
          console.log('✅ Access token decrypted successfully')
        } else {
          console.log('ℹ️  Access token appears to be already decrypted')
        }

        if (refreshToken && refreshToken.includes(':')) {
          refreshToken = decrypt(refreshToken, ENCRYPTION_KEY)
          console.log('✅ Refresh token decrypted successfully')
        } else {
          console.log('ℹ️  Refresh token appears to be already decrypted')
        }

        // Step 4: Test OneNote API call
        console.log('\n🌐 Step 4: Testing OneNote API call...')
        const response = await fetch('https://graph.microsoft.com/v1.0/me/onenote/notebooks', {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        })

        console.log(`📊 API Response Status: ${response.status} ${response.statusText}`)

        if (response.ok) {
          const data = await response.json()
          console.log('✅ OneNote API call successful!')
          console.log(`📚 Found ${data.value?.length || 0} notebooks`)
        } else {
          const errorData = await response.json().catch(() => ({}))
          console.error('❌ OneNote API call failed:')
          console.error('Error details:', errorData)
          
          if (response.status === 401) {
            console.log('🔄 Token appears to be expired, attempting refresh...')
            
            // Step 5: Test token refresh
            if (refreshToken) {
              console.log('\n🔄 Step 5: Testing token refresh...')
              
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
                  scope: 'offline_access openid profile email User.Read Notes.ReadWrite.All',
                }),
              })

              const refreshData = await refreshResponse.json()
              console.log(`📊 Refresh Response Status: ${refreshResponse.status}`)

              if (refreshResponse.ok) {
                console.log('✅ Token refresh successful!')
                console.log(`🆕 New access token: ${refreshData.access_token?.substring(0, 20)}...`)
                console.log(`📋 Scope: ${refreshData.scope || 'No scope returned'}`)
                console.log(`⏰ Expires in: ${refreshData.expires_in} seconds`)
                
                // Test API call with new token
                console.log('\n🌐 Step 6: Testing API call with refreshed token...')
                const newResponse = await fetch('https://graph.microsoft.com/v1.0/me/onenote/notebooks', {
                  headers: {
                    'Authorization': `Bearer ${refreshData.access_token}`,
                    'Content-Type': 'application/json',
                  },
                })

                console.log(`📊 New API Response Status: ${newResponse.status} ${newResponse.statusText}`)
                
                if (newResponse.ok) {
                  const newData = await newResponse.json()
                  console.log('✅ API call with refreshed token successful!')
                  console.log(`📚 Found ${newData.value?.length || 0} notebooks`)
                } else {
                  const newErrorData = await newResponse.json().catch(() => ({}))
                  console.error('❌ API call with refreshed token still failed:')
                  console.error('New error details:', newErrorData)
                  
                  // Test with a different Microsoft Graph endpoint to see if it's a general auth issue
                  console.log('\n🔍 Step 7: Testing general Microsoft Graph access...')
                  const userResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
                    headers: {
                      'Authorization': `Bearer ${refreshData.access_token}`,
                      'Content-Type': 'application/json',
                    },
                  })
                  
                  console.log(`📊 User API Response Status: ${userResponse.status} ${userResponse.statusText}`)
                  if (userResponse.ok) {
                    const userData = await userResponse.json()
                    console.log('✅ General Microsoft Graph access works!')
                    console.log(`👤 User: ${userData.displayName} (${userData.userPrincipalName})`)
                    
                    // Check user's services and capabilities
                    console.log('\n🔍 Step 7.5: Checking user services and capabilities...')
                    const servicesResponse = await fetch('https://graph.microsoft.com/v1.0/me/services', {
                      headers: {
                        'Authorization': `Bearer ${refreshData.access_token}`,
                        'Content-Type': 'application/json',
                      },
                    })
                    console.log(`📊 Services API Response Status: ${servicesResponse.status} ${servicesResponse.statusText}`)
                    
                    if (servicesResponse.ok) {
                      const servicesData = await servicesResponse.json()
                      console.log('✅ Services API works!')
                      console.log('📋 Available services:', servicesData.value?.map(s => s.id).join(', ') || 'None')
                    }
                    
                    // Check user's license details
                    const licenseResponse = await fetch('https://graph.microsoft.com/v1.0/me/licenseDetails', {
                      headers: {
                        'Authorization': `Bearer ${refreshData.access_token}`,
                        'Content-Type': 'application/json',
                      },
                    })
                    console.log(`📊 License API Response Status: ${licenseResponse.status} ${licenseResponse.statusText}`)
                    
                    if (licenseResponse.ok) {
                      const licenseData = await licenseResponse.json()
                      console.log('✅ License API works!')
                      console.log('📋 License details:', licenseData.value?.map(l => l.skuId).join(', ') || 'None')
                    }
                  } else {
                    const userErrorData = await userResponse.json().catch(() => ({}))
                    console.error('❌ General Microsoft Graph access also failed:')
                    console.error('User API error details:', userErrorData)
                  }
                  
                  // Test different OneNote endpoints
                  console.log('\n🔍 Step 8: Testing different OneNote endpoints...')
                  
                  // Test OneNote sections endpoint
                  const sectionsResponse = await fetch('https://graph.microsoft.com/v1.0/me/onenote/sections', {
                    headers: {
                      'Authorization': `Bearer ${refreshData.access_token}`,
                      'Content-Type': 'application/json',
                    },
                  })
                  console.log(`📊 Sections API Response Status: ${sectionsResponse.status} ${sectionsResponse.statusText}`)
                  
                  // Test OneNote pages endpoint
                  const pagesResponse = await fetch('https://graph.microsoft.com/v1.0/me/onenote/pages', {
                    headers: {
                      'Authorization': `Bearer ${refreshData.access_token}`,
                      'Content-Type': 'application/json',
                    },
                  })
                  console.log(`📊 Pages API Response Status: ${pagesResponse.status} ${pagesResponse.statusText}`)
                  
                  // Test OneNote notebooks with different format
                  const notebooksV2Response = await fetch('https://graph.microsoft.com/v1.0/me/onenote/notebooks?$select=id,displayName,createdDateTime', {
                    headers: {
                      'Authorization': `Bearer ${refreshData.access_token}`,
                      'Content-Type': 'application/json',
                    },
                  })
                  console.log(`📊 Notebooks V2 API Response Status: ${notebooksV2Response.status} ${notebooksV2Response.statusText}`)
                  
                  if (notebooksV2Response.ok) {
                    const notebooksData = await notebooksV2Response.json()
                    console.log(`✅ OneNote notebooks V2 works! Found ${notebooksData.value?.length || 0} notebooks`)
                  }
                  
                  // Test alternative OneNote endpoints and patterns
                  console.log('\n🔍 Step 9: Testing alternative OneNote patterns...')
                  
                  // Test with different headers
                  const notebooksWithHeadersResponse = await fetch('https://graph.microsoft.com/v1.0/me/onenote/notebooks', {
                    headers: {
                      'Authorization': `Bearer ${refreshData.access_token}`,
                      'Content-Type': 'application/json',
                      'Accept': 'application/json',
                      'User-Agent': 'ChainReact-App/1.0',
                    },
                  })
                  console.log(`📊 Notebooks with extra headers: ${notebooksWithHeadersResponse.status} ${notebooksWithHeadersResponse.statusText}`)
                  
                  // Test with beta endpoint
                  const notebooksBetaResponse = await fetch('https://graph.microsoft.com/beta/me/onenote/notebooks', {
                    headers: {
                      'Authorization': `Bearer ${refreshData.access_token}`,
                      'Content-Type': 'application/json',
                    },
                  })
                  console.log(`📊 Notebooks Beta API: ${notebooksBetaResponse.status} ${notebooksBetaResponse.statusText}`)
                  
                  // Test with different query parameters
                  const notebooksWithParamsResponse = await fetch('https://graph.microsoft.com/v1.0/me/onenote/notebooks?$top=10&$orderby=displayName', {
                    headers: {
                      'Authorization': `Bearer ${refreshData.access_token}`,
                      'Content-Type': 'application/json',
                    },
                  })
                  console.log(`📊 Notebooks with params: ${notebooksWithParamsResponse.status} ${notebooksWithParamsResponse.statusText}`)
                  
                  // Test user's OneNote capabilities
                  console.log('\n🔍 Step 10: Testing OneNote capabilities...')
                  const capabilitiesResponse = await fetch('https://graph.microsoft.com/v1.0/me/onenote', {
                    headers: {
                      'Authorization': `Bearer ${refreshData.access_token}`,
                      'Content-Type': 'application/json',
                    },
                  })
                  console.log(`📊 OneNote capabilities: ${capabilitiesResponse.status} ${capabilitiesResponse.statusText}`)
                  
                  if (capabilitiesResponse.ok) {
                    const capabilitiesData = await capabilitiesResponse.json()
                    console.log('✅ OneNote capabilities available:', capabilitiesData)
                  }
                  
                  // Test with different authentication header format
                  console.log('\n🔍 Step 11: Testing different auth header formats...')
                  const notebooksAltAuthResponse = await fetch('https://graph.microsoft.com/v1.0/me/onenote/notebooks', {
                    headers: {
                      'Authorization': `Bearer ${refreshData.access_token}`,
                      'Content-Type': 'application/json',
                    },
                  })
                  console.log(`📊 Alt auth format: ${notebooksAltAuthResponse.status} ${notebooksAltAuthResponse.statusText}`)
                  
                  // Test if it's a scope issue by checking token details
                  console.log('\n🔍 Step 12: Analyzing token and scope...')
                  console.log(`🔑 Token starts with: ${refreshData.access_token.substring(0, 20)}...`)
                  console.log(`📋 Scope from refresh: ${refreshData.scope}`)
                  console.log(`⏰ Token expires in: ${refreshData.expires_in} seconds`)
                  
                  // Test with minimal headers
                  const notebooksMinimalResponse = await fetch('https://graph.microsoft.com/v1.0/me/onenote/notebooks', {
                    headers: {
                      'Authorization': `Bearer ${refreshData.access_token}`,
                    },
                  })
                  console.log(`📊 Minimal headers: ${notebooksMinimalResponse.status} ${notebooksMinimalResponse.statusText}`)
                  
                  if (notebooksMinimalResponse.ok) {
                    const minimalData = await notebooksMinimalResponse.json()
                    console.log(`✅ Minimal headers work! Found ${minimalData.value?.length || 0} notebooks`)
                  }
                  
                  // Test other Microsoft Graph endpoints to see if it's OneNote specific
                  console.log('\n🔍 Step 13: Testing other Microsoft Graph endpoints...')
                  
                  // Test OneDrive (should work with Files.ReadWrite.All scope)
                  const onedriveResponse = await fetch('https://graph.microsoft.com/v1.0/me/drive', {
                    headers: {
                      'Authorization': `Bearer ${refreshData.access_token}`,
                      'Content-Type': 'application/json',
                    },
                  })
                  console.log(`📊 OneDrive API: ${onedriveResponse.status} ${onedriveResponse.statusText}`)
                  
                  if (onedriveResponse.ok) {
                    const onedriveData = await onedriveResponse.json()
                    console.log('✅ OneDrive API works!')
                    console.log(`📁 Drive type: ${onedriveData.driveType}`)
                  }
                  
                  // Test Mail (should work with Mail.ReadWrite scope)
                  const mailResponse = await fetch('https://graph.microsoft.com/v1.0/me/mailFolders', {
                    headers: {
                      'Authorization': `Bearer ${refreshData.access_token}`,
                      'Content-Type': 'application/json',
                    },
                  })
                  console.log(`📊 Mail API: ${mailResponse.status} ${mailResponse.statusText}`)
                  
                  if (mailResponse.ok) {
                    const mailData = await mailResponse.json()
                    console.log('✅ Mail API works!')
                    console.log(`📧 Found ${mailData.value?.length || 0} mail folders`)
                  }
                  
                  // Test Calendar (should work with User.Read scope)
                  const calendarResponse = await fetch('https://graph.microsoft.com/v1.0/me/calendar', {
                    headers: {
                      'Authorization': `Bearer ${refreshData.access_token}`,
                      'Content-Type': 'application/json',
                    },
                  })
                  console.log(`📊 Calendar API: ${calendarResponse.status} ${calendarResponse.statusText}`)
                  
                  if (calendarResponse.ok) {
                    const calendarData = await calendarResponse.json()
                    console.log('✅ Calendar API works!')
                    console.log(`📅 Calendar: ${calendarData.name}`)
                  }
                  
                  // Test if we can access user's apps/services
                  const appsResponse = await fetch('https://graph.microsoft.com/v1.0/me/appRoleAssignments', {
                    headers: {
                      'Authorization': `Bearer ${refreshData.access_token}`,
                      'Content-Type': 'application/json',
                    },
                  })
                  console.log(`📊 Apps API: ${appsResponse.status} ${appsResponse.statusText}`)
                  
                  // Test with a different scope request
                  console.log('\n🔍 Step 14: Testing scope-specific access...')
                  console.log(`📋 Current scope: ${refreshData.scope}`)
                  
                  // Check if Notes.ReadWrite.All is actually in the scope
                  const hasNotesScope = refreshData.scope.includes('Notes.ReadWrite.All')
                  console.log(`🔍 Has Notes.ReadWrite.All scope: ${hasNotesScope}`)
                  
                  // Test with a different OneNote endpoint pattern
                  const onenoteRootResponse = await fetch('https://graph.microsoft.com/v1.0/me/onenote', {
                    headers: {
                      'Authorization': `Bearer ${refreshData.access_token}`,
                      'Content-Type': 'application/json',
                    },
                  })
                  console.log(`📊 OneNote root: ${onenoteRootResponse.status} ${onenoteRootResponse.statusText}`)
                  
                  if (onenoteRootResponse.ok) {
                    const onenoteRootData = await onenoteRootResponse.json()
                    console.log('✅ OneNote root works!')
                    console.log('📋 OneNote data:', onenoteRootData)
                  }
                  
                  // Test with a different scope refresh
                  console.log('\n🔍 Step 15: Testing with different scope...')
                  
                  const scopeRefreshResponse = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: new URLSearchParams({
                      client_id: process.env.NEXT_PUBLIC_MICROSOFT_CLIENT_ID,
                      client_secret: process.env.MICROSOFT_CLIENT_SECRET,
                      refresh_token: refreshToken,
                      grant_type: 'refresh_token',
                      scope: 'Notes.ReadWrite.All', // Try with just OneNote scope
                    }),
                  })
                  
                  const scopeRefreshData = await scopeRefreshResponse.json()
                  console.log(`📊 Scope refresh response: ${scopeRefreshResponse.status}`)
                  
                  if (scopeRefreshResponse.ok) {
                    console.log('✅ Scope refresh successful!')
                    console.log(`📋 New scope: ${scopeRefreshData.scope}`)
                    
                    // Test OneNote with the new scope
                    const onenoteWithNewScopeResponse = await fetch('https://graph.microsoft.com/v1.0/me/onenote/notebooks', {
                      headers: {
                        'Authorization': `Bearer ${scopeRefreshData.access_token}`,
                        'Content-Type': 'application/json',
                      },
                    })
                    console.log(`📊 OneNote with new scope: ${onenoteWithNewScopeResponse.status} ${onenoteWithNewScopeResponse.statusText}`)
                    
                    if (onenoteWithNewScopeResponse.ok) {
                      const onenoteData = await onenoteWithNewScopeResponse.json()
                      console.log(`✅ OneNote works with new scope! Found ${onenoteData.value?.length || 0} notebooks`)
                    }
                  } else {
                    console.log('❌ Scope refresh failed:', scopeRefreshData)
                  }
                }
              } else {
                console.error('❌ Token refresh failed:')
                console.error('Refresh error details:', refreshData)
              }
            } else {
              console.log('⚠️  No refresh token available')
            }
          }
        }

      } catch (error) {
        console.error('❌ Error testing integration:', error.message)
      }
    }

  } catch (error) {
    console.error('❌ Test failed:', error)
  }
}

// Run the test
testOneNoteIntegration()
  .then(() => {
    console.log('\n✅ Test completed')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Test failed:', error)
    process.exit(1)
  }) 