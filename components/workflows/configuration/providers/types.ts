/**
 * Provider Options Loader Types
 * Common interfaces for all provider-specific option loaders
 */

export interface LoadOptionsParams {
  fieldName: string;
  nodeType: string;
  providerId: string;
  integrationId?: string;
  dependsOn?: string;
  dependsOnValue?: any;
  forceRefresh?: boolean;
  extraOptions?: Record<string, any>;
  formValues?: Record<string, any>;
  signal?: AbortSignal;
}

export interface FormattedOption {
  value: string;
  label: string;
  [key: string]: any; // Additional properties specific to the provider
}

export interface ProviderOptionsLoader {
  /**
   * Check if this loader can handle the given field
   */
  canHandle(fieldName: string, providerId: string): boolean;

  /**
   * Load options for the field
   */
  loadOptions(params: LoadOptionsParams): Promise<FormattedOption[]>;

  /**
   * Format raw data into options (optional - can use common formatters)
   */
  formatOptions?(data: any[]): FormattedOption[];

  /**
   * Get required dependencies for a field (optional)
   */
  getFieldDependencies?(fieldName: string): string[];

  /**
   * Clear any provider-specific cache (optional)
   */
  clearCache?(): void;
}

export interface ProviderRegistry {
  register(providerId: string, loader: ProviderOptionsLoader): void;
  getLoader(providerId: string, fieldName: string): ProviderOptionsLoader | null;
  hasLoader(providerId: string, fieldName: string): boolean;
}