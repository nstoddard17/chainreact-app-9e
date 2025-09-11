# Stripe Tax Configuration

## What Was Implemented

### 1. Automatic Tax Calculation
Taxes are now automatically calculated and added to subscription costs during Stripe checkout based on the customer's location.

### 2. Changes Made

#### Checkout Session (`/app/api/billing/checkout/route.ts`)
- **Added `automatic_tax`**: Enables Stripe's automatic tax calculation
- **Added `customer_update`**: Collects customer address for tax calculation
- **Added `tax_id_collection`**: Allows customers to add VAT/Tax IDs for B2B transactions

#### Customer Creation
- **Added `tax.validate_location`**: Set to 'deferred' for better performance

### 3. Tax Configuration Script
Created `scripts/setup-stripe-tax.ts` to:
- Check and update tax settings
- Set tax behavior to 'exclusive' (tax added on top)
- Apply SaaS tax code to products

## How It Works

1. **Customer visits checkout**: Clicks "Upgrade to Pro"
2. **Address collection**: Stripe prompts for billing address
3. **Tax calculation**: Stripe automatically calculates applicable taxes based on:
   - Customer's location (billing address)
   - Product type (SaaS - Software as a Service)
   - Your tax registrations in Stripe
4. **Display**: Tax amount shown separately before payment
5. **Compliance**: Stripe handles tax compliance and reporting

## Tax Rates by Region

Common tax rates that will be applied:
- **US States**:
  - California: ~8-10% sales tax
  - New York: ~8% sales tax  
  - Texas: ~8.25% sales tax
  - States without sales tax: 0% (OR, MT, NH, DE, AK)
- **Europe**:
  - UK: 20% VAT
  - Germany: 19% VAT
  - France: 20% VAT
- **Canada**: 5-15% GST/PST/HST depending on province
- **Australia**: 10% GST

## Required Stripe Dashboard Setup

⚠️ **Important**: You must complete these steps in Stripe Dashboard:

1. **Enable Tax Registrations**:
   - Go to https://dashboard.stripe.com/settings/tax/registrations
   - Add registrations for regions where you have tax obligations
   - At minimum, add your home state/country

2. **Set Origin Address**:
   - Go to https://dashboard.stripe.com/settings/tax/origin-address
   - Enter your business address for accurate calculations

3. **Review Tax Settings**:
   - Go to https://dashboard.stripe.com/settings/tax
   - Ensure "Automatic tax calculation" is enabled

## Testing

1. Start your dev server: `npm run dev`
2. Go to Settings > Billing
3. Click "Upgrade to Pro"
4. In Stripe checkout:
   - Enter a test address (e.g., California for ~8% tax)
   - Notice tax is calculated and shown
   - Use test card: 4242 4242 4242 4242

## B2B Transactions

The system supports tax-exempt B2B transactions:
- Customers can enter VAT/Tax IDs during checkout
- Valid IDs may reduce or eliminate tax
- Stripe validates IDs automatically

## Monitoring & Reports

- **Tax Reports**: Available at https://dashboard.stripe.com/reports/tax
- **Tax collected**: Shown in subscription details
- **Customer tax IDs**: Stored with customer records

## Scripts

- `npm run setup-stripe-tax` - Configure tax settings and product codes

## Notes

- Tax is calculated as "exclusive" - added on top of base price
- Stripe handles all tax compliance and remittance
- Tax calculation is real-time based on current regulations
- No additional fees for tax calculation (included with Stripe Billing)