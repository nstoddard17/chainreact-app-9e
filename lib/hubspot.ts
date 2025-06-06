interface HubSpotConfig {
  accessToken: string
  refreshToken?: string
  expiresAt?: number
}

export class HubSpotClient {
  private accessToken: string
  private refreshToken?: string
  private expiresAt?: number

  constructor(config: HubSpotConfig) {
    this.accessToken = config.accessToken
    this.refreshToken = config.refreshToken
    this.expiresAt = config.expiresAt
  }

  async makeRequest(endpoint: string, options: RequestInit = {}) {
    const url = `https://api.hubapi.com${endpoint}`

    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    })

    if (!response.ok) {
      throw new Error(`HubSpot API error: ${response.status} ${response.statusText}`)
    }

    return response.json()
  }

  async getContacts() {
    return this.makeRequest("/crm/v3/objects/contacts")
  }

  async createContact(properties: Record<string, any>) {
    return this.makeRequest("/crm/v3/objects/contacts", {
      method: "POST",
      body: JSON.stringify({ properties }),
    })
  }

  async getCompanies() {
    return this.makeRequest("/crm/v3/objects/companies")
  }

  async createCompany(properties: Record<string, any>) {
    return this.makeRequest("/crm/v3/objects/companies", {
      method: "POST",
      body: JSON.stringify({ properties }),
    })
  }

  async getDeals() {
    return this.makeRequest("/crm/v3/objects/deals")
  }

  async createDeal(properties: Record<string, any>) {
    return this.makeRequest("/crm/v3/objects/deals", {
      method: "POST",
      body: JSON.stringify({ properties }),
    })
  }
}

export function getHubSpotClient(config: HubSpotConfig): HubSpotClient {
  return new HubSpotClient(config)
}
