import { quickbooksRequest } from "./_request";

/**
 * Typed catalog reads (Item / Term / TaxCode) — QUICKBOOKS-1.
 *
 * Backing data for the option sources only — none of these are
 * user-facing actions. Each is one bounded query (active records only)
 * projected to `{ id, name }` pairs; nothing else from the records is
 * surfaced (Item carries pricing/account internals that stay behind
 * this boundary).
 */

export interface QuickbooksCatalogEntry {
  id: string;
  name: string;
}

interface CatalogQueryEnvelope {
  QueryResponse?: {
    Item?: Array<{ Id?: string; Name?: string | null; Type?: string | null }>;
    Term?: Array<{ Id?: string; Name?: string | null }>;
    TaxCode?: Array<{ Id?: string; Name?: string | null }>;
  };
}

async function runCatalogQuery(input: {
  accessToken: string;
  realmId: string;
  statement: string;
  resource: string;
}): Promise<CatalogQueryEnvelope> {
  return quickbooksRequest<CatalogQueryEnvelope>({
    accessToken: input.accessToken,
    realmId: input.realmId,
    method: "GET",
    path: "/query",
    query: new URLSearchParams({ query: input.statement }),
    resourceForNotFound: input.resource,
  });
}

function toEntries(
  rows: ReadonlyArray<{ Id?: string; Name?: string | null }> | undefined,
): QuickbooksCatalogEntry[] {
  const entries: QuickbooksCatalogEntry[] = [];
  for (const row of rows ?? []) {
    if (typeof row.Id === "string" && row.Id.length > 0) {
      entries.push({
        id: row.Id,
        name:
          typeof row.Name === "string" && row.Name.length > 0 ? row.Name : row.Id,
      });
    }
  }
  return entries;
}

/**
 * Invoice-able items: Service / Inventory / NonInventory (excludes
 * Category / Group internals). Backs `quickbooks:items`.
 */
export async function itemList(input: {
  accessToken: string;
  realmId: string;
  maxResults: number;
}): Promise<QuickbooksCatalogEntry[]> {
  const res = await runCatalogQuery({
    accessToken: input.accessToken,
    realmId: input.realmId,
    statement: `select Id, Name, Type from Item where Active = true and Type in ('Service', 'Inventory', 'NonInventory') ORDERBY Name MAXRESULTS ${Math.trunc(input.maxResults)}`,
    resource: "item query",
  });
  return toEntries(res.QueryResponse?.Item);
}

/** Active sales terms. Backs `quickbooks:terms`. */
export async function termList(input: {
  accessToken: string;
  realmId: string;
  maxResults: number;
}): Promise<QuickbooksCatalogEntry[]> {
  const res = await runCatalogQuery({
    accessToken: input.accessToken,
    realmId: input.realmId,
    statement: `select Id, Name from Term where Active = true ORDERBY Name MAXRESULTS ${Math.trunc(input.maxResults)}`,
    resource: "term query",
  });
  return toEntries(res.QueryResponse?.Term);
}

/** Active tax codes. Backs `quickbooks:tax_codes`. */
export async function taxCodeList(input: {
  accessToken: string;
  realmId: string;
  maxResults: number;
}): Promise<QuickbooksCatalogEntry[]> {
  const res = await runCatalogQuery({
    accessToken: input.accessToken,
    realmId: input.realmId,
    statement: `select Id, Name from TaxCode where Active = true ORDERBY Name MAXRESULTS ${Math.trunc(input.maxResults)}`,
    resource: "tax code query",
  });
  return toEntries(res.QueryResponse?.TaxCode);
}
