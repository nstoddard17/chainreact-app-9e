# Fix Stripe Price ID Error - Step by Step

## The Problem
You're getting the error: `No such price: 'price_1S5T7fE0kRcRLm9RMhTf19VJ'`

This means your database has a Stripe price ID that doesn't exist in YOUR Stripe account (it's probably from someone else's account or a different environment).

## Solution Steps

### Step 1: Clear the Invalid Price IDs

Run this SQL in your Supabase SQL Editor:

```sql
-- Clear the invalid price IDs
UPDATE plans 
SET 
  stripe_price_id_monthly = NULL,
  stripe_price_id_yearly = NULL
WHERE name = 'Pro';
```

### Step 2: Create YOUR Products in Stripe

1. **Go to your Stripe Dashboard**: https://dashboard.stripe.com/test/products
   
2. **Click "Add product"**

3. **Create the Pro product**:
   - Name: `ChainReact Pro`
   - Description: `Advanced features for professionals and growing teams`
   
4. **Add Monthly Price**:
   - Click "Add price"
   - Pricing model: Standard pricing
   - Price: **$19.99**
   - Billing period: **Monthly**
   - Click "Add price"
   - **COPY THE PRICE ID** (looks like: `price_1ABCdef...`)

5. **Add Annual Price**:
   - Click "Add another price"
   - Pricing model: Standard pricing
   - Price: **$179.99**
   - Billing period: **Yearly**
   - Click "Add price"
   - **COPY THE PRICE ID** (looks like: `price_2XYZabc...`)

### Step 3: Update Your Database with YOUR Price IDs

Run this SQL in Supabase (replace with YOUR actual price IDs):

```sql
UPDATE plans 
SET 
  stripe_price_id_monthly = 'price_PASTE_YOUR_MONTHLY_ID_HERE',
  stripe_price_id_yearly = 'price_PASTE_YOUR_YEARLY_ID_HERE',
  price_monthly = 19.99,
  price_yearly = 179.99
WHERE name = 'Pro';
```

### Step 4: Verify Everything is Set

Run this to check:

```sql
SELECT 
  name, 
  price_monthly,
  price_yearly,
  stripe_price_id_monthly, 
  stripe_price_id_yearly 
FROM plans 
WHERE name = 'Pro';
```

You should see:
- price_monthly: 19.99
- price_yearly: 179.99
- stripe_price_id_monthly: (your new monthly price ID)
- stripe_price_id_yearly: (your new yearly price ID)

### Step 5: Test

1. Go back to Settings → Billing
2. Click "Upgrade to Pro"
3. It should now redirect to Stripe checkout!

## Important Notes

- Use **test mode** in Stripe for development (URLs should say `/test/`)
- Test card number: `4242 4242 4242 4242`
- Make sure you're using the correct Stripe account (the one that matches your API keys in `.env.local`)

## Still Having Issues?

Check that your `.env.local` has:
```
STRIPE_SECRET_KEY=sk_test_YOUR_KEY_HERE
```

And that this key is from the SAME Stripe account where you created the products!