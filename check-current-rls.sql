-- Check current RLS status and policies
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE tablename IN ('organizations', 'organization_members', 'organization_invitations')
ORDER BY tablename;

-- Check existing policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE tablename IN ('organizations', 'organization_members', 'organization_invitations')
ORDER BY tablename, policyname; 
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE tablename IN ('organizations', 'organization_members', 'organization_invitations')
ORDER BY tablename;

-- Check existing policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE tablename IN ('organizations', 'organization_members', 'organization_invitations')
ORDER BY tablename, policyname; 
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE tablename IN ('organizations', 'organization_members', 'organization_invitations')
ORDER BY tablename;

-- Check existing policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE tablename IN ('organizations', 'organization_members', 'organization_invitations')
ORDER BY tablename, policyname; 
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE tablename IN ('organizations', 'organization_members', 'organization_invitations')
ORDER BY tablename;

-- Check existing policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE tablename IN ('organizations', 'organization_members', 'organization_invitations')
ORDER BY tablename, policyname; 
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE tablename IN ('organizations', 'organization_members', 'organization_invitations')
ORDER BY tablename;

-- Check existing policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE tablename IN ('organizations', 'organization_members', 'organization_invitations')
ORDER BY tablename, policyname; 
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE tablename IN ('organizations', 'organization_members', 'organization_invitations')
ORDER BY tablename;

-- Check existing policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE tablename IN ('organizations', 'organization_members', 'organization_invitations')
ORDER BY tablename, policyname; 