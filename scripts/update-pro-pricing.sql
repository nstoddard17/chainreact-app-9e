-- Update Pro Plan Pricing to $19.99/month and $179.99/year
-- Run this in your Supabase SQL Editor

UPDATE plans 
SET 
  price_monthly = 19.99,
  price_yearly = 179.99
WHERE name = 'Pro';

-- Verify the update
SELECT 
  name, 
  price_monthly,
  price_yearly,
  stripe_price_id_monthly, 
  stripe_price_id_yearly 
FROM plans 
WHERE name = 'Pro';

-- The result should show:
-- name: Pro
-- price_monthly: 19.99
-- price_yearly: 179.99