/**
 * Standard props for all configuration provider components.
 *
 * IMPORTANT: All configuration providers MUST use ConfigurationContainer
 * to ensure content stays within the left column.
 *
 * @example
 * ```tsx
 * import { ConfigurationContainer } from '../components/ConfigurationContainer';
 * import type { BaseConfigurationProps } from '../types/configuration-props';
 *
 * export function YourConfiguration(props: BaseConfigurationProps) {
 *   return (
 *     <ConfigurationContainer
 *       onSubmit={props.onSubmit}
 *       onCancel={props.onCancel}
 *       onBack={props.onBack}
 *       isEditMode={props.isEditMode}
 *     >
 *       {/* Your content */}
 *     </ConfigurationContainer>
 *   );
 * }
 * ```
 */
export interface BaseConfigurationProps {
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

/**
 * DO NOT USE THIS TYPE - Use ConfigurationContainer instead
 * @deprecated ScrollArea causes overflow issues
 */
export interface DEPRECATED_ScrollAreaConfig {
  _DO_NOT_USE: 'Use ConfigurationContainer instead of ScrollArea';
}