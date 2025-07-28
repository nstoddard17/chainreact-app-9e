export interface Integration {
  id: string;
  user_id: string;
  provider: string;
  access_token: string | null;
  refresh_token?: string | null;
  status: "connected" | "disconnected" | "expired" | "needs_reauthorization";
  scopes?: string;
  expires_at?: string | null;
  refresh_token_expires_at?: string | null;
  scope?: string | null;
  created_at: string;
  updated_at: string;
  last_token_refresh?: string | null;
  disconnect_reason?: string | null;
  [key: string]: any; // Allow for additional fields
}

export interface RefreshResult {
  success: boolean;
  accessToken?: string;
  refreshToken?: string;
  accessTokenExpiresIn?: number;
  refreshTokenExpiresIn?: number;
  error?: string;
  invalidRefreshToken?: boolean;
}

// API Request/Response Types
export interface FetchUserDataRequest {
  integrationId: string
  dataType: string
  options?: Record<string, any>
}

export interface FetchUserDataResponse {
  success: boolean
  data?: any[]
  error?: {
    message: string
    details?: string
    provider?: string
    dataType?: string
  }
}

// Discord-specific types
export interface DiscordGuild {
  id: string
  name: string
  value: string
  icon: string | null
  owner: boolean
  permissions: string
}

export interface DiscordChannel {
  id: string
  name: string
  type: number
  guild_id?: string
  parent_id?: string
}

// Environment variable validation
export interface DiscordBotConfig {
  clientId: string
  clientSecret: string
  botToken: string
}

// Integration validation
export interface IntegrationValidation {
  success: boolean
  token?: string
  error?: string
  needsReauthorization?: boolean
}
