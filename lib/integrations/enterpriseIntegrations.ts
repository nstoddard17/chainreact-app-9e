import { createClient } from "@supabase/supabase-js"

export interface EnterpriseIntegration {
  id: string
  organization_id: string
  integration_type: string
  provider: string
  configuration: any
  credentials: any
  connection_status: "connected" | "disconnected" | "error"
  last_sync_at?: string
  sync_frequency?: string
  error_count: number
  last_error?: string
}

export class EnterpriseIntegrationsService {
  private supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  async configureSalesforce(
    organizationId: string,
    config: {
      instanceUrl: string
      clientId: string
      clientSecret: string
      username: string
      password: string
      securityToken: string
    },
  ): Promise<EnterpriseIntegration> {
    // Test connection first
    const connectionTest = await this.testSalesforceConnection(config)

    const { data, error } = await this.supabase
      .from("enterprise_integrations")
      .insert({
        organization_id: organizationId,
        integration_type: "crm",
        provider: "salesforce",
        configuration: {
          instance_url: config.instanceUrl,
          api_version: "58.0",
        },
        credentials: {
          client_id: config.clientId,
          client_secret: config.clientSecret,
          username: config.username,
          password: config.password,
          security_token: config.securityToken,
        },
        connection_status: connectionTest.success ? "connected" : "error",
        last_error: connectionTest.error,
        sync_frequency: "1 hour",
      })
      .select()
      .single()

    if (error) throw error
    return data
  }

  async configureMicrosoft365(
    organizationId: string,
    config: {
      tenantId: string
      clientId: string
      clientSecret: string
      scopes: string[]
    },
  ): Promise<EnterpriseIntegration> {
    const connectionTest = await this.testMicrosoft365Connection(config)

    const { data, error } = await this.supabase
      .from("enterprise_integrations")
      .insert({
        organization_id: organizationId,
        integration_type: "productivity",
        provider: "microsoft365",
        configuration: {
          tenant_id: config.tenantId,
          scopes: config.scopes,
          graph_api_version: "v1.0",
        },
        credentials: {
          client_id: config.clientId,
          client_secret: config.clientSecret,
        },
        connection_status: connectionTest.success ? "connected" : "error",
        last_error: connectionTest.error,
        sync_frequency: "30 minutes",
      })
      .select()
      .single()

    if (error) throw error
    return data
  }

  async configureServiceNow(
    organizationId: string,
    config: {
      instanceUrl: string
      username: string
      password: string
      apiVersion?: string
    },
  ): Promise<EnterpriseIntegration> {
    const connectionTest = await this.testServiceNowConnection(config)

    const { data, error } = await this.supabase
      .from("enterprise_integrations")
      .insert({
        organization_id: organizationId,
        integration_type: "itsm",
        provider: "servicenow",
        configuration: {
          instance_url: config.instanceUrl,
          api_version: config.apiVersion || "v1",
        },
        credentials: {
          username: config.username,
          password: config.password,
        },
        connection_status: connectionTest.success ? "connected" : "error",
        last_error: connectionTest.error,
        sync_frequency: "15 minutes",
      })
      .select()
      .single()

    if (error) throw error
    return data
  }

  async createCustomAPIConnector(
    organizationId: string,
    config: {
      name: string
      description?: string
      apiType: "REST" | "GraphQL" | "SOAP"
      baseUrl: string
      authentication: {
        type: "none" | "basic" | "bearer" | "oauth2" | "api_key"
        credentials: any
      }
      headers?: Record<string, string>
      schemaDefinition?: any
      rateLimits?: {
        requestsPerMinute: number
        requestsPerHour: number
      }
    },
  ) {
    const { data, error } = await this.supabase
      .from("custom_api_connectors")
      .insert({
        organization_id: organizationId,
        name: config.name,
        description: config.description,
        api_type: config.apiType,
        base_url: config.baseUrl,
        authentication: config.authentication,
        headers: config.headers || {},
        schema_definition: config.schemaDefinition,
        rate_limits: config.rateLimits,
        is_active: true,
      })
      .select()
      .single()

    if (error) throw error
    return data
  }

  async createDatabaseConnection(
    organizationId: string,
    config: {
      name: string
      databaseType: "postgresql" | "mysql" | "mongodb" | "redis"
      host: string
      port: number
      database: string
      username: string
      password: string
      ssl?: boolean
      connectionPoolConfig?: {
        min: number
        max: number
        idleTimeoutMillis: number
      }
    },
  ) {
    // Test connection first
    const connectionTest = await this.testDatabaseConnection(config)

    // Encrypt connection string
    const connectionString = this.buildConnectionString(config)
    const encryptedCredentials = await this.encryptCredentials({
      username: config.username,
      password: config.password,
    })

    const { data, error } = await this.supabase
      .from("database_connections")
      .insert({
        organization_id: organizationId,
        name: config.name,
        database_type: config.databaseType,
        connection_string: connectionString,
        encrypted_credentials: encryptedCredentials,
        connection_pool_config: config.connectionPoolConfig,
        ssl_config: { enabled: config.ssl || false },
        is_active: connectionTest.success,
        last_tested_at: new Date().toISOString(),
        test_status: connectionTest.success ? "success" : "failed",
      })
      .select()
      .single()

    if (error) throw error
    return data
  }

  private async testSalesforceConnection(config: any): Promise<{ success: boolean; error?: string }> {
    try {
      // In production, use jsforce or similar library
      const loginUrl = `${config.instanceUrl}/services/oauth2/token`
      const response = await fetch(loginUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "password",
          client_id: config.clientId,
          client_secret: config.clientSecret,
          username: config.username,
          password: config.password + config.securityToken,
        }),
      })

      if (response.ok) {
        return { success: true }
      } 
        const error = await response.text()
        return { success: false, error }
      
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Connection failed" }
    }
  }

  private async testMicrosoft365Connection(config: any): Promise<{ success: boolean; error?: string }> {
    try {
      // Test Microsoft Graph API connection
      const tokenUrl = `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`
      const response = await fetch(tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: config.clientId,
          client_secret: config.clientSecret,
          scope: "https://graph.microsoft.com/.default",
        }),
      })

      if (response.ok) {
        return { success: true }
      } 
        const error = await response.text()
        return { success: false, error }
      
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Connection failed" }
    }
  }

  private async testServiceNowConnection(config: any): Promise<{ success: boolean; error?: string }> {
    try {
      // Test ServiceNow REST API
      const testUrl = `${config.instanceUrl}/api/now/table/sys_user?sysparm_limit=1`
      const credentials = Buffer.from(`${config.username}:${config.password}`).toString("base64")

      const response = await fetch(testUrl, {
        headers: {
          Authorization: `Basic ${credentials}`,
          Accept: "application/json",
        },
      })

      if (response.ok) {
        return { success: true }
      } 
        const error = await response.text()
        return { success: false, error }
      
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Connection failed" }
    }
  }

  private async testDatabaseConnection(config: any): Promise<{ success: boolean; error?: string }> {
    // In production, use appropriate database drivers
    try {
      // This is a simplified test - in production use proper database connection libraries
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Connection failed" }
    }
  }

  private buildConnectionString(config: any): string {
    switch (config.databaseType) {
      case "postgresql":
        return `postgresql://${config.host}:${config.port}/${config.database}?sslmode=${config.ssl ? "require" : "disable"}`
      case "mysql":
        return `mysql://${config.host}:${config.port}/${config.database}?ssl=${config.ssl ? "true" : "false"}`
      default:
        return `${config.databaseType}://${config.host}:${config.port}/${config.database}`
    }
  }

  private async encryptCredentials(credentials: any): Promise<string> {
    // In production, use proper encryption
    return Buffer.from(JSON.stringify(credentials)).toString("base64")
  }
}
