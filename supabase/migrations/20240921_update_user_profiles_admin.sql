-- Update specific user to admin role based on email
-- Replace with your actual email address
UPDATE public.user_profiles
SET
  user_role = 'admin',
  username = CASE
    WHEN username IS NULL OR username = '' THEN split_part(email, '@', 1)
    ELSE username
  END,
  updated_at = NOW()
WHERE email IN (
  -- Add your email here
  'your-email@example.com'
);

-- You can also update by user ID if you know it
-- UPDATE public.user_profiles
-- SET user_role = 'admin', updated_at = NOW()
-- WHERE id = 'your-user-id-here';