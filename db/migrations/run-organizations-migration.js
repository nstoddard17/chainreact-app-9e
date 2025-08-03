import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

// Load environment variables
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables:')
  console.error('   - NEXT_PUBLIC_SUPABASE_URL')
  console.error('   - SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function runMigration() {
  try {
    console.log('🚀 Starting organizations migration...')
    
    // Read the SQL file
    const sqlPath = path.join(__dirname, 'create_organizations_tables.sql')
    const sql = fs.readFileSync(sqlPath, 'utf8')
    
    console.log('📄 SQL file loaded successfully')
    console.log('⏳ Executing migration...')
    
    // Execute the migration
    const { data, error } = await supabase.rpc('exec_sql', { sql })
    
    if (error) {
      console.error('❌ Migration failed:', error)
      process.exit(1)
    }
    
    console.log('✅ Migration completed successfully!')
    console.log('📊 Created tables:')
    console.log('   - organizations')
    console.log('   - organization_members')
    console.log('   - organization_invitations')
    console.log('🔒 RLS policies and indexes created')
    
    // Verify tables exist
    console.log('\n🔍 Verifying tables...')
    
    const { data: tables, error: tablesError } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .in('table_name', ['organizations', 'organization_members', 'organization_invitations'])
    
    if (tablesError) {
      console.error('❌ Error verifying tables:', tablesError)
    } else {
      console.log('✅ Tables verified:', tables.map(t => t.table_name))
    }
    
  } catch (error) {
    console.error('❌ Migration failed:', error)
    process.exit(1)
  }
}

runMigration() 
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

// Load environment variables
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables:')
  console.error('   - NEXT_PUBLIC_SUPABASE_URL')
  console.error('   - SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function runMigration() {
  try {
    console.log('🚀 Starting organizations migration...')
    
    // Read the SQL file
    const sqlPath = path.join(__dirname, 'create_organizations_tables.sql')
    const sql = fs.readFileSync(sqlPath, 'utf8')
    
    console.log('📄 SQL file loaded successfully')
    console.log('⏳ Executing migration...')
    
    // Execute the migration
    const { data, error } = await supabase.rpc('exec_sql', { sql })
    
    if (error) {
      console.error('❌ Migration failed:', error)
      process.exit(1)
    }
    
    console.log('✅ Migration completed successfully!')
    console.log('📊 Created tables:')
    console.log('   - organizations')
    console.log('   - organization_members')
    console.log('   - organization_invitations')
    console.log('🔒 RLS policies and indexes created')
    
    // Verify tables exist
    console.log('\n🔍 Verifying tables...')
    
    const { data: tables, error: tablesError } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .in('table_name', ['organizations', 'organization_members', 'organization_invitations'])
    
    if (tablesError) {
      console.error('❌ Error verifying tables:', tablesError)
    } else {
      console.log('✅ Tables verified:', tables.map(t => t.table_name))
    }
    
  } catch (error) {
    console.error('❌ Migration failed:', error)
    process.exit(1)
  }
}

runMigration() 
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

// Load environment variables
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables:')
  console.error('   - NEXT_PUBLIC_SUPABASE_URL')
  console.error('   - SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function runMigration() {
  try {
    console.log('🚀 Starting organizations migration...')
    
    // Read the SQL file
    const sqlPath = path.join(__dirname, 'create_organizations_tables.sql')
    const sql = fs.readFileSync(sqlPath, 'utf8')
    
    console.log('📄 SQL file loaded successfully')
    console.log('⏳ Executing migration...')
    
    // Execute the migration
    const { data, error } = await supabase.rpc('exec_sql', { sql })
    
    if (error) {
      console.error('❌ Migration failed:', error)
      process.exit(1)
    }
    
    console.log('✅ Migration completed successfully!')
    console.log('📊 Created tables:')
    console.log('   - organizations')
    console.log('   - organization_members')
    console.log('   - organization_invitations')
    console.log('🔒 RLS policies and indexes created')
    
    // Verify tables exist
    console.log('\n🔍 Verifying tables...')
    
    const { data: tables, error: tablesError } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .in('table_name', ['organizations', 'organization_members', 'organization_invitations'])
    
    if (tablesError) {
      console.error('❌ Error verifying tables:', tablesError)
    } else {
      console.log('✅ Tables verified:', tables.map(t => t.table_name))
    }
    
  } catch (error) {
    console.error('❌ Migration failed:', error)
    process.exit(1)
  }
}

runMigration() 
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

// Load environment variables
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables:')
  console.error('   - NEXT_PUBLIC_SUPABASE_URL')
  console.error('   - SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function runMigration() {
  try {
    console.log('🚀 Starting organizations migration...')
    
    // Read the SQL file
    const sqlPath = path.join(__dirname, 'create_organizations_tables.sql')
    const sql = fs.readFileSync(sqlPath, 'utf8')
    
    console.log('📄 SQL file loaded successfully')
    console.log('⏳ Executing migration...')
    
    // Execute the migration
    const { data, error } = await supabase.rpc('exec_sql', { sql })
    
    if (error) {
      console.error('❌ Migration failed:', error)
      process.exit(1)
    }
    
    console.log('✅ Migration completed successfully!')
    console.log('📊 Created tables:')
    console.log('   - organizations')
    console.log('   - organization_members')
    console.log('   - organization_invitations')
    console.log('🔒 RLS policies and indexes created')
    
    // Verify tables exist
    console.log('\n🔍 Verifying tables...')
    
    const { data: tables, error: tablesError } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .in('table_name', ['organizations', 'organization_members', 'organization_invitations'])
    
    if (tablesError) {
      console.error('❌ Error verifying tables:', tablesError)
    } else {
      console.log('✅ Tables verified:', tables.map(t => t.table_name))
    }
    
  } catch (error) {
    console.error('❌ Migration failed:', error)
    process.exit(1)
  }
}

runMigration() 
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

// Load environment variables
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables:')
  console.error('   - NEXT_PUBLIC_SUPABASE_URL')
  console.error('   - SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function runMigration() {
  try {
    console.log('🚀 Starting organizations migration...')
    
    // Read the SQL file
    const sqlPath = path.join(__dirname, 'create_organizations_tables.sql')
    const sql = fs.readFileSync(sqlPath, 'utf8')
    
    console.log('📄 SQL file loaded successfully')
    console.log('⏳ Executing migration...')
    
    // Execute the migration
    const { data, error } = await supabase.rpc('exec_sql', { sql })
    
    if (error) {
      console.error('❌ Migration failed:', error)
      process.exit(1)
    }
    
    console.log('✅ Migration completed successfully!')
    console.log('📊 Created tables:')
    console.log('   - organizations')
    console.log('   - organization_members')
    console.log('   - organization_invitations')
    console.log('🔒 RLS policies and indexes created')
    
    // Verify tables exist
    console.log('\n🔍 Verifying tables...')
    
    const { data: tables, error: tablesError } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .in('table_name', ['organizations', 'organization_members', 'organization_invitations'])
    
    if (tablesError) {
      console.error('❌ Error verifying tables:', tablesError)
    } else {
      console.log('✅ Tables verified:', tables.map(t => t.table_name))
    }
    
  } catch (error) {
    console.error('❌ Migration failed:', error)
    process.exit(1)
  }
}

runMigration() 
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

// Load environment variables
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables:')
  console.error('   - NEXT_PUBLIC_SUPABASE_URL')
  console.error('   - SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function runMigration() {
  try {
    console.log('🚀 Starting organizations migration...')
    
    // Read the SQL file
    const sqlPath = path.join(__dirname, 'create_organizations_tables.sql')
    const sql = fs.readFileSync(sqlPath, 'utf8')
    
    console.log('📄 SQL file loaded successfully')
    console.log('⏳ Executing migration...')
    
    // Execute the migration
    const { data, error } = await supabase.rpc('exec_sql', { sql })
    
    if (error) {
      console.error('❌ Migration failed:', error)
      process.exit(1)
    }
    
    console.log('✅ Migration completed successfully!')
    console.log('📊 Created tables:')
    console.log('   - organizations')
    console.log('   - organization_members')
    console.log('   - organization_invitations')
    console.log('🔒 RLS policies and indexes created')
    
    // Verify tables exist
    console.log('\n🔍 Verifying tables...')
    
    const { data: tables, error: tablesError } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .in('table_name', ['organizations', 'organization_members', 'organization_invitations'])
    
    if (tablesError) {
      console.error('❌ Error verifying tables:', tablesError)
    } else {
      console.log('✅ Tables verified:', tables.map(t => t.table_name))
    }
    
  } catch (error) {
    console.error('❌ Migration failed:', error)
    process.exit(1)
  }
}

runMigration() 