-- Update Stripe Price IDs for the Pro Plan
-- 
-- INSTRUCTIONS:
-- 1. Go to https://dashboard.stripe.com/products
-- 2. Create a "ChainReact Pro" product with:
--    - Monthly price: $19.99/month
--    - Annual price: $179.99/year (or $15/month billed annually)
-- 3. Copy the price IDs (they start with "price_")
-- 4. Replace the placeholders below with your actual price IDs
-- 5. Run this script in your Supabase SQL Editor

-- REPLACE THESE WITH YOUR ACTUAL STRIPE PRICE IDs
UPDATE plans 
SET 
  stripe_price_id_monthly = 'price_REPLACE_WITH_YOUR_MONTHLY_PRICE_ID',
  stripe_price_id_yearly = 'price_REPLACE_WITH_YOUR_ANNUAL_PRICE_ID'
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