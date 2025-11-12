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

const ENV_SCOPE_KEYS = ["HUBSPOT_OAUTH_SCOPES", "HUBSPOT_SCOPES"] as const;

type EnvScopeKey = (typeof ENV_SCOPE_KEYS)[number];

function parseEnvScopes(raw?: string | null): string[] | null {
  if (!raw) return null;
  const scopes = raw
    .split(/[\s,]+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
  return scopes.length > 0 ? scopes : null;
}

export function getHubSpotScopes(): string[] {
  for (const key of ENV_SCOPE_KEYS) {
    const value = process.env[key as EnvScopeKey];
    const parsed = parseEnvScopes(value);
    if (parsed) {
      return parsed;
    }
  }
  return DEFAULT_HUBSPOT_SCOPES;
}

export function getHubSpotScopeString(): string {
  return getHubSpotScopes().join(" ");
}

export { DEFAULT_HUBSPOT_SCOPES };
