-- Fix the role constraint on user_profiles table to include 'beta-pro'

-- First, check current constraint
SELECT
    conname AS constraint_name,
    pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'public.user_profiles'::regclass
AND contype = 'c'
AND conname LIKE '%role%';

-- Drop the existing constraint if it exists
ALTER TABLE public.user_profiles
DROP CONSTRAINT IF EXISTS user_profiles_role_check CASCADE;

-- Add a new constraint that includes all valid roles
ALTER TABLE public.user_profiles
ADD CONSTRAINT user_profiles_role_check
CHECK (role IN ('free', 'pro', 'beta-pro', 'business', 'enterprise', 'admin'));

-- Verify the new constraint
SELECT
    conname AS constraint_name,
    pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'public.user_profiles'::regclass
AND contype = 'c'
AND conname LIKE '%role%';

-- Test that beta-pro can now be inserted
UPDATE public.user_profiles
SET role = 'beta-pro'
WHERE id IN (
    SELECT id FROM public.user_profiles
    WHERE role = 'free'
    LIMIT 0
);

SELECT 'Role constraint fixed - beta-pro is now allowed' as status;