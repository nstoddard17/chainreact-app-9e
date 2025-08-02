# Donate Page Setup Guide

## Overview
I've created a beautiful donate page with Stripe integration that includes:
- Multiple donation amount options ($5, $10, $25, $50, $100)
- Custom amount input
- Optional email for receipts
- Success page after donation
- Responsive design with dark mode support

## Files Created
1. `app/donate/page.tsx` - Main donate page
2. `app/donate/success/page.tsx` - Success page after donation
3. `app/api/donate/create-session/route.ts` - API route for creating Stripe checkout sessions

## Environment Variables Required

Add these to your `.env.local` file:

```bash
# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_... # Your Stripe secret key
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_... # Your Stripe publishable key

# Base URL for redirects
NEXT_PUBLIC_BASE_URL=http://localhost:3000 # Your app's base URL
```

## Stripe Dashboard Setup

1. **Create a Stripe Account** (if you don't have one)
   - Go to https://stripe.com and sign up
   - Complete your account verification

2. **Get Your API Keys**
   - Go to Stripe Dashboard → Developers → API Keys
   - Copy your Publishable Key and Secret Key
   - Use test keys for development, live keys for production

3. **Configure Webhooks** (Optional but recommended)
   - Go to Stripe Dashboard → Developers → Webhooks
   - Add endpoint: `https://yourdomain.com/api/webhooks/stripe`
   - Select events: `checkout.session.completed`, `payment_intent.succeeded`

4. **Update Product Image**
   - In `app/api/donate/create-session/route.ts`, line 25
   - Replace `'https://chainreact.com/logo.png'` with your actual logo URL

## Features

### Donation Page (`/donate`)
- **Predefined Amounts**: $5, $10, $25, $50, $100 with custom icons and descriptions
- **Custom Amount**: Users can enter any amount
- **Email Collection**: Optional email for receipt delivery
- **Secure Payment**: Powered by Stripe Checkout
- **Responsive Design**: Works on all devices
- **Dark Mode Support**: Automatically adapts to user's theme

### Success Page (`/donate/success`)
- **Thank You Message**: Confirms successful donation
- **Impact Information**: Shows what donations support
- **Navigation**: Easy access back to dashboard or donate again
- **Receipt Notice**: Informs user about email receipt

### API Route (`/api/donate/create-session`)
- **Session Creation**: Creates Stripe checkout sessions
- **Amount Validation**: Ensures valid donation amounts
- **Metadata**: Tracks donation type and amount
- **Error Handling**: Proper error responses

## Customization Options

### Donation Amounts
Edit the `donationAmounts` array in `app/donate/page.tsx`:
```typescript
const donationAmounts = [
  { value: "5", label: "$5", icon: Coffee, description: "Buy us a coffee" },
  // Add more or modify existing amounts
]
```

### Styling
- Colors: Update gradient classes in the components
- Icons: Replace Lucide icons with your preferred ones
- Layout: Modify the card structure and spacing

### Success Page Content
- Update the "What your donation supports" list
- Modify the thank you message
- Change the navigation buttons

## Testing

1. **Test Mode**: Use Stripe test keys for development
2. **Test Cards**: Use Stripe's test card numbers:
   - `4242 4242 4242 4242` (Visa)
   - `4000 0000 0000 0002` (Declined)
3. **Test the Flow**: Complete a test donation to verify the entire flow

## Production Deployment

1. **Switch to Live Keys**: Replace test keys with live keys
2. **Update Base URL**: Set `NEXT_PUBLIC_BASE_URL` to your production domain
3. **Configure Webhooks**: Set up webhooks for production
4. **Test Live Mode**: Verify everything works with real payments

## Security Notes

- ✅ Stripe handles all payment data securely
- ✅ No sensitive payment information stored on your servers
- ✅ Uses Stripe Checkout for PCI compliance
- ✅ Environment variables keep keys secure

## Support

If you need help with:
- Stripe integration: Check Stripe's documentation
- Next.js setup: Refer to Next.js docs
- Customization: Modify the React components as needed

The donate page is now ready to accept donations! 🎉 