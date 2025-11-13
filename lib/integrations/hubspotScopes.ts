const DEFAULT_HUBSPOT_SCOPES = [
  "oauth",
  "forms",
  "automation",
  "crm.lists.read",
  "crm.lists.write",
  "crm.objects.contacts.read",
  "crm.objects.contacts.write",
  "crm.objects.companies.read",
  "crm.objects.companies.write",
  "crm.objects.deals.read",
  "crm.objects.deals.write",
  "crm.objects.line_items.read",
  "crm.objects.line_items.write",
  "crm.objects.owners.read",
  "crm.objects.products.read",
  "crm.objects.products.write",
  "crm.schemas.deals.read",
  "tickets",
];

export function getHubSpotScopes(): string[] {
  return DEFAULT_HUBSPOT_SCOPES;
}

export function getHubSpotScopeString(): string {
  return getHubSpotScopes().join(" ");
}

export { DEFAULT_HUBSPOT_SCOPES };
