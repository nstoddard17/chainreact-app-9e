interface HubSpotConfig {
  accessToken: string
  refreshToken?: string
  clientId?: string
  clientSecret?: string
}

export class HubSpotClient {
  private config: HubSpotConfig

  constructor(config: HubSpotConfig) {
    this.config = config
  }

  async makeRequest(endpoint: string, options: RequestInit = {}) {
    const url = `https://api.hubapi.com${endpoint}`

    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.config.accessToken}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    })

    if (!response.ok) {
      throw new Error(`HubSpot API error: ${response.status} ${response.statusText}`)
    }

    return response.json()
  }

  async getContacts(limit = 100) {
    return this.makeRequest(`/crm/v3/objects/contacts?limit=${limit}`)
  }

  async createContact(properties: Record<string, any>) {
    return this.makeRequest("/crm/v3/objects/contacts", {
      method: "POST",
      body: JSON.stringify({ properties }),
    })
  }

  async getCompanies(limit = 100) {
    return this.makeRequest(`/crm/v3/objects/companies?limit=${limit}`)
  }

  async createCompany(properties: Record<string, any>) {
    return this.makeRequest("/crm/v3/objects/companies", {
      method: "POST",
      body: JSON.stringify({ properties }),
    })
  }

  async getDeals(limit = 100) {
    return this.makeRequest(`/crm/v3/objects/deals?limit=${limit}`)
  }

  async createDeal(properties: Record<string, any>) {
    return this.makeRequest("/crm/v3/objects/deals", {
      method: "POST",
      body: JSON.stringify({ properties }),
    })
  }
}

export function getHubSpotClient(accessToken: string, refreshToken?: string): HubSpotClient {
  return new HubSpotClient({
    accessToken,
    refreshToken,
    clientId: process.env.NEXT_PUBLIC_HUBSPOT_CLIENT_ID,
    clientSecret: process.env.HUBSPOT_CLIENT_SECRET,
  })
}
