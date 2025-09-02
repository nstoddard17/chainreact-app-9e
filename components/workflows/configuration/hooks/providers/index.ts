/**
 * Provider-specific field change handler hooks
 * 
 * These hooks encapsulate the field dependency logic for each provider,
 * making it easier to maintain and test provider-specific behavior.
 */

export { useAirtableFieldHandler } from './useAirtableFieldHandler';
export { useDiscordFieldHandler } from './useDiscordFieldHandler';
export { useGoogleSheetsFieldHandler } from './useGoogleSheetsFieldHandler';