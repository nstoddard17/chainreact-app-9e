// Script to process scheduled data deletion requests
// Run this as a cron job daily to process deletion requests

const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function processDataDeletions() {
  console.log('Starting data deletion processing...')
  
  try {
    // Get all scheduled deletion requests that are due
    const { data: requests, error } = await supabase
      .from('data_deletion_requests')
      .select('*')
      .eq('status', 'scheduled')
      .lte('scheduled_for', new Date().toISOString())
    
    if (error) {
      console.error('Error fetching deletion requests:', error)
      return
    }
    
    console.log(`Found ${requests.length} deletion requests to process`)
    
    for (const request of requests) {
      try {
        console.log(`Processing deletion request ${request.id} for user ${request.user_id}`)
        
        // Update status to processing
        await supabase
          .from('data_deletion_requests')
          .update({ status: 'processing' })
          .eq('id', request.id)
        
        // Perform the actual deletion based on type
        await performDeletion(request)
        
        // Mark as completed
        await supabase
          .from('data_deletion_requests')
          .update({ 
            status: 'completed',
            completed_at: new Date().toISOString()
          })
          .eq('id', request.id)
        
        console.log(`Successfully processed deletion request ${request.id}`)
        
      } catch (error) {
        console.error(`Error processing deletion request ${request.id}:`, error)
        
        // Mark as failed
        await supabase
          .from('data_deletion_requests')
          .update({ 
            status: 'failed',
            notes: error.message
          })
          .eq('id', request.id)
      }
    }
    
    console.log('Data deletion processing completed')
    
  } catch (error) {
    console.error('Error in data deletion processing:', error)
  }
}

async function performDeletion(request) {
  const { user_id, deletion_type, integration_provider } = request
  
  switch (deletion_type) {
    case 'full':
      await performFullDeletion(user_id)
      break
    case 'partial':
      await performPartialDeletion(user_id)
      break
    case 'integration_specific':
      await performIntegrationDeletion(user_id, integration_provider)
      break
    default:
      throw new Error(`Unknown deletion type: ${deletion_type}`)
  }
}

async function performFullDeletion(userId) {
  console.log(`Performing full deletion for user ${userId}`)
  
  // Delete all user data
  await supabase.from('integrations').delete().eq('user_id', userId)
  await supabase.from('workflows').delete().eq('user_id', userId)
  await supabase.from('workflow_executions').delete().eq('user_id', userId)
  await supabase.from('organizations').delete().eq('owner_id', userId)
  await supabase.from('organization_members').delete().eq('user_id', userId)
  
  // Delete the user account
  const { error } = await supabase.auth.admin.deleteUser(userId)
  if (error) {
    console.error('Error deleting user account:', error)
  }
}

async function performPartialDeletion(userId) {
  console.log(`Performing partial deletion for user ${userId}`)
  
  // Delete sensitive data but keep account
  await supabase.from('integrations').delete().eq('user_id', userId)
  await supabase.from('workflow_executions').delete().eq('user_id', userId)
  
  // Anonymize user profile
  await supabase
    .from('profiles')
    .update({ 
      full_name: 'Deleted User',
      avatar_url: null,
      bio: null
    })
    .eq('id', userId)
}

async function performIntegrationDeletion(userId, provider) {
  console.log(`Performing integration deletion for user ${userId}, provider ${provider}`)
  
  // Delete specific integration data
  await supabase
    .from('integrations')
    .delete()
    .eq('user_id', userId)
    .eq('provider', provider)
  
  // Delete related workflow executions
  await supabase
    .from('workflow_executions')
    .delete()
    .eq('user_id', userId)
    .like('workflow_data', `%${provider}%`)
}

// Run the script
if (require.main === module) {
  processDataDeletions()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Script failed:', error)
      process.exit(1)
    })
}

module.exports = { processDataDeletions }
