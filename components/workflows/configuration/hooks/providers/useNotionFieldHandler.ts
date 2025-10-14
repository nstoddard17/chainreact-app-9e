import { useCallback } from 'react';

import { logger } from '@/lib/utils/logger'

interface UseNotionFieldHandlerProps {
  nodeInfo: any;
  values: Record<string, any>;
  setValue: (fieldName: string, value: any) => void;
  loadOptions: (fieldName: string, dependsOn?: string, dependsOnValue?: any, forceReload?: boolean) => Promise<void>;
  setLoadingFields: (setter: any) => void;
  resetOptions: (fieldName: string) => void;
  dynamicOptions?: Record<string, any[]>;
}

/**
 * Handle Notion-specific field changes
 * Manages dependencies between Notion fields like page/database selection and title population
 */
export function useNotionFieldHandler({
  nodeInfo,
  values,
  setValue,
  loadOptions,
  setLoadingFields,
  resetOptions,
  dynamicOptions
}: UseNotionFieldHandlerProps) {

  /**
   * Auto-populate title when page is selected for update operation
   */
  const handlePageSelection = useCallback((value: any) => {
    if (values.operation === 'update' && value) {
      logger.debug('🔍 [Notion] Page selected for update, loading title...');

      // Look for the selected page in dynamic options
      setTimeout(() => {
        const pages = dynamicOptions?.page || [];
        logger.debug('🔍 [Notion] Looking for page in options:', { value, pages });
        const selectedPage = pages.find((p: any) => p.value === value);

        if (selectedPage) {
          const title = selectedPage.label || selectedPage.title || selectedPage.name;
          logger.debug('✅ [Notion] Setting title from selected page:', title);
          setValue('title', title);
        }
      }, 100);
    }
  }, [values.operation, dynamicOptions, setValue]);

  /**
   * Auto-populate title and description when database is selected for update_database operation
   */
  const handleDatabaseSelection = useCallback(async (value: any) => {
    logger.debug('🔍 [Notion] handleDatabaseSelection called with:', { value, operation: values.operation });

    // Check for both 'update_database' and 'update' since the dropdown shows "Update Database"
    if ((values.operation === 'update_database' || values.operation === 'update') && value) {
      logger.debug('🔍 [Notion] Database selected for update operation:', value);
      logger.debug('🔍 [Notion] Current dynamic options:', dynamicOptions);

      // Try multiple times with delays to ensure options are loaded
      const attempts = [0, 100, 500, 1000];

      for (const delay of attempts) {
        await new Promise(resolve => setTimeout(resolve, delay));

        const databases = dynamicOptions?.database || [];
        logger.debug(`🔍 [Notion] Attempt after ${delay}ms - Available databases:`, databases);

        const selectedDatabase = databases.find((db: any) => db.value === value);

        if (selectedDatabase) {
          const title = selectedDatabase.label || selectedDatabase.title || selectedDatabase.name;
          logger.debug('✅ [Notion] Found database, setting title:', title);
          setValue('title', title);

          // Also set description if it exists on the database object
          if (selectedDatabase.description) {
            setValue('description', selectedDatabase.description);
          }

          // Found it, we're done
          return;
        }
      }

      // If still not found after all attempts, try API
      logger.debug('⚠️ [Notion] Database not found in options after multiple attempts, trying API');

      try {
        const response = await fetch('/api/integrations/notion/data', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            integrationId: values.integrationId || nodeInfo?.integrationId || nodeInfo?.providerId,
            dataType: 'database_metadata',
            options: {
              databaseId: value
            }
          })
        });

        if (response.ok) {
          const result = await response.json();
          const metadata = result.data || {};

          logger.debug('✅ [Notion] Database metadata from API:', metadata);

          // Set title from metadata
          if (metadata.title) {
            logger.debug('✅ [Notion] Setting title from API metadata:', metadata.title);
            setValue('title', metadata.title);
          }

          // Set description if available
          if (metadata.description) {
            logger.debug('✅ [Notion] Setting description from API metadata:', metadata.description);
            setValue('description', metadata.description);
          }
        }
      } catch (error) {
        logger.error('❌ [Notion] Error loading database metadata:', error);
      }
    } else if ((values.operation === 'update_database' || values.operation === 'update') && !value) {
      // Clear title and description when database is deselected
      logger.debug('🔍 [Notion] Clearing title and description - no database selected');
      setValue('title', '');
      setValue('description', '');
    }
  }, [values.operation, values.integrationId, dynamicOptions, nodeInfo, setValue]);

  /**
   * Main Notion field change handler
   */
  const handleFieldChange = useCallback(async (fieldName: string, value: any): Promise<boolean> => {
    logger.debug('🚀 [NotionFieldHandler] Called with:', {
      fieldName,
      value,
      provider: nodeInfo?.providerId,
      operation: values.operation
    });

    // Only handle Notion provider
    if (nodeInfo?.providerId !== 'notion') {
      logger.debug('❌ [NotionFieldHandler] Not Notion provider, skipping');
      return false;
    }

    logger.debug('✅ [NotionFieldHandler] Processing Notion field change:', { fieldName, value, operation: values.operation });

    // Handle page selection for update operation
    if (fieldName === 'page') {
      logger.debug('📄 [NotionFieldHandler] Handling page selection');
      handlePageSelection(value);
      return true;
    }

    // Handle database selection for update_database operation
    if (fieldName === 'database') {
      logger.debug('🗄️ [NotionFieldHandler] Handling database selection');
      await handleDatabaseSelection(value);
      return true;
    }

    // Handle workspace changes - clear dependent fields
    if (fieldName === 'workspace') {
      logger.debug('🔍 [Notion] Workspace changed, clearing dependent fields');

      // Clear all dependent fields
      setValue('page', '');
      setValue('database', '');
      setValue('title', '');
      setValue('description', '');
      setValue('content', '');
      setValue('userId', '');

      // Clear cached options for dependent fields
      resetOptions('page');
      resetOptions('database');
      resetOptions('userId');

      // Load pages/databases based on current operation
      if (value) {
        // The auto-loading is handled by NotionConfiguration component's useEffects
        logger.debug('🔍 [Notion] Workspace selected, auto-loading will trigger from NotionConfiguration');
      }

      return true;
    }

    // Handle operation changes - clear relevant fields
    if (fieldName === 'operation') {
      logger.debug('🔍 [Notion] Operation changed to:', value);

      // Clear fields that might not be relevant for the new operation
      setValue('title', '');
      setValue('description', '');
      setValue('content', '');
      setValue('userId', '');

      // Clear cached options
      resetOptions('userId');

      // Auto-load users when "Get User Details" is selected
      if (value === 'get' && nodeInfo?.type === 'notion_action_manage_users' && values.workspace) {
        logger.debug('🔍 [Notion] Auto-loading users for Get User Details operation');

        // Set loading state
        setLoadingFields(prev => {
          const newSet = new Set(prev);
          newSet.add('userId');
          return newSet;
        });

        // Load users for the selected workspace
        setTimeout(() => {
          loadOptions('userId', 'workspace', values.workspace, true).finally(() => {
            setLoadingFields(prev => {
              const newSet = new Set(prev);
              newSet.delete('userId');
              return newSet;
            });
          });
        }, 10);
      }

      // The visibility conditions will handle showing/hiding fields
      return true;
    }

    return false;
  }, [nodeInfo, values, handlePageSelection, handleDatabaseSelection, setValue, resetOptions, loadOptions, setLoadingFields]);

  return {
    handleFieldChange
  };
}