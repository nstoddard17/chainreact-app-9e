"use client"

import React, { useEffect, useRef } from 'react';
import { GenericConfiguration } from './GenericConfiguration';

interface TrelloConfigurationProps {
  nodeInfo: any;
  values: Record<string, any>;
  setValue: (field: string, value: any) => void;
  errors: Record<string, string>;
  onSubmit: (values: Record<string, any>) => Promise<void>;
  onCancel: () => void;
  onBack?: () => void;
  isEditMode?: boolean;
  workflowData?: any;
  currentNodeId?: string;
  dynamicOptions: Record<string, any[]>;
  loadingDynamic: boolean;
  loadOptions: (fieldName: string, parentField?: string, parentValue?: any, forceReload?: boolean) => Promise<void>;
  integrationName?: string;
  needsConnection?: boolean;
  onConnectIntegration?: () => void;
  aiFields?: Record<string, boolean>;
  setAiFields?: (fields: Record<string, boolean>) => void;
  isConnectedToAIAgent?: boolean;
  loadingFields?: Set<string>;
}

export function TrelloConfiguration(props: TrelloConfigurationProps) {
  const { values, setValue, dynamicOptions, nodeInfo } = props;
  const hasPrefilledRef = useRef(false);

  // Pre-fill form fields when a card is selected (for Update Card action)
  useEffect(() => {
    if (nodeInfo?.type === 'trello_action_update_card' && values.cardId && !hasPrefilledRef.current) {
      const cardOptions = dynamicOptions?.cardId || [];
      const selectedCard = cardOptions.find((card: any) => card.value === values.cardId);

      if (selectedCard) {
        // Only set fields if they're empty (don't override existing values)
        if (!values.name && selectedCard.name) {
          setValue('name', selectedCard.name);
        }
        if (!values.desc && selectedCard.desc) {
          setValue('desc', selectedCard.desc);
        }
        if (!values.listId && selectedCard.idList) {
          setValue('listId', selectedCard.idList);
        }
        if (values.closed === undefined && selectedCard.closed !== undefined) {
          setValue('closed', selectedCard.closed);
        }
        if (!values.due && selectedCard.due) {
          setValue('due', selectedCard.due);
        }
        if (values.dueComplete === undefined && selectedCard.dueComplete !== undefined) {
          setValue('dueComplete', selectedCard.dueComplete);
        }

        hasPrefilledRef.current = true;
      }
    }

    // Reset flag when card changes
    if (!values.cardId) {
      hasPrefilledRef.current = false;
    }
  }, [values.cardId, dynamicOptions, nodeInfo, values, setValue]);

  return <GenericConfiguration {...props} />;
}