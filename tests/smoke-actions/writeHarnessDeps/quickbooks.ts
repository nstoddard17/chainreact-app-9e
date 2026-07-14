/**
 * Write smoke harness deps — QuickBooks smoke read-back seam.
 *
 * The QuickBooks write fixtures (create_customer, create_invoice, send_invoice)
 * verify their side effect through a smoke read-back of the persisted record.
 * QuickBooks DOES register user-facing `get_customer` / `get_invoice` reads, but
 * the write harness's verify seam never routes through the engine — it needs a
 * bounded, READ-ONLY provider call keyed on the created id. This seam performs
 * that GET-by-id and returns the SAME output shape the get_customer /
 * get_invoice actions produce (`{ found, customer }` / `{ found, invoice }`) so
 * the fixtures' `markerPath` ("customer.displayName" / "invoice.privateNote")
 * and `expectEquals` ("invoice.emailStatus") resolve unchanged.
 *
 * Output is bounded + sanitized: the wrappers already return projections (never
 * raw provider records / tokens / PII), and a typed 404 maps to
 * `{ found: false, ... : null }` (friendly not-found — the same semantics the
 * actions expose), while any other error rethrows so an API/permission failure
 * can never read as "not found" (the composer's outer catch sanitizes it).
 *
 * Every provider call runs inside `refreshAndRetry` (QuickBooks is
 * OAuth-with-refresh), same as every QuickBooks action handler and the other
 * smoke seams (seam-refresh-guard).
 */
import { getActiveForExecution } from "@/repositories/integrations";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { customerGet } from "@/integrations/_shared/quickbooks/api/customers";
import { invoiceGet } from "@/integrations/_shared/quickbooks/api/invoices";
import type { StepRunOutcome } from "../writeHarness";
import type { SmokeReaderContext, SmokeReaderInput } from "./context";

async function readQuickbooksCustomer(
  ctx: SmokeReaderContext,
  input: SmokeReaderInput,
): Promise<StepRunOutcome> {
  const customerId = typeof input.config.customerId === "string" ? input.config.customerId : "";
  if (!customerId) return { ok: false, output: null, reason: "quickbooks get_customer: missing customerId" };
  const integration = await getActiveForExecution(ctx.accountId, "quickbooks", null);
  if (!integration) return { ok: false, output: null, reason: "quickbooks not connected" };
  const customer = await refreshAndRetry({
    accountId: ctx.accountId,
    provider: "quickbooks",
    providerAccountId: integration.providerAccountId,
    apiCall: (accessToken) =>
      customerGet({ accessToken, realmId: integration.providerAccountId, customerId }),
  });
  // Mirror the get_customer action's friendly not-found shape.
  return customer
    ? { ok: true, output: { found: true, customer }, reason: null }
    : { ok: true, output: { found: false, customer: null }, reason: null };
}

async function readQuickbooksInvoice(
  ctx: SmokeReaderContext,
  input: SmokeReaderInput,
): Promise<StepRunOutcome> {
  const invoiceId = typeof input.config.invoiceId === "string" ? input.config.invoiceId : "";
  if (!invoiceId) return { ok: false, output: null, reason: "quickbooks get_invoice: missing invoiceId" };
  const integration = await getActiveForExecution(ctx.accountId, "quickbooks", null);
  if (!integration) return { ok: false, output: null, reason: "quickbooks not connected" };
  const invoice = await refreshAndRetry({
    accountId: ctx.accountId,
    provider: "quickbooks",
    providerAccountId: integration.providerAccountId,
    apiCall: (accessToken) =>
      invoiceGet({ accessToken, realmId: integration.providerAccountId, invoiceId }),
  });
  return invoice
    ? { ok: true, output: { found: true, invoice }, reason: null }
    : { ok: true, output: { found: false, invoice: null }, reason: null };
}

/**
 * QuickBooks smoke read-back seam. Owns the two read-back actions the write
 * fixtures verify through:
 *   - `get_customer` — `{ found, customer }` (create_customer marker on
 *     customer.displayName)
 *   - `get_invoice`  — `{ found, invoice }` (create_invoice marker on
 *     invoice.privateNote; send_invoice also asserts invoice.emailStatus)
 * Returns null for any other (provider, action). Bounded + sanitized; the
 * wrappers' typed 404 maps to found:false, any other error rethrows.
 */
export async function quickbooksSmokeReadBack(
  ctx: SmokeReaderContext,
  input: SmokeReaderInput,
): Promise<StepRunOutcome | null> {
  if (input.provider !== "quickbooks") return null;
  if (input.action === "get_customer") return readQuickbooksCustomer(ctx, input);
  if (input.action === "get_invoice") return readQuickbooksInvoice(ctx, input);
  return null;
}
