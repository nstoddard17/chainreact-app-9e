export interface Integration {
  id: string;
  user_id: string;
  provider: string;
  access_token: string;
  refresh_token: string | null;
  status: 'active' | 'needs_reauthorization' | 'error' | string;
  scopes?: string;
  expires_at?: string;
  refresh_token_expires_at?: string;
  created_at: string;
  updated_at: string;
  last_token_refresh?: string;
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