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

/** Active customers for the option source (names-only labels upstream). */
export async function customerList(input: {
  accessToken: string;
  realmId: string;
  maxResults: number;
}): Promise<ProjectedQuickbooksCustomer[]> {
  const statement = `select * from Customer where Active = true ORDERBY DisplayName MAXRESULTS ${Math.trunc(input.maxResults)}`;
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
