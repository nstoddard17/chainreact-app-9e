/**
 * Bounded projections for QuickBooks Online entities — QUICKBOOKS-1.
 *
 * One narrow projection per entity, shared by the actions, the webhook
 * enrichment layer, and the trigger normalizers so a Customer/Invoice/
 * Payment looks identical whether it came from an action read or a
 * trigger fire. NEVER a raw spread: QBO records carry accounting
 * internals (SyncToken, MetaData, TxnTaxDetail breakdowns, custom
 * fields), provider deep-link URLs, and region-specific blocks that are
 * all deliberately dropped at this boundary.
 *
 * Money fields are projected as numbers exactly as QBO returns them
 * (QBO returns decimal dollars, not cents). PII / money sensitivity is
 * declared in the action/trigger metas, not here — projections stay
 * pure data.
 */

// ─── Raw wire shapes (narrow — only the fields we project) ─────────────────

export interface QuickbooksRawAddress {
  Line1?: string | null;
  Line2?: string | null;
  City?: string | null;
  CountrySubDivisionCode?: string | null;
  PostalCode?: string | null;
  Country?: string | null;
}

export interface QuickbooksRawCustomer {
  Id?: string;
  DisplayName?: string | null;
  CompanyName?: string | null;
  GivenName?: string | null;
  FamilyName?: string | null;
  PrimaryEmailAddr?: { Address?: string | null } | null;
  PrimaryPhone?: { FreeFormNumber?: string | null } | null;
  BillAddr?: QuickbooksRawAddress | null;
  Notes?: string | null;
  Active?: boolean;
  Balance?: number;
  CurrencyRef?: { value?: string | null } | null;
  MetaData?: { CreateTime?: string | null; LastUpdatedTime?: string | null } | null;
}

export interface QuickbooksRawInvoiceLine {
  Id?: string | null;
  Description?: string | null;
  Amount?: number;
  DetailType?: string;
  SalesItemLineDetail?: {
    ItemRef?: { value?: string | null; name?: string | null } | null;
    Qty?: number;
    UnitPrice?: number;
  } | null;
}

export interface QuickbooksRawInvoice {
  Id?: string;
  DocNumber?: string | null;
  CustomerRef?: { value?: string | null; name?: string | null } | null;
  TxnDate?: string | null;
  DueDate?: string | null;
  TotalAmt?: number;
  Balance?: number;
  EmailStatus?: string | null;
  BillEmail?: { Address?: string | null } | null;
  CurrencyRef?: { value?: string | null } | null;
  CustomerMemo?: { value?: string | null } | null;
  PrivateNote?: string | null;
  Line?: QuickbooksRawInvoiceLine[] | null;
  MetaData?: { CreateTime?: string | null; LastUpdatedTime?: string | null } | null;
}

export interface QuickbooksRawPaymentLine {
  Amount?: number;
  LinkedTxn?: Array<{ TxnId?: string | null; TxnType?: string | null }> | null;
}

export interface QuickbooksRawPayment {
  Id?: string;
  CustomerRef?: { value?: string | null; name?: string | null } | null;
  TotalAmt?: number;
  UnappliedAmt?: number;
  TxnDate?: string | null;
  PaymentRefNum?: string | null;
  CurrencyRef?: { value?: string | null } | null;
  Line?: QuickbooksRawPaymentLine[] | null;
  MetaData?: { CreateTime?: string | null; LastUpdatedTime?: string | null } | null;
}

// ─── Projected shapes (what workflows see) ──────────────────────────────────

export interface ProjectedQuickbooksAddress {
  line1: string | null;
  line2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
}

export interface ProjectedQuickbooksCustomer {
  customerId: string | null;
  displayName: string | null;
  companyName: string | null;
  givenName: string | null;
  familyName: string | null;
  email: string | null;
  phone: string | null;
  billingAddress: ProjectedQuickbooksAddress | null;
  notes: string | null;
  active: boolean;
  balance: number | null;
  currency: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface ProjectedQuickbooksInvoiceLine {
  lineId: string | null;
  description: string | null;
  amount: number | null;
  quantity: number | null;
  unitPrice: number | null;
  itemId: string | null;
  itemName: string | null;
}

export interface ProjectedQuickbooksInvoice {
  invoiceId: string | null;
  docNumber: string | null;
  customerId: string | null;
  customerName: string | null;
  txnDate: string | null;
  dueDate: string | null;
  totalAmount: number | null;
  balance: number | null;
  /** True exactly when the invoice has a positive total and zero balance. */
  paid: boolean;
  emailStatus: string | null;
  billEmail: string | null;
  currency: string | null;
  customerMemo: string | null;
  privateNote: string | null;
  lines: ProjectedQuickbooksInvoiceLine[];
  createdAt: string | null;
  updatedAt: string | null;
}

export interface ProjectedQuickbooksPayment {
  paymentId: string | null;
  customerId: string | null;
  customerName: string | null;
  totalAmount: number | null;
  unappliedAmount: number | null;
  currency: string | null;
  txnDate: string | null;
  referenceNumber: string | null;
  /** Invoice ids this payment was applied to (LinkedTxn TxnType=Invoice). */
  linkedInvoiceIds: string[];
  createdAt: string | null;
  updatedAt: string | null;
}

// ─── Projection functions ───────────────────────────────────────────────────

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function projectAddress(
  raw: QuickbooksRawAddress | null | undefined,
): ProjectedQuickbooksAddress | null {
  if (!raw) return null;
  return {
    line1: str(raw.Line1),
    line2: str(raw.Line2),
    city: str(raw.City),
    state: str(raw.CountrySubDivisionCode),
    postalCode: str(raw.PostalCode),
    country: str(raw.Country),
  };
}

export function projectCustomer(
  raw: QuickbooksRawCustomer,
): ProjectedQuickbooksCustomer {
  return {
    customerId: str(raw.Id),
    displayName: str(raw.DisplayName),
    companyName: str(raw.CompanyName),
    givenName: str(raw.GivenName),
    familyName: str(raw.FamilyName),
    email: str(raw.PrimaryEmailAddr?.Address),
    phone: str(raw.PrimaryPhone?.FreeFormNumber),
    billingAddress: projectAddress(raw.BillAddr),
    notes: str(raw.Notes),
    active: raw.Active !== false,
    balance: num(raw.Balance),
    currency: str(raw.CurrencyRef?.value),
    createdAt: str(raw.MetaData?.CreateTime),
    updatedAt: str(raw.MetaData?.LastUpdatedTime),
  };
}

function projectInvoiceLine(
  raw: QuickbooksRawInvoiceLine,
): ProjectedQuickbooksInvoiceLine {
  return {
    lineId: str(raw.Id),
    description: str(raw.Description),
    amount: num(raw.Amount),
    quantity: num(raw.SalesItemLineDetail?.Qty),
    unitPrice: num(raw.SalesItemLineDetail?.UnitPrice),
    itemId: str(raw.SalesItemLineDetail?.ItemRef?.value),
    itemName: str(raw.SalesItemLineDetail?.ItemRef?.name),
  };
}

export function projectInvoice(
  raw: QuickbooksRawInvoice,
): ProjectedQuickbooksInvoice {
  const totalAmount = num(raw.TotalAmt);
  const balance = num(raw.Balance);
  return {
    invoiceId: str(raw.Id),
    docNumber: str(raw.DocNumber),
    customerId: str(raw.CustomerRef?.value),
    customerName: str(raw.CustomerRef?.name),
    txnDate: str(raw.TxnDate),
    dueDate: str(raw.DueDate),
    totalAmount,
    balance,
    // Paid = fully settled: a positive total with nothing left to pay.
    // A zero-total invoice is not treated as "paid" (nothing was owed).
    paid: balance === 0 && totalAmount !== null && totalAmount > 0,
    emailStatus: str(raw.EmailStatus),
    billEmail: str(raw.BillEmail?.Address),
    currency: str(raw.CurrencyRef?.value),
    customerMemo: str(raw.CustomerMemo?.value),
    privateNote: str(raw.PrivateNote),
    // Only sales-item lines are projected — subtotal/discount/tax
    // pseudo-lines carry no ItemRef and would render as noise rows.
    lines: (raw.Line ?? [])
      .filter((l) => l.DetailType === "SalesItemLineDetail")
      .map(projectInvoiceLine),
    createdAt: str(raw.MetaData?.CreateTime),
    updatedAt: str(raw.MetaData?.LastUpdatedTime),
  };
}

export function projectPayment(
  raw: QuickbooksRawPayment,
): ProjectedQuickbooksPayment {
  const linkedInvoiceIds: string[] = [];
  for (const line of raw.Line ?? []) {
    for (const txn of line.LinkedTxn ?? []) {
      if (txn.TxnType === "Invoice" && typeof txn.TxnId === "string" && txn.TxnId.length > 0) {
        if (!linkedInvoiceIds.includes(txn.TxnId)) linkedInvoiceIds.push(txn.TxnId);
      }
    }
  }
  return {
    paymentId: str(raw.Id),
    customerId: str(raw.CustomerRef?.value),
    customerName: str(raw.CustomerRef?.name),
    totalAmount: num(raw.TotalAmt),
    unappliedAmount: num(raw.UnappliedAmt),
    currency: str(raw.CurrencyRef?.value),
    txnDate: str(raw.TxnDate),
    referenceNumber: str(raw.PaymentRefNum),
    linkedInvoiceIds,
    createdAt: str(raw.MetaData?.CreateTime),
    updatedAt: str(raw.MetaData?.LastUpdatedTime),
  };
}
