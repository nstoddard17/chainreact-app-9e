import { escapeQueryValue, quickbooksRequest } from "./_request";
import { NotFoundError } from "../errors";
import {
  projectCustomer,
  type ProjectedQuickbooksCustomer,
  type QuickbooksRawCustomer,
} from "../projections";

/**
 * Typed Customer API wrappers — QUICKBOOKS-1.
 *
 * Wire format (docs/providers/quickbooks/research.md):
 *   - Create: `POST /v3/company/{realmId}/customer` — requires
 *     `DisplayName` (V2 always sends it; QBO also accepts name
 *     components, but V2's schema makes displayName required so the
 *     record is always findable by name). DisplayName is unique across
 *     Customer/Vendor/Employee — a duplicate surfaces QBO's
 *     ValidationFault (code 6240) through `_request`'s sanitized error.
 *   - Read: `GET /v3/company/{realmId}/customer/{id}`.
 *   - Search: the query endpoint with ONE exact-match predicate
 *     (`PrimaryEmailAddr` / `DisplayName` / `CompanyName`) — QBO's query
 *     language has NO `OR`, so one field per call. Values are escaped
 *     via `escapeQueryValue`; user input never reaches the statement
 *     otherwise. Bounded via `MAXRESULTS`.
 *
 * All wrappers return bounded projections — never raw records.
 */

export interface CustomerCreateInput {
  accessToken: string;
  realmId: string;
  displayName: string;
  companyName?: string;
  givenName?: string;
  familyName?: string;
  email?: string;
  phone?: string;
  billingAddress?: {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  };
  notes?: string;
}

interface CustomerEnvelope {
  Customer?: QuickbooksRawCustomer;
}

interface CustomerQueryEnvelope {
  QueryResponse?: {
    Customer?: QuickbooksRawCustomer[];
  };
}

export async function customerCreate(
  input: CustomerCreateInput,
): Promise<ProjectedQuickbooksCustomer> {
  const body: Record<string, unknown> = {
    DisplayName: input.displayName,
  };
  if (input.companyName) body.CompanyName = input.companyName;
  if (input.givenName) body.GivenName = input.givenName;
  if (input.familyName) body.FamilyName = input.familyName;
  if (input.email) body.PrimaryEmailAddr = { Address: input.email };
  if (input.phone) body.PrimaryPhone = { FreeFormNumber: input.phone };
  if (input.notes) body.Notes = input.notes;
  const addr = input.billingAddress;
  if (
    addr &&
    (addr.line1 || addr.line2 || addr.city || addr.state || addr.postalCode || addr.country)
  ) {
    const billAddr: Record<string, unknown> = {};
    if (addr.line1) billAddr.Line1 = addr.line1;
    if (addr.line2) billAddr.Line2 = addr.line2;
    if (addr.city) billAddr.City = addr.city;
    if (addr.state) billAddr.CountrySubDivisionCode = addr.state;
    if (addr.postalCode) billAddr.PostalCode = addr.postalCode;
    if (addr.country) billAddr.Country = addr.country;
    body.BillAddr = billAddr;
  }

  const res = await quickbooksRequest<CustomerEnvelope>({
    accessToken: input.accessToken,
    realmId: input.realmId,
    method: "POST",
    path: "/customer",
    data: body,
    resourceForNotFound: "customer create endpoint",
  });
  if (!res.Customer) {
    throw new Error("QuickBooks customer create returned no Customer envelope.");
  }
  return projectCustomer(res.Customer);
}

/**
 * Read one customer by id. Returns `null` when QBO answers 404 — the
 * action layer maps that to `found: false` (friendly lookup semantics).
 */
export async function customerGet(input: {
  accessToken: string;
  realmId: string;
  customerId: string;
}): Promise<ProjectedQuickbooksCustomer | null> {
  try {
    const res = await quickbooksRequest<CustomerEnvelope>({
      accessToken: input.accessToken,
      realmId: input.realmId,
      method: "GET",
      path: `/customer/${encodeURIComponent(input.customerId)}`,
      resourceForNotFound: `customer ${input.customerId}`,
    });
    return res.Customer ? projectCustomer(res.Customer) : null;
  } catch (err) {
    if (err instanceof NotFoundError) return null;
    throw err;
  }
}

export type CustomerSearchField = "email" | "displayName" | "companyName";

const SEARCH_FIELD_TO_QBO: Record<CustomerSearchField, string> = {
  email: "PrimaryEmailAddr",
  displayName: "DisplayName",
  companyName: "CompanyName",
};

/**
 * Exact-match search on ONE field (QBO query language has no OR).
 * Bounded to `maxResults` (caller keeps it ≤10 for find_customer, ≤100
 * for the option source's list-all mode when `value` is null).
 */
export async function customerSearch(input: {
  accessToken: string;
  realmId: string;
  field: CustomerSearchField;
  value: string;
  maxResults: number;
}): Promise<ProjectedQuickbooksCustomer[]> {
  const column = SEARCH_FIELD_TO_QBO[input.field];
  const statement = `select * from Customer where ${column} = '${escapeQueryValue(input.value)}' MAXRESULTS ${Math.trunc(input.maxResults)}`;
  const res = await quickbooksRequest<CustomerQueryEnvelope>({
    accessToken: input.accessToken,
    realmId: input.realmId,
    method: "GET",
    path: "/query",
    query: new URLSearchParams({ query: statement }),
    resourceForNotFound: "customer query",
  });
  return (res.QueryResponse?.Customer ?? []).map(projectCustomer);
}

/** Longest search term forwarded to QuickBooks (bounds the statement). */
export const CUSTOMER_SEARCH_MAX_LENGTH = 100;

export interface CustomerListInput {
  accessToken: string;
  realmId: string;
  /** Page size, 1..100 (QuickBooks' own MAXRESULTS ceiling is 1000). */
  maxResults: number;
  /**
   * Optional case-insensitive CONTAINS search on `DisplayName`. Live-certified
   * (QUICKBOOKS-INVOICES-INTEGRATION-RESOLVER-1): `LIKE '%term%'` is accepted,
   * is case-insensitive, and matches interior substrings — not just prefixes.
   * The term is escaped via `escapeQueryValue`, so a quote-bearing term stays
   * a literal and can never break out into query syntax.
   */
  search?: string;
  /** 1-based offset (QuickBooks STARTPOSITION). Defaults to 1. */
  startPosition?: number;
}

export interface CustomerListPage {
  items: ProjectedQuickbooksCustomer[];
  /**
   * True when the page came back full — QuickBooks' query response carries no
   * total, so a full page is the honest "there may be more" signal.
   */
  hasMore: boolean;
  /** STARTPOSITION for the next page (only meaningful when hasMore). */
  nextStartPosition: number;
}

/**
 * Active customers for the option source (names-only labels upstream).
 *
 * `ORDERBY DisplayName` is the deterministic paging order; STARTPOSITION over
 * Customer is live-certified to page without overlap. `%` and `_` are LIKE
 * wildcards, so they are neutralised in the user's term — a customer literally
 * named "50% Co" is searched for as text, not as a pattern.
 */
export async function customerList(
  input: CustomerListInput,
): Promise<CustomerListPage> {
  const predicates = ["Active = true"];
  const term = (input.search ?? "").trim().slice(0, CUSTOMER_SEARCH_MAX_LENGTH);
  if (term.length > 0) {
    const escaped = escapeQueryValue(term).replace(/[%_]/g, "\\$&");
    predicates.push(`DisplayName LIKE '%${escaped}%'`);
  }
  const startPosition = Math.max(1, Math.trunc(input.startPosition ?? 1));
  const maxResults = Math.trunc(input.maxResults);
  const statement = `select * from Customer where ${predicates.join(" and ")} ORDERBY DisplayName STARTPOSITION ${startPosition} MAXRESULTS ${maxResults}`;

  const res = await quickbooksRequest<CustomerQueryEnvelope>({
    accessToken: input.accessToken,
    realmId: input.realmId,
    method: "GET",
    path: "/query",
    query: new URLSearchParams({ query: statement }),
    resourceForNotFound: "customer query",
  });
  const items = (res.QueryResponse?.Customer ?? []).map(projectCustomer);
  return {
    items,
    hasMore: items.length === maxResults,
    nextStartPosition: startPosition + items.length,
  };
}

/**
 * Resolve specific customers by stable id — the label backfill for a value a
 * picker already holds (a saved selection) that is not in the current page.
 * `Id IN (…)` is live-certified. Bounded by the caller's id list; inactive
 * customers resolve too, so a saved selection still shows its name.
 */
export async function customersByIds(input: {
  accessToken: string;
  realmId: string;
  ids: readonly string[];
}): Promise<ProjectedQuickbooksCustomer[]> {
  if (input.ids.length === 0) return [];
  const inList = input.ids
    .map((id) => `'${escapeQueryValue(id)}'`)
    .join(",");
  const statement = `select * from Customer where Id in (${inList}) MAXRESULTS ${input.ids.length}`;
  const res = await quickbooksRequest<CustomerQueryEnvelope>({
    accessToken: input.accessToken,
    realmId: input.realmId,
    method: "GET",
    path: "/query",
    query: new URLSearchParams({ query: statement }),
    resourceForNotFound: "customer query",
  });
  return (res.QueryResponse?.Customer ?? []).map(projectCustomer);
}
