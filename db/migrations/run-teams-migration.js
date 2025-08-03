import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function runMigration() {
  try {
    console.log('Reading teams migration SQL...')
    const sqlPath = path.join(process.cwd(), 'db', 'migrations', 'create_teams_tables.sql')
    const sql = fs.readFileSync(sqlPath, 'utf8')

    console.log('Running teams migration...')
    const { data, error } = await supabase.rpc('exec_sql', { sql })

    if (error) {
      console.error('Migration failed:', error)
      process.exit(1)
    }

    console.log('Teams migration completed successfully!')
    console.log('Created tables: teams, team_members, team_workflows, team_templates')
    console.log('Created indexes and RLS policies')
    
  } catch (error) {
    console.error('Migration failed:', error)
    process.exit(1)
  }
}

runMigration() 
import fs from 'fs'
import path from 'path'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function runMigration() {
  try {
    console.log('Reading teams migration SQL...')
    const sqlPath = path.join(process.cwd(), 'db', 'migrations', 'create_teams_tables.sql')
    const sql = fs.readFileSync(sqlPath, 'utf8')

    console.log('Running teams migration...')
    const { data, error } = await supabase.rpc('exec_sql', { sql })

    if (error) {
      console.error('Migration failed:', error)
      process.exit(1)
    }

    console.log('Teams migration completed successfully!')
    console.log('Created tables: teams, team_members, team_workflows, team_templates')
    console.log('Created indexes and RLS policies')
    
  } catch (error) {
    console.error('Migration failed:', error)
    process.exit(1)
  }
}

runMigration() 
import fs from 'fs'
import path from 'path'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function runMigration() {
  try {
    console.log('Reading teams migration SQL...')
    const sqlPath = path.join(process.cwd(), 'db', 'migrations', 'create_teams_tables.sql')
    const sql = fs.readFileSync(sqlPath, 'utf8')

    console.log('Running teams migration...')
    const { data, error } = await supabase.rpc('exec_sql', { sql })

    if (error) {
      console.error('Migration failed:', error)
      process.exit(1)
    }

    console.log('Teams migration completed successfully!')
    console.log('Created tables: teams, team_members, team_workflows, team_templates')
    console.log('Created indexes and RLS policies')
    
  } catch (error) {
    console.error('Migration failed:', error)
    process.exit(1)
  }
}

runMigration() 
import fs from 'fs'
import path from 'path'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function runMigration() {
  try {
    console.log('Reading teams migration SQL...')
    const sqlPath = path.join(process.cwd(), 'db', 'migrations', 'create_teams_tables.sql')
    const sql = fs.readFileSync(sqlPath, 'utf8')

    console.log('Running teams migration...')
    const { data, error } = await supabase.rpc('exec_sql', { sql })

    if (error) {
      console.error('Migration failed:', error)
      process.exit(1)
    }

    console.log('Teams migration completed successfully!')
    console.log('Created tables: teams, team_members, team_workflows, team_templates')
    console.log('Created indexes and RLS policies')
    
  } catch (error) {
    console.error('Migration failed:', error)
    process.exit(1)
  }
}

runMigration() 
import fs from 'fs'
import path from 'path'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function runMigration() {
  try {
    console.log('Reading teams migration SQL...')
    const sqlPath = path.join(process.cwd(), 'db', 'migrations', 'create_teams_tables.sql')
    const sql = fs.readFileSync(sqlPath, 'utf8')

    console.log('Running teams migration...')
    const { data, error } = await supabase.rpc('exec_sql', { sql })

    if (error) {
      console.error('Migration failed:', error)
      process.exit(1)
    }

    console.log('Teams migration completed successfully!')
    console.log('Created tables: teams, team_members, team_workflows, team_templates')
    console.log('Created indexes and RLS policies')
    
  } catch (error) {
    console.error('Migration failed:', error)
    process.exit(1)
  }
}

runMigration() 
import fs from 'fs'
import path from 'path'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function runMigration() {
  try {
    console.log('Reading teams migration SQL...')
    const sqlPath = path.join(process.cwd(), 'db', 'migrations', 'create_teams_tables.sql')
    const sql = fs.readFileSync(sqlPath, 'utf8')

    console.log('Running teams migration...')
    const { data, error } = await supabase.rpc('exec_sql', { sql })

    if (error) {
      console.error('Migration failed:', error)
      process.exit(1)
    }

    console.log('Teams migration completed successfully!')
    console.log('Created tables: teams, team_members, team_workflows, team_templates')
    console.log('Created indexes and RLS policies')
    
  } catch (error) {
    console.error('Migration failed:', error)
    process.exit(1)
  }
}

runMigration() 