/**
 * Provider Registry
 * Central registry for all provider-specific option loaders
 */

import { ProviderOptionsLoader, ProviderRegistry as IProviderRegistry } from './types';
import { DiscordOptionsLoader } from './discord/discordOptionsLoader';
import { AirtableOptionsLoader } from './airtable/airtableOptionsLoader';
import { FacebookOptionsLoader } from './facebook/facebookOptionsLoader';
import { hubspotOptionsLoader } from './hubspot/hubspotOptionsLoader';
import { onenoteOptionsLoader } from './onenote/optionsLoader';
import { notionOptionsLoader } from './notion/options';
import { GoogleDriveOptionsLoader } from './google-drive/GoogleDriveOptionsLoader';

class ProviderRegistryImpl implements IProviderRegistry {
  private loaders: Map<string, ProviderOptionsLoader[]>;

  constructor() {
    this.loaders = new Map();
    this.registerDefaultLoaders();
  }

  /**
   * Register default provider loaders
   */
  private registerDefaultLoaders(): void {
    // Register Discord loader
    this.register('discord', new DiscordOptionsLoader());
    
    // Register Airtable loader
    this.register('airtable', new AirtableOptionsLoader());
    
    // Register Facebook loader
    this.register('facebook', new FacebookOptionsLoader());
    
    // Register HubSpot loader
    this.register('hubspot', hubspotOptionsLoader);
    
    // Register OneNote loader for both possible provider IDs
    this.register('microsoft-onenote', onenoteOptionsLoader);
    this.register('onenote', onenoteOptionsLoader);
    
    // Register Notion loader
    this.register('notion', notionOptionsLoader);
    
    // Register Google Drive loader
    this.register('google-drive', new GoogleDriveOptionsLoader());
    
    // Additional providers can be registered here as they're implemented
    // this.register('gmail', new GmailOptionsLoader());
    // this.register('google-sheets', new GoogleSheetsOptionsLoader());
    // this.register('slack', new SlackOptionsLoader());
    // this.register('trello', new TrelloOptionsLoader());
  }

  /**
   * Register a loader for a specific provider
   */
  register(providerId: string, loader: ProviderOptionsLoader): void {
    if (!this.loaders.has(providerId)) {
      this.loaders.set(providerId, []);
    }
    
    const providerLoaders = this.loaders.get(providerId)!;
    
    // Check if loader already exists (avoid duplicates)
    const exists = providerLoaders.some(l => 
      l.constructor.name === loader.constructor.name
    );
    
    if (!exists) {
      providerLoaders.push(loader);
      console.log(`✅ [Registry] Registered loader for ${providerId}: ${loader.constructor.name}`);
    }
  }

  /**
   * Get a loader that can handle the specific field for a provider
   */
  getLoader(providerId: string, fieldName: string): ProviderOptionsLoader | null {
    const providerLoaders = this.loaders.get(providerId);
    
    if (!providerLoaders) {
      return null;
    }
    
    // Find the first loader that can handle this field
    for (const loader of providerLoaders) {
      if (loader.canHandle(fieldName, providerId)) {
        return loader;
      }
    }
    
    return null;
  }

  /**
   * Check if there's a loader for the given provider and field
   */
  hasLoader(providerId: string, fieldName: string): boolean {
    return this.getLoader(providerId, fieldName) !== null;
  }

  /**
   * Get all registered provider IDs
   */
  getProviderIds(): string[] {
    return Array.from(this.loaders.keys());
  }

  /**
   * Clear all registered loaders
   */
  clear(): void {
    this.loaders.clear();
  }

  /**
   * Re-initialize with default loaders
   */
  reset(): void {
    this.clear();
    this.registerDefaultLoaders();
  }
}

// Export singleton instance
export const providerRegistry = new ProviderRegistryImpl();

// Export type for dependency injection if needed
export type ProviderRegistry = ProviderRegistryImpl;