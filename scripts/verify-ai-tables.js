import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables')
  console.error('   Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function checkTableExists(tableName) {
  try {
    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .limit(1)
    
    if (error && error.code === '42P01') {
      // Table doesn't exist
      return false
    }
    
    if (error && error.code !== '42501') {
      // Some other error (42501 is permission denied, which means table exists)
      console.error(`Error checking table ${tableName}:`, error)
      return false
    }
    
    return true
  } catch (error) {
    return false
  }
}

async function checkColumnExists(tableName, columnName) {
  try {
    // Try to select the specific column
    const { data, error } = await supabase
      .from(tableName)
      .select(columnName)
      .limit(1)
    
    if (error && error.message.includes('column') && error.message.includes('does not exist')) {
      return false
    }
    
    return true
  } catch (error) {
    return false
  }
}

async function verifyAITables() {
  console.log('🔍 Verifying AI Agent tables in Supabase...\n')
  console.log(`📍 Supabase URL: ${supabaseUrl}\n`)
  
  const results = {
    tables: {
      ai_cost_logs: false,
      monthly_ai_costs: false,
      monthly_usage: false,
      plans: false
    },
    columns: {
      monthly_usage: {
        ai_assistant_calls: false,
        ai_compose_uses: false,
        ai_agent_executions: false
      },
      plans: {
        max_ai_assistant_calls: false,
        max_ai_compose_uses: false,
        max_ai_agent_executions: false
      }
    }
  }
  
  // Check main tables
  console.log('📋 Checking tables:')
  for (const tableName of Object.keys(results.tables)) {
    const exists = await checkTableExists(tableName)
    results.tables[tableName] = exists
    console.log(`   ${exists ? '✅' : '❌'} ${tableName}`)
  }
  
  // Check columns in monthly_usage table
  console.log('\n📋 Checking monthly_usage columns:')
  if (results.tables.monthly_usage) {
    for (const columnName of Object.keys(results.columns.monthly_usage)) {
      const exists = await checkColumnExists('monthly_usage', columnName)
      results.columns.monthly_usage[columnName] = exists
      console.log(`   ${exists ? '✅' : '❌'} ${columnName}`)
    }
  } else {
    console.log('   ⚠️  Table monthly_usage does not exist')
  }
  
  // Check columns in plans table
  console.log('\n📋 Checking plans columns:')
  if (results.tables.plans) {
    for (const columnName of Object.keys(results.columns.plans)) {
      const exists = await checkColumnExists('plans', columnName)
      results.columns.plans[columnName] = exists
      console.log(`   ${exists ? '✅' : '❌'} ${columnName}`)
    }
  } else {
    console.log('   ⚠️  Table plans does not exist')
  }
  
  // Generate summary
  console.log('\n' + '='.repeat(60))
  console.log('📊 SUMMARY')
  console.log('='.repeat(60))
  
  const allTablesExist = Object.values(results.tables).every(v => v)
  const allColumnsExist = Object.values(results.columns.monthly_usage).every(v => v) &&
                          Object.values(results.columns.plans).every(v => v)
  
  if (allTablesExist && allColumnsExist) {
    console.log('✅ All AI Agent tables and columns are properly configured!')
    console.log('🎉 Your database is ready for AI Agent functionality.')
  } else {
    console.log('⚠️  Some tables or columns are missing!')
    console.log('\n📝 To fix this, you need to run the following migrations:')
    
    if (!results.tables.ai_cost_logs || !results.tables.monthly_ai_costs) {
      console.log('\n1. Run the AI Cost Tracking migration:')
      console.log('   - Go to Supabase Dashboard > SQL Editor')
      console.log('   - Copy the SQL from db/migrations/add_ai_cost_tracking.sql')
      console.log('   - Execute the migration')
    }
    
    const missingUsageColumns = Object.entries(results.columns.monthly_usage)
      .filter(([_, exists]) => !exists)
      .map(([col]) => col)
    
    const missingPlanColumns = Object.entries(results.columns.plans)
      .filter(([_, exists]) => !exists)
      .map(([col]) => col)
    
    if (missingUsageColumns.length > 0 || missingPlanColumns.length > 0) {
      console.log('\n2. Run the AI Usage Limits migration:')
      console.log('   - Go to Supabase Dashboard > SQL Editor')
      console.log('   - Copy the SQL from db/migrations/add_ai_usage_limits.sql')
      console.log('   - Execute the migration')
    }
    
    console.log('\n💡 Alternatively, run: node scripts/run-ai-migrations.js')
    console.log('   This will output the SQL statements you need to run manually.')
  }
  
  // Test data insertion capabilities (optional)
  console.log('\n' + '='.repeat(60))
  console.log('🧪 TESTING CAPABILITIES')
  console.log('='.repeat(60))
  
  // Check if we can query the tables
  if (results.tables.monthly_usage) {
    try {
      const { data, error } = await supabase
        .from('monthly_usage')
        .select('*')
        .limit(1)
      
      if (!error) {
        console.log('✅ Can query monthly_usage table')
      } else {
        console.log('❌ Cannot query monthly_usage table:', error.message)
      }
    } catch (error) {
      console.log('❌ Error testing monthly_usage table:', error.message)
    }
  }
  
  if (results.tables.plans) {
    try {
      const { data, error } = await supabase
        .from('plans')
        .select('*')
      
      if (!error && data) {
        console.log(`✅ Can query plans table (${data.length} plans found)`)
        if (data.length > 0) {
          console.log('   Available plans:', data.map(p => p.name).join(', '))
        }
      } else if (error) {
        console.log('❌ Cannot query plans table:', error.message)
      }
    } catch (error) {
      console.log('❌ Error testing plans table:', error.message)
    }
  }
  
  console.log('\n' + '='.repeat(60))
  console.log('✅ Verification complete!')
  console.log('='.repeat(60))
}

// Run the verification
verifyAITables().catch(error => {
  console.error('❌ Fatal error:', error)
  process.exit(1)
})