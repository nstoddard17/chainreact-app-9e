import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `stripe:create_payment_link`.
 *
 * **Commerce / payment-initiation.** Creates a Stripe-hosted Payment
 * Link — a shareable, reusable URL that hosts a Stripe payment page.
 * Lighter-weight than Checkout Sessions: no per-customer success /
 * cancel URLs required, the link is reusable across many customers.
 * Money does NOT move at create time.
 *
 * Mirrors `createPaymentLink.schema.ts`:
 *   - `lineItems`           (required) — paste-JSON array of
 *                            `[{priceId, quantity}]`. Min 1, max 20
 *                            (Stripe's hard cap for payment_links).
 *   - `metadata`            (optional) — Record<string,string>.
 *   - `allowPromotionCodes` (optional boolean) — no default.
 *   - `afterCompletion`     (optional paste-JSON) — discriminated
 *                            union: `{type:"redirect", redirectUrl}`
 *                            OR `{type:"hosted_confirmation"}`.
 *
 * Outputs match `createPaymentLink.ts:return` — 6-key bounded
 * projection. `url` is the customer-facing Stripe-hosted payment URL
 * (intentional and safe to expose).
 */
export const stripeCreatePaymentLinkMeta: ActionMeta = {
  key: "stripe:create_payment_link",
  provider: "stripe",
  type: "create_payment_link",
  displayName: "Create Payment Link",
  description:
    "Create a Stripe-hosted Payment Link — a shareable, reusable URL the workflow can publish (email, SMS, button) for customers to pay. Money does NOT move at create time; customers pay inside Stripe's hosted page. Lighter-weight than Checkout Sessions — no per-customer success/cancel URLs required and one link can collect payment from many customers.",
  category: "commerce",
  requiresIntegration: true,
  fields: [
    {
      name: "lineItems",
      label: "Line items",
      description:
        "What the customer is paying for. Add one line per Stripe price (max 20 — Stripe's cap for payment links).",
      type: "object-list",
      required: true,
      listMaxItems: 20,
      itemFields: [
        {
          name: "priceId",
          label: "Price ID",
          description: "The Stripe price to charge (starts with `price_`).",
          type: "text",
          required: true,
          placeholder: "price_xxx",
        },
        {
          name: "quantity",
          label: "Quantity",
          type: "number",
          required: true,
          placeholder: "1",
        },
      ],
    },
    {
      name: "metadata",
      label: "Metadata",
      description:
        "Optional key/value pairs persisted on the Payment Link. Stripe caps at 50 keys per object.",
      type: "keyvalue",
      required: false,
      keyValueShape: "record",
      keyValueMaxRows: 50,
    },
    {
      name: "allowPromotionCodes",
      label: "Allow promotion codes",
      description:
        "Optional — when true, Stripe shows a promotion-code input field on the hosted page. No default applied here; Stripe applies `false` when omitted.",
      type: "boolean",
      required: false,
    },
    {
      name: "afterCompletion",
      label: "After completion",
      description:
        "Developer option. What happens after the customer pays, as a JSON object: `{\"type\":\"redirect\",\"redirectUrl\":\"https://example.com/...\"}` to redirect, or `{\"type\":\"hosted_confirmation\"}` for Stripe's confirmation page (Stripe's default when omitted). Enter the JSON value or insert a value from a previous step.",
      type: "json",
      required: false,
      advanced: true,
      jsonShape: "object",
      placeholder:
        '{"type":"redirect","redirectUrl":"https://example.com/thanks"}',
    },
  ],
  outputs: [
    {
      name: "paymentLinkId",
      type: "string",
      description:
        "Stripe Payment Link id (`plink_xxx`). Use for log correlation or future API operations.",
    },
    {
      name: "url",
      type: "string",
      description:
        "**Customer-facing Stripe-hosted payment URL.** Publish via email, SMS, or button. Reusable across many customers; remains valid until the Payment Link is deactivated. Safe to expose; this is the documented Stripe Payment Link surface.",
      sensitive: true,
    },
    {
      name: "active",
      type: "boolean",
      description:
        "True when the link accepts new payments. Inactive links return 404 for customers.",
    },
    {
      name: "currency",
      type: "string",
      description:
        "Lowercase ISO-4217 currency code Stripe resolved from the line items.",
    },
    {
      name: "metadata",
      type: "object",
      description: "Metadata persisted on the Payment Link (echoed).",
    },
    {
      name: "livemode",
      type: "boolean",
      description: "True for live Stripe account; false for test mode.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 140,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription: "Creates a reusable payment link — anyone with the URL can attempt to pay.",
};
