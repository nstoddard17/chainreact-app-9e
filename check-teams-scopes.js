// Script to check existing Teams integrations and their scopes
// Run with: node check-teams-scopes.js

const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

async function checkTeamsScopes() {
  console.log('🔍 Checking existing Teams integrations and their scopes...\n')
  
  try {
    // Get all Teams integrations
    const { data: teamsIntegrations, error } = await supabase
      .from('integrations')
      .select('*')
      .eq('provider', 'teams')
    
    if (error) {
      console.error('❌ Error fetching Teams integrations:', error.message)
      return
    }
    
    if (!teamsIntegrations || teamsIntegrations.length === 0) {
      console.log('ℹ️  No Teams integrations found in the database')
      return
    }
    
    console.log(`📊 Found ${teamsIntegrations.length} Teams integration(s):\n`)
    
    teamsIntegrations.forEach((integration, index) => {
      console.log(`Integration ${index + 1}:`)
      console.log(`  - ID: ${integration.id}`)
      console.log(`  - User ID: ${integration.user_id}`)
      console.log(`  - Status: ${integration.status}`)
      console.log(`  - Created: ${integration.created_at}`)
      console.log(`  - Updated: ${integration.updated_at}`)
      
      if (integration.scopes && integration.scopes.length > 0) {
        console.log(`  - Scopes (${integration.scopes.length}):`)
        integration.scopes.forEach(scope => {
          console.log(`    • ${scope}`)
        })
        
        // Check for broad scopes that shouldn't be there
        const broadScopes = [
          'https://graph.microsoft.com/TeamMember.Read.All',
          'https://graph.microsoft.com/TeamMember.ReadWrite.All',
          'https://graph.microsoft.com/Channel.Create',
          'https://graph.microsoft.com/Team.Create',
          'https://graph.microsoft.com/Mail.Read',
          'https://graph.microsoft.com/Mail.ReadWrite',
          'https://graph.microsoft.com/Mail.Send',
          'https://graph.microsoft.com/Calendars.Read',
          'https://graph.microsoft.com/Calendars.ReadWrite',
          'https://graph.microsoft.com/Contacts.Read',
          'https://graph.microsoft.com/Contacts.ReadWrite',
          'https://graph.microsoft.com/Files.ReadWrite.All',
          'https://graph.microsoft.com/Notes.ReadWrite.All'
        ]
        
        const foundBroadScopes = integration.scopes.filter(scope => 
          broadScopes.includes(scope)
        )
        
        if (foundBroadScopes.length > 0) {
          console.log(`  ⚠️  BROAD SCOPES FOUND (${foundBroadScopes.length}):`)
          foundBroadScopes.forEach(scope => {
            console.log(`    • ${scope}`)
          })
        } else {
          console.log(`  ✅ No broad scopes found - using Teams-specific scopes only`)
        }
      } else {
        console.log(`  - Scopes: None stored`)
      }
      
      console.log('')
    })
    
    // Summary
    const integrationsWithBroadScopes = teamsIntegrations.filter(integration => {
      if (!integration.scopes || integration.scopes.length === 0) return false
      
      const broadScopes = [
        'https://graph.microsoft.com/TeamMember.Read.All',
        'https://graph.microsoft.com/TeamMember.ReadWrite.All',
        'https://graph.microsoft.com/Channel.Create',
        'https://graph.microsoft.com/Team.Create',
        'https://graph.microsoft.com/Mail.Read',
        'https://graph.microsoft.com/Mail.ReadWrite',
        'https://graph.microsoft.com/Mail.Send',
        'https://graph.microsoft.com/Calendars.Read',
        'https://graph.microsoft.com/Calendars.ReadWrite',
        'https://graph.microsoft.com/Contacts.Read',
        'https://graph.microsoft.com/Contacts.ReadWrite',
        'https://graph.microsoft.com/Files.ReadWrite.All',
        'https://graph.microsoft.com/Notes.ReadWrite.All'
      ]
      
      return integration.scopes.some(scope => broadScopes.includes(scope))
    })
    
    console.log(`📋 Summary:`)
    console.log(`  - Total Teams integrations: ${teamsIntegrations.length}`)
    console.log(`  - Integrations with broad scopes: ${integrationsWithBroadScopes.length}`)
    console.log(`  - Integrations with Teams-specific scopes only: ${teamsIntegrations.length - integrationsWithBroadScopes.length}`)
    
    if (integrationsWithBroadScopes.length > 0) {
      console.log(`\n⚠️  RECOMMENDATION: Users with broad scopes should reconnect their Teams integration to get the new, focused permissions.`)
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message)
  }
}

checkTeamsScopes() 