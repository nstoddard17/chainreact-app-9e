-- Clean up all organization data to start fresh
-- This will delete ALL organization data from all tables

-- Disable RLS temporarily to allow deletion
ALTER TABLE organizations DISABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members DISABLE ROW LEVEL SECURITY;
ALTER TABLE organization_invitations DISABLE ROW LEVEL SECURITY;

-- Delete all data from organization-related tables
-- Delete in correct order due to foreign key constraints

-- 1. Delete all organization invitations
DELETE FROM organization_invitations;

-- 2. Delete all organization members
DELETE FROM organization_members;

-- 3. Delete audit logs (if table exists)
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'audit_logs') THEN
        DELETE FROM audit_logs WHERE organization_id IS NOT NULL;
    END IF;
END $$;

-- 4. Delete support tickets (if table exists and has organization_id)
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'support_tickets' AND column_name = 'organization_id') THEN
        DELETE FROM support_tickets WHERE organization_id IS NOT NULL;
    END IF;
END $$;

-- 5. Finally, delete all organizations
DELETE FROM organizations;

-- Re-enable RLS
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_invitations ENABLE ROW LEVEL SECURITY;

-- Verify all data is deleted
SELECT 'organizations' as table_name, COUNT(*) as count FROM organizations
UNION ALL
SELECT 'organization_members' as table_name, COUNT(*) as count FROM organization_members
UNION ALL
SELECT 'organization_invitations' as table_name, COUNT(*) as count FROM organization_invitations;

-- Reset sequences if they exist
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.sequences WHERE sequence_name = 'organizations_id_seq') THEN
        ALTER SEQUENCE organizations_id_seq RESTART WITH 1;
    END IF;
    IF EXISTS (SELECT FROM information_schema.sequences WHERE sequence_name = 'organization_members_id_seq') THEN
        ALTER SEQUENCE organization_members_id_seq RESTART WITH 1;
    END IF;
    IF EXISTS (SELECT FROM information_schema.sequences WHERE sequence_name = 'organization_invitations_id_seq') THEN
        ALTER SEQUENCE organization_invitations_id_seq RESTART WITH 1;
    END IF;
END $$; 
-- This will delete ALL organization data from all tables

-- Disable RLS temporarily to allow deletion
ALTER TABLE organizations DISABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members DISABLE ROW LEVEL SECURITY;
ALTER TABLE organization_invitations DISABLE ROW LEVEL SECURITY;

-- Delete all data from organization-related tables
-- Delete in correct order due to foreign key constraints

-- 1. Delete all organization invitations
DELETE FROM organization_invitations;

-- 2. Delete all organization members
DELETE FROM organization_members;

-- 3. Delete audit logs (if table exists)
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'audit_logs') THEN
        DELETE FROM audit_logs WHERE organization_id IS NOT NULL;
    END IF;
END $$;

-- 4. Delete support tickets (if table exists and has organization_id)
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'support_tickets' AND column_name = 'organization_id') THEN
        DELETE FROM support_tickets WHERE organization_id IS NOT NULL;
    END IF;
END $$;

-- 5. Finally, delete all organizations
DELETE FROM organizations;

-- Re-enable RLS
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_invitations ENABLE ROW LEVEL SECURITY;

-- Verify all data is deleted
SELECT 'organizations' as table_name, COUNT(*) as count FROM organizations
UNION ALL
SELECT 'organization_members' as table_name, COUNT(*) as count FROM organization_members
UNION ALL
SELECT 'organization_invitations' as table_name, COUNT(*) as count FROM organization_invitations;

-- Reset sequences if they exist
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.sequences WHERE sequence_name = 'organizations_id_seq') THEN
        ALTER SEQUENCE organizations_id_seq RESTART WITH 1;
    END IF;
    IF EXISTS (SELECT FROM information_schema.sequences WHERE sequence_name = 'organization_members_id_seq') THEN
        ALTER SEQUENCE organization_members_id_seq RESTART WITH 1;
    END IF;
    IF EXISTS (SELECT FROM information_schema.sequences WHERE sequence_name = 'organization_invitations_id_seq') THEN
        ALTER SEQUENCE organization_invitations_id_seq RESTART WITH 1;
    END IF;
END $$; 
-- This will delete ALL organization data from all tables

-- Disable RLS temporarily to allow deletion
ALTER TABLE organizations DISABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members DISABLE ROW LEVEL SECURITY;
ALTER TABLE organization_invitations DISABLE ROW LEVEL SECURITY;

-- Delete all data from organization-related tables
-- Delete in correct order due to foreign key constraints

-- 1. Delete all organization invitations
DELETE FROM organization_invitations;

-- 2. Delete all organization members
DELETE FROM organization_members;

-- 3. Delete audit logs (if table exists)
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'audit_logs') THEN
        DELETE FROM audit_logs WHERE organization_id IS NOT NULL;
    END IF;
END $$;

-- 4. Delete support tickets (if table exists and has organization_id)
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'support_tickets' AND column_name = 'organization_id') THEN
        DELETE FROM support_tickets WHERE organization_id IS NOT NULL;
    END IF;
END $$;

-- 5. Finally, delete all organizations
DELETE FROM organizations;

-- Re-enable RLS
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_invitations ENABLE ROW LEVEL SECURITY;

-- Verify all data is deleted
SELECT 'organizations' as table_name, COUNT(*) as count FROM organizations
UNION ALL
SELECT 'organization_members' as table_name, COUNT(*) as count FROM organization_members
UNION ALL
SELECT 'organization_invitations' as table_name, COUNT(*) as count FROM organization_invitations;

-- Reset sequences if they exist
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.sequences WHERE sequence_name = 'organizations_id_seq') THEN
        ALTER SEQUENCE organizations_id_seq RESTART WITH 1;
    END IF;
    IF EXISTS (SELECT FROM information_schema.sequences WHERE sequence_name = 'organization_members_id_seq') THEN
        ALTER SEQUENCE organization_members_id_seq RESTART WITH 1;
    END IF;
    IF EXISTS (SELECT FROM information_schema.sequences WHERE sequence_name = 'organization_invitations_id_seq') THEN
        ALTER SEQUENCE organization_invitations_id_seq RESTART WITH 1;
    END IF;
END $$; 
-- This will delete ALL organization data from all tables

-- Disable RLS temporarily to allow deletion
ALTER TABLE organizations DISABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members DISABLE ROW LEVEL SECURITY;
ALTER TABLE organization_invitations DISABLE ROW LEVEL SECURITY;

-- Delete all data from organization-related tables
-- Delete in correct order due to foreign key constraints

-- 1. Delete all organization invitations
DELETE FROM organization_invitations;

-- 2. Delete all organization members
DELETE FROM organization_members;

-- 3. Delete audit logs (if table exists)
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'audit_logs') THEN
        DELETE FROM audit_logs WHERE organization_id IS NOT NULL;
    END IF;
END $$;

-- 4. Delete support tickets (if table exists and has organization_id)
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'support_tickets' AND column_name = 'organization_id') THEN
        DELETE FROM support_tickets WHERE organization_id IS NOT NULL;
    END IF;
END $$;

-- 5. Finally, delete all organizations
DELETE FROM organizations;

-- Re-enable RLS
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_invitations ENABLE ROW LEVEL SECURITY;

-- Verify all data is deleted
SELECT 'organizations' as table_name, COUNT(*) as count FROM organizations
UNION ALL
SELECT 'organization_members' as table_name, COUNT(*) as count FROM organization_members
UNION ALL
SELECT 'organization_invitations' as table_name, COUNT(*) as count FROM organization_invitations;

-- Reset sequences if they exist
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.sequences WHERE sequence_name = 'organizations_id_seq') THEN
        ALTER SEQUENCE organizations_id_seq RESTART WITH 1;
    END IF;
    IF EXISTS (SELECT FROM information_schema.sequences WHERE sequence_name = 'organization_members_id_seq') THEN
        ALTER SEQUENCE organization_members_id_seq RESTART WITH 1;
    END IF;
    IF EXISTS (SELECT FROM information_schema.sequences WHERE sequence_name = 'organization_invitations_id_seq') THEN
        ALTER SEQUENCE organization_invitations_id_seq RESTART WITH 1;
    END IF;
END $$; 
-- This will delete ALL organization data from all tables

-- Disable RLS temporarily to allow deletion
ALTER TABLE organizations DISABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members DISABLE ROW LEVEL SECURITY;
ALTER TABLE organization_invitations DISABLE ROW LEVEL SECURITY;

-- Delete all data from organization-related tables
-- Delete in correct order due to foreign key constraints

-- 1. Delete all organization invitations
DELETE FROM organization_invitations;

-- 2. Delete all organization members
DELETE FROM organization_members;

-- 3. Delete audit logs (if table exists)
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'audit_logs') THEN
        DELETE FROM audit_logs WHERE organization_id IS NOT NULL;
    END IF;
END $$;

-- 4. Delete support tickets (if table exists and has organization_id)
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'support_tickets' AND column_name = 'organization_id') THEN
        DELETE FROM support_tickets WHERE organization_id IS NOT NULL;
    END IF;
END $$;

-- 5. Finally, delete all organizations
DELETE FROM organizations;

-- Re-enable RLS
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_invitations ENABLE ROW LEVEL SECURITY;

-- Verify all data is deleted
SELECT 'organizations' as table_name, COUNT(*) as count FROM organizations
UNION ALL
SELECT 'organization_members' as table_name, COUNT(*) as count FROM organization_members
UNION ALL
SELECT 'organization_invitations' as table_name, COUNT(*) as count FROM organization_invitations;

-- Reset sequences if they exist
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.sequences WHERE sequence_name = 'organizations_id_seq') THEN
        ALTER SEQUENCE organizations_id_seq RESTART WITH 1;
    END IF;
    IF EXISTS (SELECT FROM information_schema.sequences WHERE sequence_name = 'organization_members_id_seq') THEN
        ALTER SEQUENCE organization_members_id_seq RESTART WITH 1;
    END IF;
    IF EXISTS (SELECT FROM information_schema.sequences WHERE sequence_name = 'organization_invitations_id_seq') THEN
        ALTER SEQUENCE organization_invitations_id_seq RESTART WITH 1;
    END IF;
END $$; 
-- This will delete ALL organization data from all tables

-- Disable RLS temporarily to allow deletion
ALTER TABLE organizations DISABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members DISABLE ROW LEVEL SECURITY;
ALTER TABLE organization_invitations DISABLE ROW LEVEL SECURITY;

-- Delete all data from organization-related tables
-- Delete in correct order due to foreign key constraints

-- 1. Delete all organization invitations
DELETE FROM organization_invitations;

-- 2. Delete all organization members
DELETE FROM organization_members;

-- 3. Delete audit logs (if table exists)
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'audit_logs') THEN
        DELETE FROM audit_logs WHERE organization_id IS NOT NULL;
    END IF;
END $$;

-- 4. Delete support tickets (if table exists and has organization_id)
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'support_tickets' AND column_name = 'organization_id') THEN
        DELETE FROM support_tickets WHERE organization_id IS NOT NULL;
    END IF;
END $$;

-- 5. Finally, delete all organizations
DELETE FROM organizations;

-- Re-enable RLS
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_invitations ENABLE ROW LEVEL SECURITY;

-- Verify all data is deleted
SELECT 'organizations' as table_name, COUNT(*) as count FROM organizations
UNION ALL
SELECT 'organization_members' as table_name, COUNT(*) as count FROM organization_members
UNION ALL
SELECT 'organization_invitations' as table_name, COUNT(*) as count FROM organization_invitations;

-- Reset sequences if they exist
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.sequences WHERE sequence_name = 'organizations_id_seq') THEN
        ALTER SEQUENCE organizations_id_seq RESTART WITH 1;
    END IF;
    IF EXISTS (SELECT FROM information_schema.sequences WHERE sequence_name = 'organization_members_id_seq') THEN
        ALTER SEQUENCE organization_members_id_seq RESTART WITH 1;
    END IF;
    IF EXISTS (SELECT FROM information_schema.sequences WHERE sequence_name = 'organization_invitations_id_seq') THEN
        ALTER SEQUENCE organization_invitations_id_seq RESTART WITH 1;
    END IF;
END $$; 