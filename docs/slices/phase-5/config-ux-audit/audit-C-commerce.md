# Builder Config UX Audit — Group C (commerce): mailchimp · stripe · quickbooks · shopify

Ground truth verified against `integrations/<provider>/actions/*.{meta,schema}.ts`, trigger metas, and `services/options/_registry.ts`. 61 nodes (21 mailchimp, 17 stripe, 11 quickbooks, 12 shopify), 264 top-level fields.

## Systemic patterns

1. **REQUIRED JSON hidden in Advanced (mailchimp create_audience)** — 2 fields (`contact`, `campaign_defaults`) are `required: true` + `advanced: true` + `type: json`. A first-time user cannot finish the normal path: the Setup tab looks complete while readiness blocks on two fields living in the Advanced tab that demand hand-authored JSON. Verified runtime shapes (`createAudience.schema.ts`): both are small flat fixed-key `.strict()` objects (contact = 8 string keys, campaign_defaults = 4 keys incl. one email) — **exact fit for the new `object` fixed-key editor**. This is the single worst UX in the group.
2. **Raw provider-id free-text with zero pickers (stripe, shopify)** — Stripe has **no registered option resolvers at all**; 20 fields across 14 actions demand `cus_xxx` / `price_xxx` / `pi_xxx` / `sub_xxx` / `pm_xxx` / `ch_xxx` as free text. Shopify likewise has none; 10 fields demand numeric ids (`order_id`, `product_id`, `variant_id`, `inventory_item_id`, `location_id`, `customer_id`). Mitigation: most are legitimately upstream-wired (descriptions say so), so severity is mostly MEDIUM, but `stripe:customers` / `stripe:prices` / `shopify:products` / `shopify:locations` resolvers (all plausible with existing scopes) would close the top-of-funnel cases. QuickBooks and Mailchimp already model the right pattern (combobox + allowManualEntry).
3. **Mode-switched fields shown unconditionally** — 10 fields across 4 nodes use `dependsOn` or prose ("Cancel only", "required when Mode is saved") where the new top-level `visibleWhen` (valueIn + required-when-visible) is the exact tool: shopify `update_order_status` (4 fields), mailchimp `create_segment` (3), stripe `create_checkout_session.lineItems` (1, currently `required:false` despite being runtime-required in 2 of 3 modes), stripe `update_subscription.days_until_due` (1), mailchimp `get_subscribers.sortDir` (1).
4. **Money-moving server-side default not surfaced as a choice** — `stripe:create_invoice.autoAdvance` is optional, but when omitted Stripe defaults it to `true` and the "draft" invoice auto-finalizes and collects. Q11 spirit says this behaviour-switch must be an explicit choice.
5. **Advanced-only JSON that could be structured** — 5 json fields total in the group. 4 are flat fixed-key objects (mailchimp contact + campaign_defaults, shopify shipping/billing address) → clean `object` candidates. `stripe:create_checkout_session.automaticTax` is `{enabled: boolean}` (trivial object candidate). `stripe:create_payment_link.afterCompletion` is a 2-variant discriminated union — object-editor candidate ONLY if the editor supports row-local `visibleWhen` (type select + redirectUrl when type=redirect), same mechanic ObjectListItemField already has.
6. **Free-text entry of a closed enum set** — `mailchimp:audience_event.eventTypes` is chip-style free text for exactly 6 allowed values, enforced only at activation (typo ⇒ activation failure). `stripe:event_received` already shows the right pattern (combobox multiple, 18 static options). Also `mailchimp:create_segment.conditions.op` (Mailchimp DSL comparison) is free text where a static select of documented ops fits.
7. **Pagination plumbing on the normal path** — cursor/offset fields (`mailchimp offset`, `quickbooks startPosition`, `stripe startingAfter/endingBefore`) are power-user loop plumbing sitting beside core fields; all belong in Advanced.
8. **Unit jargon in labels** — `stripe:capture_payment_intent.amount_to_capture` label contains "CENTS — Stripe wire-format" (wire-format = implementation vocabulary in a label). The dollars-vs-cents split across Stripe actions is real and must stay (runtime-locked), but labels should say it plainly.

---

## mailchimp (21 nodes)

### mailchimp:add_subscriber (action) — Add Subscriber
| Field | Current | Why fails/succeeds | Power-user value | Class | Proposed Setup | Proposed Advanced | Default/derivation | Runtime preservation | Compat risk |
|---|---|---|---|---|---|---|---|---|---|
| audience_id | combobox `mailchimp:audiences`, req | Good picker | — | provider-resource-selection | keep | — | — | key preserved | none |
| email | text req | Fine (usually mapped) | — | upstream-data-mapping | keep | — | — | — | none |
| status | select req no default | Correct Q11 consent gate; description is compliance-heavy but honest | — | core-user-decision | soften copy: lead with outcome ("How did this person opt in?") | — | none (Q11) | — | none |
| first_name…country (8 merge fields) | text opt | OK; "Maps to Mailchimp's `FNAME` merge tag" is implementation trivia | — | upstream-data-mapping | drop merge-tag jargon: "Optional. Saved to the subscriber profile." | — | — | — | none |
| tags | text opt, CSV | CSV string while add_tag uses chips — inconsistent but runtime-locked (`tags: z.string()` verified) | — | structured-composition | keep text; description already flags CSV | — | — | value shape locked to CSV string | changing to array = runtime break — do NOT |

### mailchimp:update_subscriber (action) — Update Subscriber
Fields mirror add_subscriber (audience_id, email, new_email, status opt, 8 merge fields). Same findings: merge-tag jargon (LOW), otherwise OK — PATCH semantics well explained, status optional-no-default is correct.

### mailchimp:get_subscriber (action) — Get Subscriber
No findings — audience picker + member picker (`mailchimp:members`, dependsOn audience_id, cascading) is the model pattern for the group.

### mailchimp:get_subscribers (action) — Get Subscribers
| Field | Current | Why | Class | Proposal |
|---|---|---|---|---|
| listId | combobox req | OK (camelCase name runtime-locked, noted in meta) | provider-resource-selection | keep |
| status | select opt | OK | conditional-option | keep |
| count | number opt | Server default 50 undocumented in UI value | safe-default | LOW: `defaultValue: 50` visible in field (optional, honest — matches server) |
| offset | number opt | Loop plumbing on normal path | advanced-user-control | MEDIUM: `advanced: true` |
| sinceLastChanged / beforeLastChanged | text opt ISO | Should be datetime-utc type (exists!) | upstream-data-mapping | MEDIUM: `type: "datetime-utc"` — check runtime accepts `Z` form (placeholder already shows it) |
| sortField / sortDir | selects opt | sortDir meaningless without sortField | conditional-option | LOW: sortDir `visibleWhen: {field: sortField, valueTruthy}` |

### mailchimp:add_tag (action) — Add Tag
No findings — audience picker, email, string-array chips with clear copy. Good.

### mailchimp:remove_tag (action) — Remove Tag
No findings — mirror of add_tag, equally clean.

### mailchimp:create_audience (action) — Create Audience  ⚠ worst node in group
| Field | Current | Why fails | Power-user value | Class | Proposed Setup | Proposed Advanced | Default/derivation | Runtime preservation | Compat risk |
|---|---|---|---|---|---|---|---|---|---|
| name | text req | OK | — | core-user-decision | keep | — | — | — | none |
| permission_reminder | textarea req | OK, good copy + placeholder | — | core-user-decision | keep | — | — | — | none |
| email_type_option | boolean req | OK (explicit choice, honest copy) | — | core-user-decision | keep | — | — | — | none |
| **contact** | **json, req, advanced:true** | **HIGH: required compliance field hidden in Advanced tab, demands hand-typed JSON.** Runtime = flat `.strict()` object: company, address1, city, state, zip, country required; address2, phone optional (all strings) | none — nobody wants JSON here | structured-composition | **convert to `object` fixed-key editor, `advanced: false`**, keys exactly as schema; label "Mailing address (shown in email footers)" | — | — | editor commits identical object; keys verbatim | old saved configs already hold the same object — none |
| **campaign_defaults** | **json, req, advanced:true** | **HIGH: same as contact.** Runtime = flat `.strict()`: from_name, from_email required; subject, language optional | none | structured-composition | **convert to `object` editor, `advanced: false`**; label "Default sender"; description "Name and email campaigns are sent from. Use a domain you've verified in Mailchimp." | — | — | identical object committed | none |
| use_archive_bar, marketing_permissions, double_optin | boolean opt | Niche audience-level toggles | yes | advanced-user-control | — | MEDIUM: `advanced: true` on all three | — | — | none |
| notify_on_subscribe / notify_on_unsubscribe | text opt | Ops emails, rarely used | yes | advanced-user-control | — | MEDIUM: `advanced: true` | — | — | none |

Interim if `object` editor slips: at minimum flip `advanced: false` on contact + campaign_defaults so required fields are visible on the normal path (still HIGH-priority).

### mailchimp:create_segment (action) — Create Segment
| Field | Current | Why | Class | Proposal |
|---|---|---|---|---|
| audience_id, name, mode | pickers/select req | OK; mode required-no-default is right (runtime is a discriminatedUnion on mode) | core-user-decision | keep |
| static_emails | string-array opt, "Used when Mode is static" prose | Shown in saved mode where runtime `.strict()` REJECTS it | conditional-option | MEDIUM: `visibleWhen: {field: mode, valueIn: ["static"]}` |
| conditions | object-list opt, "Used when Mode is saved" | Runtime REQUIRES it (min 1) when mode=saved, rejects when static; currently optional + always visible | conditional-option | MEDIUM: `visibleWhen: {mode valueIn ["saved"]}` + `required: true` (required-when-visible) |
| conditions.field / conditions.op | row text req | Free text demanding Mailchimp DSL values | structured-composition | MEDIUM: `op` → row `select` with Mailchimp's documented comparisons (is, not, contains, notcontain, starts, ends, greater, less); keep `field` text with better copy ("Merge field or EMAIL") |
| match | select opt | Only meaningful when saved | conditional-option | MEDIUM: `visibleWhen: {mode valueIn ["saved"]}` |

### mailchimp:create_custom_event (action) — Create Custom Event
No findings of substance — event_name constraints clearly explained with examples, properties keyvalue, occurred_at uses datetime-utc correctly. LOW: `is_syncing` label "Sync mode" → "Suppress automations (bulk sync)" and `advanced: true` (power-user backfill control).

### mailchimp:add_note (action) — Add Note
No findings — three fields, plain language, 1000-char cap stated.

### mailchimp:unsubscribe_subscriber (action) — Unsubscribe Subscriber
No findings — two required fields, camelCase names runtime-locked and documented; consent consequences well explained.

### mailchimp:remove_subscriber (action) — Remove Subscriber
No findings — mode select required-no-default with IRREVERSIBLE warning is exactly right (Q11). Copy is honest.

### mailchimp:get_campaign / mailchimp:get_campaign_stats (2 actions)
No findings — single `mailchimp:campaigns` picker each; stats node documents the NotFoundError-on-unsent behavior.

### mailchimp:audience_event (trigger) — Audience Event
| Field | Current | Why fails | Class | Proposal |
|---|---|---|---|---|
| audienceId | combobox req | OK | provider-resource-selection | keep |
| **eventTypes** | **string-array free chips, req** | **HIGH: user must type from a 6-value closed enum; typo ⇒ activation failure.** stripe:event_received proves the fix pattern | conditional-option | convert to combobox `multiple: true` with 6 static options (subscribe, unsubscribe, profile, upemail, cleaned, campaign) with plain labels ("Someone subscribes", …). Runtime value stays `string[]` — preserved |

### mailchimp:campaign_created (trigger)
No findings — two optional filters, both pickers/selects, "leave empty" semantics stated.

### mailchimp:email_opened (trigger)
No findings — one optional campaign picker; empty-state behavior documented.

### mailchimp:link_clicked (trigger)
No findings — optional campaign picker + exact-URL text filter; "exact URL" caveat present. LOW: url description could warn Mailchimp tracks redirect-wrapped URLs verbatim (already implied).

### mailchimp:new_audience (trigger)
No findings — zero-config, description says what it watches.

### mailchimp:segment_updated (trigger) / mailchimp:subscriber_added_to_segment (trigger)
No findings — model cascading pickers (audience → segment via `mailchimp:segments` requiredDeps). "Select Audience first" placeholder is exactly right.

---

## stripe (17 nodes)

### stripe:create_customer (action) — Create Customer
No findings — email/name/description/metadata; keyvalue for metadata; "NOT a charge" framing is good. LOW: metadata description mentions "meta layer stays strict (Record<string,string>)" — implementation talk; trim to "Text-only key/value pairs. Stripe caps at 50 keys."

### stripe:update_customer (action) — Update Customer
| Field | Current | Why | Class | Proposal |
|---|---|---|---|---|
| customerId | text req `cus_xxx` | Free text; usually wired (description shows variable) | upstream-data-mapping | MEDIUM: combobox `stripe:customers` (**new-resolver**: GET /v1/customers, read scope exists) + allowManualEntry |
| email, name, description | opt | OK, PATCH semantics stated | core-user-decision | keep |
| metadata | keyvalue opt | REPLACES warning present — good | structured-composition | keep |

### stripe:find_customer (action) — Find Customer
Fields OK (either-or lookup documented, non-unique email caveat). MEDIUM: mutex is prose-only — no infra for either-or groups; note for future. customerId picker as above (new-resolver) — LOW here since it's a lookup node.

### stripe:create_payment_intent (action) — Create Payment Intent
| Field | Current | Why | Class | Proposal |
|---|---|---|---|---|
| amount | number req, "USD dollars" | Dollars→cents conversion explained; label says USD but runtime allows any currency | core-user-decision | MEDIUM: label "Amount (in dollars/major units)" — currency isn't always USD; keep critical cents warning |
| currency | text req lowercase | Runtime regex `^[a-z]{3}$` (verified); free text invites `USD` failure | conditional-option | MEDIUM: combobox allowManualEntry with common lowercase codes (usd, eur, gbp, cad, aud, jpy…); value stays string |
| customerId | text opt | Usually wired; ok | upstream-data-mapping | LOW: `stripe:customers` picker (new-resolver) |
| description, metadata | opt | OK | — | keep |

### stripe:confirm_payment_intent (action) — Confirm Payment Intent
No findings of substance — pi/pm ids are genuinely upstream-wired (descriptions name the exact variables), receipt_email/return_url conditions explained. High-risk action correctly framed.

### stripe:capture_payment_intent (action) — Capture Payment Intent
| Field | Current | Why | Class | Proposal |
|---|---|---|---|---|
| paymentIntentId | text req | Upstream-wired, state precondition documented | upstream-data-mapping | keep |
| amount_to_capture | number opt, label "Amount to capture (CENTS — Stripe wire-format)" | "wire-format" = implementation vocab in a LABEL (copy-guard territory); cents unit itself is runtime-locked | advanced-user-control | MEDIUM: label → "Amount to capture (cents)"; keep DOLLARS-vs-CENTS warning in description; consider `advanced: true` (omit = full capture is the common case) |

### stripe:create_refund (action) — Create Refund
Fields OK — either-or ids documented, dollars unit + full-refund-by-omission clearly stated, reason is a proper select, metadata keyvalue. MEDIUM (shared): mutex chargeId/paymentIntentId is prose-only. No field changes needed beyond that infra note.

### stripe:find_payment_intent (action) — Find Payment Intent
No findings — single wired id, found:false semantics documented.

### stripe:create_subscription (action) — Create Subscription
| Field | Current | Why | Class | Proposal |
|---|---|---|---|---|
| customerId | text req | Free text top-of-funnel | upstream-data-mapping | MEDIUM: `stripe:customers` picker (new-resolver) + allowManualEntry |
| priceId | text req `price_xxx` | **Price ids are catalog data the user picks in Stripe today — classic picker case** | provider-resource-selection | MEDIUM: combobox `stripe:prices` (**new-resolver**: GET /v1/prices?active=true, label = product name + amount) + allowManualEntry |
| default_payment_method | text opt | ok, wired | upstream-data-mapping | keep; "snake_case for V1 cutover parity" sentences → strip from all descriptions (internal detail), LOW ×6 across stripe |
| payment_behavior | select opt | No-default honest; options exist | advanced-user-control | MEDIUM: `advanced: true` |
| trialPeriodDays, metadata | opt | OK | — | keep |

### stripe:update_subscription (action) — Update Subscription
| Field | Current | Why | Class | Proposal |
|---|---|---|---|---|
| subscriptionId | text req | wired | upstream-data-mapping | keep |
| priceId, quantity | opt | in-place semantics documented | core-user-decision | priceId → `stripe:prices` picker (MEDIUM, new-resolver) |
| trial_end | text opt "Unix timestamp OR 'now'" | Raw epoch seconds hand-typed — hostile | advanced-user-control | MEDIUM: `advanced: true`; description "Enter `now` to end the trial immediately, or map a Unix timestamp (seconds)" |
| cancel_at_period_end | boolean opt | dual-meaning (false clears scheduled cancel) documented | advanced-user-control | keep |
| proration_behavior | select opt | honest no-default | advanced-user-control | MEDIUM: `advanced: true` |
| default_payment_method | text opt | wired | upstream-data-mapping | keep |
| metadata | keyvalue | REPLACES warning present | — | keep |
| collection_method | select opt | OK | conditional-option | keep |
| days_until_due | number opt "Only meaningful when collection_method = send_invoice" | Shown always | conditional-option | MEDIUM: `visibleWhen: {field: collection_method, valueIn: ["send_invoice"]}` |

### stripe:cancel_subscription (action) — Cancel Subscription
| Field | Current | Why | Class | Proposal |
|---|---|---|---|---|
| subscriptionId | text req | wired | upstream-data-mapping | keep |
| at_period_end | boolean opt | **Omitted ⇒ IMMEDIATE cancellation** — a destructive default hidden behind an optional toggle; description warns but an unchecked box reads as "default/safe" | core-user-decision | MEDIUM-HIGH: make meta `required: true` (explicit choice; runtime already accepts both values — no runtime change) |
| invoice_now, prorate | boolean opt | Billing-nerd knobs | advanced-user-control | MEDIUM: `advanced: true` both |

### stripe:find_subscription (action) — Find Subscription
No findings — single wired id.

### stripe:create_checkout_session (action) — Create Checkout Session
| Field | Current | Why | Class | Proposal |
|---|---|---|---|---|
| mode | select req | OK, plain outcomes | core-user-decision | keep |
| successUrl / cancelUrl | text req | OK; placeholder tip documented | core-user-decision | keep |
| **lineItems** | **object-list `required: false`**, bold prose "Required when mode payment/subscription" | **HIGH: runtime superRefine rejects empty lineItems in 2 of 3 modes, but readiness lets the user save without it — guaranteed run failure** | conditional-option | `visibleWhen: {field: mode, valueIn: ["payment","subscription"]}` + `required: true` (required-when-visible; hidden in setup mode = correctly rejected by runtime anyway) |
| lineItems.priceId | row text | catalog data | provider-resource-selection | note: row optionsSource unsupported by ObjectListItemField (deliberate) — infra gap, no change now |
| customer / customerEmail | text opt, prose mutex | Mutex enforced only at runtime | upstream-data-mapping | MEDIUM: no either-or infra; keep prose, flag for future either-or group support |
| clientReferenceId, metadata, allowPromotionCodes | opt | OK | — | keep |
| automaticTax | json advanced, `{enabled: boolean}` `.strict()` (verified) | JSON ceremony for one boolean | advanced-user-control | MEDIUM: convert to `object` editor with single boolean key `enabled` (label "Calculate tax automatically"); stays Advanced; runtime object preserved |

### stripe:create_payment_link (action) — Create Payment Link
| Field | Current | Why | Class | Proposal |
|---|---|---|---|---|
| lineItems | object-list req | OK (max 20 documented) | structured-composition | priceId row: same infra note |
| metadata, allowPromotionCodes | opt | OK | — | keep |
| afterCompletion | json advanced | Runtime = discriminatedUnion: `{type:"redirect", redirectUrl}` \| `{type:"hosted_confirmation"}` (verified) — NOT flat | advanced-user-control | MEDIUM: `object` editor candidate ONLY with per-key visibleWhen (type select → redirectUrl when type="redirect"); otherwise keep json. Flag to infra slice |

### stripe:create_invoice (action) — Create Invoice
| Field | Current | Why | Class | Proposal |
|---|---|---|---|---|
| customerId | text req | free text | upstream-data-mapping | MEDIUM: `stripe:customers` picker (new-resolver) |
| description, metadata | opt | OK | — | keep |
| **autoAdvance** | **boolean opt; omitted ⇒ Stripe defaults `true` ⇒ auto-finalize + collect (money moves)** | **HIGH: a normal user creating a "draft invoice" silently triggers collection. Behaviour-switching + money-moving must be an explicit choice (Q11 spirit)** | core-user-decision | make meta `required: true`, label "Finalize and collect automatically"; description "Yes: Stripe finalizes this invoice and attempts to charge/email the customer. No: stays a draft until another step finalizes it." Runtime schema unchanged (accepts both) |

### stripe:get_payments (action) — Get Payments
| Field | Current | Why | Class | Proposal |
|---|---|---|---|---|
| customer | text opt | filter, ok | upstream-data-mapping | LOW: picker later |
| limit | number opt | honest no-default (Stripe=10) | safe-default | keep |
| startingAfter / endingBefore | text opt, prose mutex | Loop plumbing on normal path | advanced-user-control | MEDIUM: `advanced: true` both |

### stripe:event_received (trigger) — Stripe Event Received
No findings — combobox multiple with 18 static event types; this is the pattern mailchimp:audience_event should copy.

---

## quickbooks (11 nodes)

### quickbooks:create_customer (action) — Create Customer
No findings of substance — 13 plain fields, displayName uniqueness rule surfaced, email consequence ("becomes the billing email invoices are sent to") stated. LOW: companyName/givenName/familyName/phone/address fields lack descriptions (5 fields) — add one-liners; LOW: country could be combobox of ISO names later.

### quickbooks:find_customer (action) — Find Customer
No findings — searchBy select + value text, one-field-per-search limitation explained, found:false documented.

### quickbooks:get_customer (action) — Get Customer
No findings — combobox `quickbooks:customers` + allowManualEntry. Model pattern.

### quickbooks:create_invoice (action) — Create Invoice (draft)
| Field | Current | Why | Class | Proposal |
|---|---|---|---|---|
| customerId | combobox req | Good | provider-resource-selection | keep |
| lineItems | object-list req; itemId + taxCodeId are row TEXT | `quickbooks:items` and `quickbooks:tax_codes` resolvers EXIST (registry lines 716/718) but ObjectListItemField deliberately has no optionsSource — user hand-copies QBO ids into rows | structured-composition | MEDIUM: infra gap — row-level optionsSource is the single highest-value object-list upgrade in this group; interim keep description pointing at where ids live |
| txnDate, dueDate | date opt | server-derivation documented | derived-value | keep |
| termId | combobox opt | Good ("Company default" placeholder) | provider-resource-selection | LOW: add a description (it has none) |
| customerEmail, customerMemo, privateNote | opt | Visibility of each (customer-facing vs internal) stated — excellent | — | keep |
| globalTaxCalculation | select opt "non-US companies only" | Irrelevant to US majority, always shown | advanced-user-control | MEDIUM: `advanced: true` |

### quickbooks:send_invoice (action) — Send Invoice (emails customer)
No findings — invoice picker + optional override whose side-effect (also updates stored billing email) is called out. Send-fails-if-no-email documented.

### quickbooks:get_invoice (action) — Get Invoice
No findings — invoice picker + allowManualEntry.

### quickbooks:list_invoices (action) — List Invoices
Fields mostly OK (customer filter picker, date range). MEDIUM: `startPosition` → `advanced: true` (loop plumbing). LOW: `pageSize` `defaultValue: 25` (honest — matches documented default).

### quickbooks:customer_created / invoice_created / payment_received / invoice_paid (4 triggers)
No findings — zero-config triggers; each description says exactly what fires and what the event carries. invoice_paid's fires-once/partial-payment semantics are well documented.

---

## shopify (12 nodes)

### shopify:create_order (action) — Create Order
| Field | Current | Why | Class | Proposal |
|---|---|---|---|---|
| email | text req | OK | upstream-data-mapping | keep |
| line_items | object-list req; variant_id row number | No variant picker (row optionsSource unsupported); "numeric id of the product variant" is provider knowledge | structured-composition | MEDIUM: same row-picker infra gap; improve row label description ("Find it on the product's variant, or map from a product step") |
| send_receipt | boolean req no default | Correct Q11 gate | core-user-decision | keep |
| financial_status | select opt | OK | conditional-option | keep |
| note, tags | opt | OK | — | keep |
| shipping_address / billing_address | json advanced opt | Runtime = flat `.strict()` object, 6 optional string keys (address1, address2, city, province, country_code, zip) — verified | structured-composition | MEDIUM: convert both to `object` fixed-key editor (text keys; country_code stays 2-letter w/ hint), stay Advanced. Runtime object preserved. Kills 2 of the group's 5 paste-JSON fields |

### shopify:update_order_status (action) — Update Order Status
| Field | Current | Why | Class | Proposal |
|---|---|---|---|---|
| action | select req | OK, irreversibility flagged | core-user-decision | keep |
| order_id | text req | wired/typeable | upstream-data-mapping | keep |
| notify_customer | boolean req | Required even for tags/note where it does nothing ("required for shape consistency" — implementation-speak, runtime-locked shape) | core-user-decision | MEDIUM: description → "For Cancel: emails the customer a cancellation notice. Has no effect for Add Tags / Add Note (still required)." |
| reason, restock | opt, dependsOn action | "Cancel only" prose; shown for all ops | conditional-option | MEDIUM: `visibleWhen: {field: action, valueIn: ["cancel"]}` |
| tags | text opt "required for that operation" | Runtime (discriminatedUnion, verified) REQUIRES it for add_tags; readiness doesn't | conditional-option | MEDIUM: `visibleWhen: {action valueIn ["add_tags"]}` + `required: true` |
| note | textarea opt | same for add_note | conditional-option | MEDIUM: `visibleWhen: {action valueIn ["add_note"]}` + `required: true` |

### shopify:add_order_note (action) — Add Order Note
No findings — order_id + note + explicit append/overwrite choice (good Q11-style gate); internal-only framing stated.

### shopify:create_fulfillment (action) — Create Fulfillment
No findings of substance — notify_customer consent gate correct, tracking fields optional and plain. LOW: order_id picker would help someday (needs `shopify:orders` resolver — probably not worth it; ids come from triggers).

### shopify:create_product (action) — Create Product
No findings of substance — title/price required, rest optional and plain. LOW: price as decimal-string is runtime-locked; placeholder communicates it well.

### shopify:update_product (action) — Update Product
Fields OK (patch semantics stated; published toggle tri-state explained). MEDIUM: `tags` REPLACES existing tags — destructive overwrite mentioned only in parens; bold it or warn ("Replaces ALL existing tags on the product"). product_id free text — see systemic pattern 2 (LOW here, usually wired).

### shopify:create_product_variant (action) — Create Product Variant
Fields OK. MEDIUM: option1/option2/option3 labels are positional provider jargon — a normal user doesn't know "Option 1" means "the product's first option, e.g. Size"; add example-led descriptions ("Value for the product's first option — e.g. 'Large' if option 1 is Size"). product_id: systemic picker gap (`shopify:products` new-resolver, MEDIUM).

### shopify:update_product_variant (action) — Update Product Variant
Fields OK — at-least-one-change rule surfaced, weight_unit is a proper 4-value select, inventory exclusion explained. Same option1..3 wording note (covered above). variant_id free text (systemic).

### shopify:create_customer (action) — Create Customer
No findings — send_welcome_email consent gate correct; rest plain.

### shopify:update_customer (action) — Update Customer
Fields OK. MEDIUM: `tags` same replaces-all warning as update_product. `accepts_marketing` is a consent flag set silently — description says "records the customer's marketing consent"; add "Only set this to true with the customer's actual consent" (LOW copy).

### shopify:update_inventory (action) — Update Inventory
| Field | Current | Why | Class | Proposal |
|---|---|---|---|---|
| inventory_item_id | text req | Derivation documented (variant's inventoryItemId output) | upstream-data-mapping | keep |
| location_id | text req | Provider-internal id, no picker; single-location shops (majority) shouldn't need to know this exists | provider-resource-selection | MEDIUM: combobox `shopify:locations` (**new-resolver**: GET /locations.json — small, stable list) + allowManualEntry |
| adjustment_type + quantity | select + number req | Set/add/subtract with unsigned delta — clean design | core-user-decision | keep |

### shopify:webhook_received (trigger) — Webhook Received
No findings — multi-select of 8 topics, branch-on-`payload.topic` documented.

---

## Change list

### HIGH
1. `integrations/mailchimp/actions/createAudience.meta.ts` — `contact`: `type: "json"` → `type: "object"` (fixed keys: company*, address1*, city*, state*, zip*, country*, address2, phone — all text), `advanced: false`. Description: "Your organization's mailing address — shown in the footer of every email, as required by anti-spam law." Runtime `ContactSchema` object committed unchanged. *(Gated on `object` editor; interim: at minimum `advanced: false`.)*
2. `integrations/mailchimp/actions/createAudience.meta.ts` — `campaign_defaults`: `type: "json"` → `type: "object"` (keys: from_name*, from_email*, subject, language), `advanced: false`, label "Default sender". Description: "The name and email address campaigns to this audience are sent from. Use an email on a domain you've verified in Mailchimp." Runtime object unchanged.
3. `integrations/mailchimp/triggers/**/audience_event meta` — `eventTypes`: string-array → combobox `multiple: true` with 6 static options (values verbatim: subscribe, unsubscribe, profile, upemail, cleaned, campaign; labels plain: "Someone subscribes", "Someone unsubscribes", "Profile updated", "Email address changed", "Address cleaned (bounced)", "Campaign sent"). Runtime value stays `string[]`.
4. `integrations/stripe/actions/createCheckoutSession.meta.ts` — `lineItems`: add `visibleWhen: {field: "mode", valueIn: ["payment","subscription"]}` and `required: true` (required-when-visible). Closes the save-then-runtime-fail gap.
5. `integrations/stripe/actions/createInvoice.meta.ts` — `autoAdvance`: `required: true`, label "Finalize and collect automatically". Description: "Yes: Stripe finalizes the invoice and attempts to charge or email the customer. No: the invoice stays a draft until another step finalizes it." (Runtime stays optional — accepts both; readiness now forces the choice.)

### MEDIUM
6. `integrations/shopify/actions/updateOrderStatus.meta.ts` — `reason`, `restock`: `visibleWhen: {field: "action", valueIn: ["cancel"]}`; `tags`: `visibleWhen: {action valueIn ["add_tags"]}` + `required: true`; `note`: `visibleWhen: {action valueIn ["add_note"]}` + `required: true`. `notify_customer` description: "For Cancel: emails the customer a cancellation notice. Has no effect for Add Tags / Add Note (still required)."
7. `integrations/mailchimp/actions/createSegment.meta.ts` — `static_emails`: `visibleWhen: {mode valueIn ["static"]}`; `conditions`: `visibleWhen: {mode valueIn ["saved"]}` + `required: true`; `match`: `visibleWhen: {mode valueIn ["saved"]}`; `conditions.op` itemField → `select` with Mailchimp's documented comparison ops.
8. `integrations/shopify/actions/createOrder.meta.ts` — `shipping_address`, `billing_address`: json → `object` editor (keys: address1, address2, city, province, country_code, zip — all optional text; country_code hint "2-letter code, e.g. US"), stay `advanced: true`.
9. `integrations/stripe/actions/createCheckoutSession.meta.ts` — `automaticTax`: json → `object` editor with single boolean key `enabled`, label "Calculate tax automatically"; stays Advanced.
10. `integrations/stripe/actions/createPaymentLink.meta.ts` — `afterCompletion`: object-editor candidate only if per-key visibleWhen ships (type select redirect|hosted_confirmation; redirectUrl visible when redirect). Else keep json.
11. New resolvers (each **new-resolver**, needs API+scope check): `stripe:customers` (GET /v1/customers) backing customerId on update_customer / create_payment_intent / create_subscription / create_invoice / checkout `customer` / get_payments; `stripe:prices` (GET /v1/prices?active=true) backing priceId on create_subscription / update_subscription; `shopify:locations` (GET /locations.json) backing update_inventory.location_id; `shopify:products` (GET /products.json) backing product_id fields. All combobox + `allowManualEntry: true` so upstream wiring keeps working.
12. `integrations/stripe/actions/createPaymentIntent.meta.ts` — `currency`: text → combobox `allowManualEntry: true` with common lowercase ISO codes; label unchanged. Description: "3-letter lowercase code, e.g. usd. Uppercase is rejected."
13. `integrations/stripe/actions/capturePaymentIntent.meta.ts` — `amount_to_capture`: label → "Amount to capture (cents)"; keep dollars-vs-cents warning in description; add `advanced: true` (omit = full capture is the common path).
14. `integrations/stripe/actions/cancelSubscription.meta.ts` — `at_period_end`: `required: true` (explicit immediate-vs-period-end choice); `invoice_now`, `prorate`: `advanced: true`.
15. `integrations/stripe/actions/updateSubscription.meta.ts` — `days_until_due`: `visibleWhen: {field: "collection_method", valueIn: ["send_invoice"]}`; `trial_end`, `proration_behavior`: `advanced: true`. `createSubscription.meta.ts` — `payment_behavior`: `advanced: true`.
16. Pagination plumbing → Advanced: `mailchimp getSubscribers.offset`, `quickbooks listInvoices.startPosition`, `stripe getPayments.startingAfter` + `endingBefore`: `advanced: true`.
17. `integrations/quickbooks/actions/createInvoice.meta.ts` — `globalTaxCalculation`: `advanced: true`. Row-picker infra gap: `quickbooks:items` / `quickbooks:tax_codes` resolvers already exist but ObjectListItemField can't consume them — highest-value object-list upgrade; no meta change until infra lands.
18. `integrations/shopify/actions/updateProduct.meta.ts` + `updateCustomer.meta.ts` — `tags` description: "Replaces ALL existing tags — include any you want to keep."
19. `integrations/mailchimp/actions/getSubscribers.meta.ts` — `sinceLastChanged` / `beforeLastChanged`: `type: "datetime-utc"` (values already ISO-Z; verify runtime accepts).
20. `integrations/mailchimp/actions/createAudience.meta.ts` — `use_archive_bar`, `marketing_permissions`, `double_optin`, `notify_on_subscribe`, `notify_on_unsubscribe`: `advanced: true`.

### LOW
21. Strip "Schema field name preserved as snake_case for V1 cutover parity" from 8 stripe field descriptions (internal detail; keep in code comments).
22. Mailchimp merge-field descriptions (×16 across add/update_subscriber): drop "`Maps to Mailchimp's FNAME merge tag`" → "Optional. Saved to the subscriber's profile."
23. `mailchimp getSubscribers.count`: `defaultValue: 50`; `quickbooks listInvoices.pageSize`: `defaultValue: 25` (both match documented server defaults). `sortDir`: `visibleWhen: {sortField, valueTruthy}`.
24. `shopify createProductVariant/updateProductVariant` option1..3 descriptions: example-led ("e.g. 'Large' if the product's first option is Size").
25. `quickbooks createCustomer`: add one-line descriptions to the 5 description-less fields; `createInvoice.termId`: add description.
26. `mailchimp createCustomEvent.is_syncing`: `advanced: true`, label "Suppress automations (bulk sync)". `stripe createCustomer.metadata`: trim implementation sentence.

## Counts

- Nodes audited: **61** (mailchimp 21, stripe 17, quickbooks 11, shopify 12) — every node in slice appears above.
- Fields audited: **264** top-level (+~20 object-list row sub-fields).
- Fields OK as-is: **~190** (incl. all 5 zero/near-zero-config triggers, all Q11 consent gates — which are uniformly well done in this group).
- Findings: **HIGH 5** (2 required-JSON-in-Advanced, 1 free-text enum trigger, 1 required-when-visible gap, 1 money-moving hidden default) · **MEDIUM ~34 fields** across items 6–20 · **LOW ~30 fields** (copy/defaults polish).
- `object` fixed-key editor candidates confirmed against runtime `.strict()` shapes: mailchimp `contact` (8 flat keys) and `campaign_defaults` (4 flat keys) — both REQUIRED, strongest justification for shipping the editor; shopify `shipping_address`/`billing_address` (6 flat optional keys); stripe `automaticTax` ({enabled}). Non-candidate: stripe `afterCompletion` (discriminated union — needs per-key visibleWhen).
