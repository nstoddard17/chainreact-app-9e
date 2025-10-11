import { NodeComponent, NodeField, ConfigField } from "@/lib/workflows/nodes"

/**
 * Common configuration modal props interface
 */
export interface ConfigurationModalProps {
  isOpen: boolean;
  onClose: (wasSaved?: boolean) => void;
  onSave: (config: Record<string, any>) => void | Promise<void>;
  onBack?: () => void;
  nodeInfo: NodeComponent | null;
  integrationName: string;
  initialData?: Record<string, any>;
  workflowData?: { 
    nodes: any[]; 
    edges: any[];
    id?: string;
    name?: string | null;
  };
  currentNodeId?: string;
  nodeTitle?: string | null;
}

/**
 * Form data and state management props
 */
export interface ConfigFormProps {
  nodeInfo: NodeComponent | null;
  initialData: Record<string, any>;
  onSubmit: (config: Record<string, any>) => void;
  onCancel: () => void;
  onBack?: () => void;
  workflowData?: { 
    nodes: any[]; 
    edges: any[]; 
    id?: string;
    name?: string | null;
  };
  currentNodeId?: string;
  integrationName: string;
}

/**
 * Field rendering props
 */
export interface FieldProps {
  field: ConfigField | NodeField;
  value: any;
  onChange: (value: any) => void;
  error?: string;
  workflowData?: { 
    nodes: any[]; 
    edges: any[]; 
    id?: string;
    name?: string | null;
  };
  currentNodeId?: string;
  dynamicOptions?: Record<string, { value: string; label: string; fields?: any[]; isExisting?: boolean }[]>;
  loadingDynamic?: boolean;
  onDynamicLoad?: (fieldName: string, dependentValues?: Record<string, any>) => Promise<void>;
}

/**
 * Dynamic options types
 */
export interface DynamicOption {
  value: string;
  label: string;
  fields?: any[];
  isExisting?: boolean;
}

export interface DynamicOptionsState {
  [key: string]: DynamicOption[];
}

/**
 * Form state types
 */
export interface FormState {
  values: Record<string, any>;
  errors: Record<string, string>;
  touched: Record<string, boolean>;
  isValid: boolean;
  isDirty: boolean;
}

export type FormAction = 
  | { type: 'SET_VALUE'; field: string; value: any }
  | { type: 'SET_VALUES'; values: Record<string, any> }
  | { type: 'SET_ERROR'; field: string; error: string }
  | { type: 'CLEAR_ERROR'; field: string }
  | { type: 'SET_TOUCHED'; field: string }
  | { type: 'RESET'; values: Record<string, any> }
  | { type: 'VALIDATE' };

/**
 * Test data types
 */
export interface TestResult {
  success: boolean;
  data: any;
  error?: string;
  timestamp: number;
}

/**
 * Integration-specific types
 */
export interface SlackPlanInfo {
  canCreatePrivateChannel: boolean;
  isEnterprise: boolean;
  error?: string;
}

export interface DiscordBotStatus {
  isInGuild: boolean;
  hasPermissions: boolean;
  error?: string;
}
