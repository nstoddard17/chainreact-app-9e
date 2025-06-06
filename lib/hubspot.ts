interface HubSpotConfig {
  accessToken: string
}

interface HubSpotContact {
  id?: string
  properties: {
    email?: string
    firstname?: string
    lastname?: string
    company?: string
    phone?: string
    [key: string]: any
  }
}

interface HubSpotCompany {
  id?: string
  properties: {
    name?: string
    domain?: string
    industry?: string
    [key: string]: any
  }
}

interface HubSpotDeal {
  id?: string
  properties: {
    dealname?: string
    amount?: string
    dealstage?: string
    closedate?: string
    [key: string]: any
  }
}

class HubSpotClient {
  private accessToken: string
  private baseUrl = "https://api.hubapi.com"

  constructor(config: HubSpotConfig) {
    this.accessToken = config.accessToken
  }

  private async makeRequest(endpoint: string, options: RequestInit = {}) {
    const url = `${this.baseUrl}${endpoint}`
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

  // Contact methods
  async getContacts(limit = 100) {
    return this.makeRequest(`/crm/v3/objects/contacts?limit=${limit}`)
  }

  async getContact(contactId: string) {
    return this.makeRequest(`/crm/v3/objects/contacts/${contactId}`)
  }

  async createContact(contact: HubSpotContact) {
    return this.makeRequest("/crm/v3/objects/contacts", {
      method: "POST",
      body: JSON.stringify(contact),
    })
  }

  async updateContact(contactId: string, contact: Partial<HubSpotContact>) {
    return this.makeRequest(`/crm/v3/objects/contacts/${contactId}`, {
      method: "PATCH",
      body: JSON.stringify(contact),
    })
  }

  // Company methods
  async getCompanies(limit = 100) {
    return this.makeRequest(`/crm/v3/objects/companies?limit=${limit}`)
  }

  async getCompany(companyId: string) {
    return this.makeRequest(`/crm/v3/objects/companies/${companyId}`)
  }

  async createCompany(company: HubSpotCompany) {
    return this.makeRequest("/crm/v3/objects/companies", {
      method: "POST",
      body: JSON.stringify(company),
    })
  }

  async updateCompany(companyId: string, company: Partial<HubSpotCompany>) {
    return this.makeRequest(`/crm/v3/objects/companies/${companyId}`, {
      method: "PATCH",
      body: JSON.stringify(company),
    })
  }

  // Deal methods
  async getDeals(limit = 100) {
    return this.makeRequest(`/crm/v3/objects/deals?limit=${limit}`)
  }

  async getDeal(dealId: string) {
    return this.makeRequest(`/crm/v3/objects/deals/${dealId}`)
  }

  async createDeal(deal: HubSpotDeal) {
    return this.makeRequest("/crm/v3/objects/deals", {
      method: "POST",
      body: JSON.stringify(deal),
    })
  }

  async updateDeal(dealId: string, deal: Partial<HubSpotDeal>) {
    return this.makeRequest(`/crm/v3/objects/deals/${dealId}`, {
      method: "PATCH",
      body: JSON.stringify(deal),
    })
  }
}

export function getHubSpotClient(accessToken: string): HubSpotClient {
  return new HubSpotClient({ accessToken })
}

export type { HubSpotContact, HubSpotCompany, HubSpotDeal }
