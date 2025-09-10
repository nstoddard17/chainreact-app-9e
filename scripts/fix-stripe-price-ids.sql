-- Fix Stripe Price ID Issue
-- This script clears invalid Stripe price IDs and guides you to set up new ones

-- Step 1: Check current price IDs (run this first to see what's there)
SELECT 
  id,
  name, 
  price_monthly,
  price_yearly,
  stripe_price_id_monthly, 
  stripe_price_id_yearly 
FROM plans 
WHERE name = 'Pro';

-- Step 2: Clear the invalid price IDs (run this to remove the bad IDs)
UPDATE plans 
SET 
  stripe_price_id_monthly = NULL,
  stripe_price_id_yearly = NULL
WHERE name = 'Pro';

-- Step 3: After creating new products in YOUR Stripe account, 
-- update with your new price IDs:
/*
UPDATE plans 
SET 
  stripe_price_id_monthly = 'price_YOUR_MONTHLY_ID',
  stripe_price_id_yearly = 'price_YOUR_YEARLY_ID',
  price_monthly = 19.99,
  price_yearly = 179.99
WHERE name = 'Pro';
*/

-- Verify the update
SELECT 
  name, 
  price_monthly,
  price_yearly,
  stripe_price_id_monthly, 
  stripe_price_id_yearly 
FROM plans;