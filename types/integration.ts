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
