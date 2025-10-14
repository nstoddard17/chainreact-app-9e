import { useState, useCallback } from 'react';
import { useIntegrationStore } from '@/stores/integrationStore';

import { logger } from '@/lib/utils/logger'

interface UseAirtableStateProps {
  nodeInfo: any;
  values: Record<string, any>;
}

export function useAirtableState({ nodeInfo, values }: UseAirtableStateProps) {
  const [selectedRecord, setSelectedRecord] = useState<any>(null);
  const [airtableRecords, setAirtableRecords] = useState<any[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [airtableTableSchema, setAirtableTableSchema] = useState<any>(null);
  const [isLoadingTableSchema, setIsLoadingTableSchema] = useState(false);
  const [tableSearchQuery, setTableSearchQuery] = useState('');
  const [tableDisplayCount, setTableDisplayCount] = useState(10);
  const [showRecordsTable, setShowRecordsTable] = useState(false);
  
  const { getIntegrationByProvider } = useIntegrationStore();
  
  // Check if this is an Airtable record action
  const isUpdateRecord = nodeInfo?.providerId === 'airtable' && nodeInfo?.type === 'airtable_action_update_record';
  const isCreateRecord = nodeInfo?.providerId === 'airtable' && nodeInfo?.type === 'airtable_action_create_record';
  const isAirtableRecordAction = isUpdateRecord || isCreateRecord;
  
  // Load Airtable records for the selected table
  const loadAirtableRecords = useCallback(async (baseId: string, tableName: string) => {
    try {
      setLoadingRecords(true);
      
      // Ensure table schema is loaded first (for linked field name mappings)
      if (!airtableTableSchema || airtableTableSchema.table?.name !== tableName) {
        logger.debug('🔍 Loading table schema before records');
        await fetchAirtableTableSchema(baseId, tableName);
      }
      
      const integration = getIntegrationByProvider('airtable');
      if (!integration) {
        logger.warn('No Airtable integration found');
        return;
      }

      logger.debug('🔍 Loading Airtable records:', { baseId, tableName });
      
      // Call the Airtable-specific data API endpoint
      const response = await fetch('/api/integrations/airtable/data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          integrationId: integration.id,
          dataType: 'records',
          params: {
            baseId,
            tableName,
            maxRecords: 100,
            view: 'Grid view'
          }
        })
      });

      if (!response.ok) {
        const error = await response.text();
        logger.error('Failed to load records:', error);
        throw new Error(`Failed to load records: ${error}`);
      }

      const data = await response.json();
      logger.debug('✅ Loaded', data.length, 'records');
      
      setAirtableRecords(data || []);
      setShowRecordsTable(true);
    } catch (error) {
      logger.error('Error loading Airtable records:', error);
      setAirtableRecords([]);
    } finally {
      setLoadingRecords(false);
    }
  }, [airtableTableSchema, getIntegrationByProvider]);
  
  // Fetch Airtable table schema
  const fetchAirtableTableSchema = useCallback(async (baseId: string, tableName: string) => {
    try {
      setIsLoadingTableSchema(true);
      
      const integration = getIntegrationByProvider('airtable');
      if (!integration) {
        logger.warn('No Airtable integration found');
        return;
      }

      logger.debug('🔍 Fetching Airtable table schema:', { baseId, tableName });
      
      const response = await fetch('/api/integrations/airtable/data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          integrationId: integration.id,
          dataType: 'table_schema',
          params: {
            baseId,
            tableName
          }
        })
      });

      if (!response.ok) {
        const error = await response.text();
        logger.error('Failed to fetch table schema:', error);
        return;
      }

      const data = await response.json();
      logger.debug('✅ Fetched table schema:', data);
      
      setAirtableTableSchema(data);
      return data;
    } catch (error) {
      logger.error('Error fetching table schema:', error);
      setAirtableTableSchema(null);
    } finally {
      setIsLoadingTableSchema(false);
    }
  }, [getIntegrationByProvider]);
  
  // Handle record selection
  const handleRecordSelect = useCallback((record: any) => {
    setSelectedRecord(record);
    // You can add additional logic here to update form values
  }, []);
  
  // Handle table toggle
  const handleToggleTable = useCallback(() => {
    if (showRecordsTable) {
      setShowRecordsTable(false);
      setAirtableRecords([]);
      setTableSearchQuery('');
    } else if (values.baseId && values.tableName) {
      loadAirtableRecords(values.baseId, values.tableName);
    }
  }, [showRecordsTable, values.baseId, values.tableName, loadAirtableRecords]);
  
  return {
    // State
    selectedRecord,
    airtableRecords,
    loadingRecords,
    airtableTableSchema,
    isLoadingTableSchema,
    tableSearchQuery,
    tableDisplayCount,
    showRecordsTable,
    isUpdateRecord,
    isCreateRecord,
    isAirtableRecordAction,
    
    // Actions
    setSelectedRecord,
    setAirtableRecords,
    setTableSearchQuery,
    setTableDisplayCount,
    setShowRecordsTable,
    loadAirtableRecords,
    fetchAirtableTableSchema,
    handleRecordSelect,
    handleToggleTable
  };
}