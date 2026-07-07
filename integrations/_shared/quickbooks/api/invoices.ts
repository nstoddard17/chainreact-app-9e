import { escapeQueryValue, quickbooksRequest } from "./_request";
import { NotFoundError } from "../errors";
import {
  projectInvoice,
  type ProjectedQuickbooksInvoice,
  type QuickbooksRawInvoice,
} from "../projections";

/**
 * Typed Invoice API wrappers — QUICKBOOKS-1.
 *
 * Wire format (docs/providers/quickbooks/research.md):
 *   - Create: `POST /v3/company/{realmId}/invoice` — minimum payload is
 *     `CustomerRef.value` + ≥1 `Line` with
 *     `DetailType: "SalesItemLineDetail"`, `Amount`, and
 *     `SalesItemLineDetail.ItemRef.value`. Creates a DRAFT — the API
 *     never emails on create; sending is the separate `/send` endpoint.
 *   - Send: `POST .../invoice/{id}/send[?sendTo=email]` with
 *     `Content-Type: application/octet-stream` (Intuit's documented
 *     shape). `sendTo` overrides AND persists `BillEmail`; without it
 *     the invoice's stored `BillEmail` is used.
 *   - Read: `GET .../invoice/{id}`.
 *   - List: the query endpoint with optional exact `CustomerRef` and
 *     `TxnDate` range predicates (AND-joined — QBO has no OR),
 *     `STARTPOSITION` (1-based) + `MAXRESULTS` offset pagination (QBO
 *     has no cursors). NO server-side open/paid filter — `Balance`
 *     filterability is unverified (research §Unverified 7); callers
 *     branch on the projection's `balance`/`paid`.
 *
 * All wrappers return bounded projections — never raw records. NO
 * generic query input: every predicate is built server-side from typed
 * fields through `escapeQueryValue`.
 */

export interface InvoiceLineInput {
  /** QBO Item id (product/service) — SalesItemLineDetail.ItemRef.value. */
  itemId: string;
  /** Line total. Explicit — V2 never derives amounts (no hidden math). */
  amount: number;
  quantity?: number;
  unitPrice?: number;
  description?: string;
  /** Per-line TaxCodeRef — explicit user choice only, never defaulted. */
  taxCodeId?: string;
}

export interface InvoiceCreateInput {
  accessToken: string;
  realmId: string;
  customerId: string;
  lines: InvoiceLineInput[];
  txnDate?: string;
  dueDate?: string;
  /** SalesTermRef — QBO derives DueDate from it when dueDate omitted. */
  termId?: string;
  /** BillEmail.Address — where a later send_invoice will deliver. */
  customerEmail?: string;
  /** Customer-visible memo (prints on the invoice). */
  customerMemo?: string;
  /** Internal note (never shown to the customer). */
  privateNote?: string;
  /** Non-US companies only; TaxExcluded | TaxInclusive | NotApplicable. */
  globalTaxCalculation?: string;
}

interface InvoiceEnvelope {
  Invoice?: QuickbooksRawInvoice;
}

interface InvoiceQueryEnvelope {
  QueryResponse?: {
    Invoice?: QuickbooksRawInvoice[];
  };
}

export async function invoiceCreate(
  input: InvoiceCreateInput,
): Promise<ProjectedQuickbooksInvoice> {
  const body: Record<string, unknown> = {
    CustomerRef: { value: input.customerId },
    Line: input.lines.map((line) => {
      const detail: Record<string, unknown> = {
        ItemRef: { value: line.itemId },
      };
      if (typeof line.quantity === "number") detail.Qty = line.quantity;
      if (typeof line.unitPrice === "number") detail.UnitPrice = line.unitPrice;
      if (line.taxCodeId) detail.TaxCodeRef = { value: line.taxCodeId };
      const qboLine: Record<string, unknown> = {
        DetailType: "SalesItemLineDetail",
        Amount: line.amount,
        SalesItemLineDetail: detail,
      };
      if (line.description) qboLine.Description = line.description;
      return qboLine;
    }),
  };
  if (input.txnDate) body.TxnDate = input.txnDate;
  if (input.dueDate) body.DueDate = input.dueDate;
  if (input.termId) body.SalesTermRef = { value: input.termId };
  if (input.customerEmail) body.BillEmail = { Address: input.customerEmail };
  if (input.customerMemo) body.CustomerMemo = { value: input.customerMemo };
  if (input.privateNote) body.PrivateNote = input.privateNote;
  if (input.globalTaxCalculation) {
    body.GlobalTaxCalculation = input.globalTaxCalculation;
  }

  const res = await quickbooksRequest<InvoiceEnvelope>({
    accessToken: input.accessToken,
    realmId: input.realmId,
    method: "POST",
    path: "/invoice",
    data: body,
    resourceForNotFound: "invoice create endpoint",
  });
  if (!res.Invoice) {
    throw new Error("QuickBooks invoice create returned no Invoice envelope.");
  }
  return projectInvoice(res.Invoice);
}

/**
 * Read one invoice by id. Returns `null` when QBO answers 404 — the
 * action layer maps that to `found: false`.
 */
export async function invoiceGet(input: {
  accessToken: string;
  realmId: string;
  invoiceId: string;
}): Promise<ProjectedQuickbooksInvoice | null> {
  try {
    const res = await quickbooksRequest<InvoiceEnvelope>({
      accessToken: input.accessToken,
      realmId: input.realmId,
      method: "GET",
      path: `/invoice/${encodeURIComponent(input.invoiceId)}`,
      resourceForNotFound: `invoice ${input.invoiceId}`,
    });
    return res.Invoice ? projectInvoice(res.Invoice) : null;
  } catch (err) {
    if (err instanceof NotFoundError) return null;
    throw err;
  }
}

/**
 * Email the invoice to the customer. EXPLICITLY customer-facing — only
 * the `quickbooks:send_invoice` action calls this. Returns the updated
 * projection (EmailStatus flips to `EmailSent`).
 */
export async function invoiceSend(input: {
  accessToken: string;
  realmId: string;
  invoiceId: string;
  sendTo?: string;
}): Promise<ProjectedQuickbooksInvoice> {
  const query = new URLSearchParams();
  if (input.sendTo) query.set("sendTo", input.sendTo);
  const res = await quickbooksRequest<InvoiceEnvelope>({
    accessToken: input.accessToken,
    realmId: input.realmId,
    method: "POST",
    path: `/invoice/${encodeURIComponent(input.invoiceId)}/send`,
    query,
    octetStream: true,
    resourceForNotFound: `invoice ${input.invoiceId}`,
  });
  if (!res.Invoice) {
    throw new Error("QuickBooks invoice send returned no Invoice envelope.");
  }
  return projectInvoice(res.Invoice);
}

export interface InvoiceListInput {
  accessToken: string;
  realmId: string;
  customerId?: string;
  /** Inclusive TxnDate lower bound, YYYY-MM-DD. */
  dateFrom?: string;
  /** Inclusive TxnDate upper bound, YYYY-MM-DD. */
  dateTo?: string;
  /** Page size 1..100 (V2 bound — QBO's own max is 1000). */
  maxResults: number;
  /** 1-based offset (QBO STARTPOSITION). Defaults to 1. */
  startPosition?: number;
}

export interface InvoiceListPage {
  items: ProjectedQuickbooksInvoice[];
  /**
   * True when the page came back full — QBO's query response carries no
   * total, so a full page is the honest "there may be more" signal.
   */
  hasMore: boolean;
  /** STARTPOSITION for the next page (only meaningful when hasMore). */
  nextStartPosition: number;
}

export async function invoiceList(
  input: InvoiceListInput,
): Promise<InvoiceListPage> {
  const predicates: string[] = [];
  if (input.customerId) {
    predicates.push(`CustomerRef = '${escapeQueryValue(input.customerId)}'`);
  }
  if (input.dateFrom) {
    predicates.push(`TxnDate >= '${escapeQueryValue(input.dateFrom)}'`);
  }
  if (input.dateTo) {
    predicates.push(`TxnDate <= '${escapeQueryValue(input.dateTo)}'`);
  }
  const where = predicates.length > 0 ? ` where ${predicates.join(" and ")}` : "";
  const startPosition = Math.max(1, Math.trunc(input.startPosition ?? 1));
  const maxResults = Math.trunc(input.maxResults);
  const statement = `select * from Invoice${where} ORDERBY MetaData.CreateTime DESC STARTPOSITION ${startPosition} MAXRESULTS ${maxResults}`;

  const res = await quickbooksRequest<InvoiceQueryEnvelope>({
    accessToken: input.accessToken,
    realmId: input.realmId,
    method: "GET",
    path: "/query",
    query: new URLSearchParams({ query: statement }),
    resourceForNotFound: "invoice query",
  });
  const items = (res.QueryResponse?.Invoice ?? []).map(projectInvoice);
  return {
    items,
    hasMore: items.length === maxResults,
    nextStartPosition: startPosition + items.length,
  };
}
